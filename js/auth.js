/* =========================================================
   propentia — cuentas (correo + contraseña, vía Supabase Auth)
   Gate in front of the whole app: main.js only boots the editor
   once Auth.start() hands it a signed-in session. Until then this
   draws its own screen (iniciar sesión / crear cuenta / recuperar
   contraseña / nueva contraseña) straight into #app.

   Signing out reloads the page instead of tearing the editor down
   by hand — every module keeps its own in-memory state, and a
   fresh load is the only reliable way to drop all of it.
   ========================================================= */
(function () {
  "use strict";
  const h = FichaRender.h;
  const auth = Sync.client.auth;

  // Password-reset emails link back here. Opened straight from disk
  // (file://) there's no address an email could link to, so those
  // point at the published copy instead.
  const PUBLISHED_URL = "https://propentia-app.github.io/propentia/";
  function redirectUrl() {
    if (window.location.protocol === "file:") return PUBLISHED_URL;
    return window.location.origin + window.location.pathname;
  }

  const MIN_PASSWORD = 6; // Supabase's own default minimum

  let currentUser = null;
  let booted = false;
  let profile = null;        // estado de la cuenta: { status, is_admin, nombre }
  let forced = false;        // la pantalla de "nueva contraseña" no se puede cerrar
  let pendingReason = "";    // por qué se pide la cuenta ("Inicia sesión para guardar…")

  function closeAuth() {
    const o = document.getElementById("auth-overlay");
    if (o) o.remove();
    pendingReason = "";
  }

  // Supabase errors come back in English; translate the ones a person
  // can actually hit from this screen, by code first (stable) and by
  // message as a fallback for older error shapes.
  function friendlyError(err) {
    const code = (err && err.code) || "";
    const msg = ((err && err.message) || "").toLowerCase();
    if (code === "invalid_credentials" || msg.indexOf("invalid login credentials") !== -1) return "Correo o contraseña incorrectos.";
    if (code === "email_not_confirmed" || msg.indexOf("email not confirmed") !== -1) return "Todavía no confirmas tu correo. Abre el enlace que te enviamos y vuelve a intentarlo.";
    if (code === "user_already_exists" || msg.indexOf("already registered") !== -1) return "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.";
    if (code === "weak_password" || msg.indexOf("password should be") !== -1) return "La contraseña es muy débil. Usa al menos " + MIN_PASSWORD + " caracteres.";
    if (code === "same_password") return "La nueva contraseña debe ser distinta a la anterior.";
    if (code === "email_address_invalid" || msg.indexOf("invalid format") !== -1) return "Ese correo no es válido.";
    if (code === "signup_disabled") return "Por ahora no se están aceptando cuentas nuevas.";
    if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || msg.indexOf("rate limit") !== -1) return "Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.";
    if (msg.indexOf("failed to fetch") !== -1 || msg.indexOf("network") !== -1) return "No hay conexión a internet. Revisa tu conexión y vuelve a intentarlo.";
    return "Algo salió mal: " + ((err && err.message) || "error desconocido") + ".";
  }

  function field(label, input) {
    return h("label", { class: "field" }, [h("span", { class: "field-label", text: label }), input]);
  }

  function emailInput(value) {
    const el = h("input", { class: "input", type: "email", autocomplete: "email", required: "required", placeholder: "tucorreo@ejemplo.com" });
    if (value) el.value = value;
    return el;
  }

  function passwordInput(autocomplete) {
    return h("input", { class: "input", type: "password", autocomplete: autocomplete, required: "required", minlength: String(MIN_PASSWORD) });
  }

  function linkBtn(text, onClick) {
    const b = h("button", { type: "button", class: "auth-link", text: text });
    b.addEventListener("click", onClick);
    return b;
  }

  // One card layout shared by every screen. `fields` go inside a real
  // <form> so Enter submits and password managers recognize it.
  function card(opts) {
    const msg = h("p", { class: "auth-msg", role: "status", "aria-live": "polite" });
    const submit = h("button", { type: "submit", class: "btn btn-standout auth-submit", text: opts.submitText });
    const form = h("form", { class: "auth-form", novalidate: "novalidate" }, opts.fields.concat([msg, submit]));

    function show(text, kind) {
      msg.textContent = text || "";
      msg.className = "auth-msg" + (kind ? " " + kind : "");
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const problem = opts.validate ? opts.validate() : "";
      if (problem) { show(problem, "error"); return; }
      submit.disabled = true;
      show("Un momento…");
      Promise.resolve().then(opts.onSubmit).then(function (okText) {
        submit.disabled = false;
        show(okText || "", okText ? "ok" : "");
      }).catch(function (err) {
        submit.disabled = false;
        show(friendlyError(err), "error");
      });
    });

    let overlay = document.getElementById("auth-overlay");
    if (!overlay) {
      overlay = h("div", { id: "auth-overlay", class: "auth-screen auth-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Acceso a Propentia" });
      document.body.appendChild(overlay);
      overlay.addEventListener("click", function (e) { if (e.target === overlay && !forced) closeAuth(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !forced) closeAuth(); });
    }
    overlay.innerHTML = "";
    const closeBtn = h("button", { type: "button", class: "auth-close", "aria-label": "Cerrar", title: "Cerrar", text: "×" });
    closeBtn.addEventListener("click", closeAuth);
    overlay.appendChild(h("div", { class: "auth-card" }, [
      forced ? null : closeBtn,
      h("div", { class: "auth-brand" }, [
        h("div", { class: "brand-lockup", role: "img", "aria-label": "Propentia" }, [
          h("span", { class: "brand-nt" }, [h("i")]),
          h("span", { class: "brand-word" }),
        ]),
        h("div", { class: "sub", text: "Tus proyectos, bien presentados." }),
      ]),
      pendingReason ? h("p", { class: "auth-reason", text: pendingReason }) : null,
      h("h1", { class: "auth-title", text: opts.title }),
      opts.intro ? h("p", { class: "auth-intro", text: opts.intro }) : null,
      form,
      opts.footer ? h("div", { class: "auth-footer" }, opts.footer) : null,
    ]));
    const first = form.querySelector("input");
    if (first && !first.value) first.focus();
  }

  // Se muestra cuando alguien con sesión pero sin aprobar intenta crear o guardar algo.
  function showPending() {
    const st = profile ? profile.status : "pending";
    const texts = {
      pending: ["Tu cuenta está en revisión", "Recibimos tu solicitud. Las cuentas se aprueban a mano; en cuanto la aprobemos podrás crear, guardar y descargar. Mientras tanto puedes recorrer toda la app."],
      rejected: ["Tu solicitud no fue aprobada", "Por ahora no pudimos aprobar tu cuenta. Si crees que es un error, escribe a quien te compartió la app."],
      suspended: ["Tu cuenta está suspendida", "El acceso de esta cuenta está pausado. Si crees que es un error, escribe a quien te compartió la app."],
    };
    const t = texts[st] || texts.pending;
    card({
      title: t[0],
      intro: t[1],
      fields: [],
      submitText: st === "pending" ? "Ya me aprobaron: revisar de nuevo" : "Revisar de nuevo",
      onSubmit: function () { window.location.reload(); },
      footer: [linkBtn("Cerrar sesión", function () { signOut(); })],
    });
  }

  // Carga el estado de la cuenta (aprobada, pendiente…). Si no se puede verificar, no se da acceso.
  function loadProfile() {
    if (!currentUser) { profile = null; return Promise.resolve(null); }
    return Sync.getMyProfileRemote().then(function (p) { profile = p; return p; })
      .catch(function () { profile = { status: "pending", is_admin: false, nombre: "", unverified: true }; return profile; });
  }

  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function showSignIn(email, reason) {
    if (reason !== undefined) pendingReason = reason;
    const emailEl = emailInput(email);
    const passEl = passwordInput("current-password");
    card({
      title: "Iniciar sesión",
      fields: [field("Correo", emailEl), field("Contraseña", passEl)],
      submitText: "Entrar",
      validate: function () {
        if (!validEmail(emailEl.value.trim())) return "Escribe un correo válido.";
        if (!passEl.value) return "Escribe tu contraseña.";
        return "";
      },
      onSubmit: function () {
        // Success lands in onAuthStateChange (SIGNED_IN), which boots the app.
        return auth.signInWithPassword({ email: emailEl.value.trim(), password: passEl.value }).then(function (res) {
          if (res.error) throw res.error;
        });
      },
      footer: [
        linkBtn("¿Olvidaste tu contraseña?", function () { showForgot(emailEl.value.trim()); }),
        h("span", { class: "auth-sep", text: "·" }),
        linkBtn("Solicitar cuenta", function () { showSignUp(emailEl.value.trim()); }),
      ],
    });
  }

  function showSignUp(email) {
    const emailEl = emailInput(email);
    const nombreEl = h("input", { class: "input", type: "text", autocomplete: "name", required: "required", placeholder: "Nombre y apellido" });
    const empresaEl = h("input", { class: "input", type: "text", autocomplete: "organization", placeholder: "Inmobiliaria o empresa (si aplica)" });
    const telEl = h("input", { class: "input", type: "tel", autocomplete: "tel", required: "required", placeholder: "WhatsApp o teléfono" });
    const passEl = passwordInput("new-password");
    const pass2El = passwordInput("new-password");
    card({
      title: "Solicitar cuenta",
      intro: "Las cuentas se aprueban a mano para cuidar la calidad de la comunidad. Cuéntanos quién eres y la revisamos. Tus proyectos y documentos solo los ves tú, salvo lo que decidas compartir.",
      fields: [
        field("Nombre", nombreEl),
        field("Inmobiliaria o empresa (opcional)", empresaEl),
        field("WhatsApp o teléfono (solo para validar tu solicitud)", telEl),
        field("Correo", emailEl),
        field("Contraseña (mínimo " + MIN_PASSWORD + " caracteres)", passEl),
        field("Repite la contraseña", pass2El),
      ],
      submitText: "Enviar solicitud",
      validate: function () {
        if (nombreEl.value.trim().length < 3) return "Escribe tu nombre y apellido.";
        if (telEl.value.replace(/\D/g, "").length < 8) return "Escribe un teléfono o WhatsApp válido.";
        if (!validEmail(emailEl.value.trim())) return "Escribe un correo válido.";
        if (passEl.value.length < MIN_PASSWORD) return "La contraseña debe tener al menos " + MIN_PASSWORD + " caracteres.";
        if (passEl.value !== pass2El.value) return "Las contraseñas no coinciden.";
        return "";
      },
      onSubmit: function () {
        return auth.signUp({
          email: emailEl.value.trim(),
          password: passEl.value,
          options: {
            emailRedirectTo: redirectUrl(),
            data: { nombre: nombreEl.value.trim(), empresa: empresaEl.value.trim(), telefono: telEl.value.trim() },
          },
        }).then(function (res) {
          if (res.error) throw res.error;
          // With "Confirm email" on, Supabase returns no session until the
          // link is opened. With it off, SIGNED_IN fires and boots the app.
          if (!res.data.session) {
            return "¡Listo! Te enviamos un correo a " + emailEl.value.trim() + ". Abre el enlace para confirmar tu correo y luego inicia sesión. Después revisaremos tu solicitud y podrás empezar a crear en cuanto la aprobemos.";
          }
        });
      },
      footer: [
        h("span", { class: "auth-muted", text: "¿Ya tienes cuenta?" }),
        linkBtn("Iniciar sesión", function () { showSignIn(emailEl.value.trim()); }),
      ],
    });
  }

  function showForgot(email) {
    const emailEl = emailInput(email);
    card({
      title: "Recuperar contraseña",
      intro: "Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.",
      fields: [field("Correo", emailEl)],
      submitText: "Enviar enlace",
      validate: function () {
        return validEmail(emailEl.value.trim()) ? "" : "Escribe un correo válido.";
      },
      onSubmit: function () {
        return auth.resetPasswordForEmail(emailEl.value.trim(), { redirectTo: redirectUrl() }).then(function (res) {
          if (res.error) throw res.error;
          // Same message whether or not the account exists — Supabase
          // doesn't say, and neither should this screen.
          return "Si existe una cuenta con ese correo, te llegará un enlace en unos minutos. Revisa también tu carpeta de spam.";
        });
      },
      footer: [linkBtn("← Volver a iniciar sesión", function () { showSignIn(emailEl.value.trim()); })],
    });
  }

  // Reached from the password-reset email: Supabase has already signed
  // the person in with a short-lived recovery session; they only need
  // to pick the new password before going on to the app.
  function showNewPassword() {
    forced = true;
    const passEl = passwordInput("new-password");
    const pass2El = passwordInput("new-password");
    card({
      title: "Nueva contraseña",
      intro: currentUser && currentUser.email ? "Cuenta: " + currentUser.email : "",
      fields: [
        field("Nueva contraseña (mínimo " + MIN_PASSWORD + " caracteres)", passEl),
        field("Repite la contraseña", pass2El),
      ],
      submitText: "Guardar contraseña",
      validate: function () {
        if (passEl.value.length < MIN_PASSWORD) return "La contraseña debe tener al menos " + MIN_PASSWORD + " caracteres.";
        if (passEl.value !== pass2El.value) return "Las contraseñas no coinciden.";
        return "";
      },
      onSubmit: function () {
        return auth.updateUser({ password: passEl.value }).then(function (res) {
          if (res.error) throw res.error;
          forced = false;
          history.replaceState(null, "", window.location.pathname);
          window.location.reload();
        });
      },
    });
  }

  let onReady = null;
  function bootOnce() {
    if (booted || !onReady) return;
    booted = true;
    onReady(currentUser);
  }

  // Arranca la app UNA vez, con o sin sesión: sin sesión se puede ver todo,
  // pero crear o usar algo pide la cuenta (Auth.require). Al iniciar sesión
  // desde la ventana de acceso, la página se recarga con la sesión ya guardada.
  function start(ready) {
    onReady = ready;
    let recovering = Sync.passwordRecovery;
    auth.onAuthStateChange(function (event, session) {
      const had = !!currentUser;
      currentUser = session ? session.user : null;
      if (event === "PASSWORD_RECOVERY") recovering = true;
      if (event === "SIGNED_OUT") {
        if (booted) window.location.reload();
        return;
      }
      if (recovering && session) {
        // Fire-and-forget desde el callback: Supabase mantiene un candado
        // interno mientras corre, y updateUser() (el paso siguiente) espera ese mismo candado.
        recovering = false;
        setTimeout(function () { bootOnce(); showNewPassword(); }, 0);
        return;
      }
      if (event === "INITIAL_SESSION") { setTimeout(bootOnce, 0); return; }
      if (event === "SIGNED_IN" && booted && !had) window.location.reload();
    });
  }

  // true si hay sesión; si no, abre la ventana de acceso explicando por qué y devuelve false.
  function require(reason) {
    if (currentUser) {
      if (profile && profile.status !== "approved") { showPending(); return false; }
      return true;
    }
    showSignIn("", reason || "Inicia sesión o crea tu cuenta para continuar.");
    return false;
  }

  function signOut() {
    return auth.signOut().then(function (res) {
      if (res && res.error) throw res.error;
    });
  }

  window.Auth = {
    start: start,
    require: require,
    isSignedIn: function () { return !!currentUser; },
    loadProfile: loadProfile,
    canWork: function () { return !!currentUser && (!profile || profile.status === "approved"); },
    isAdmin: function () { return !!(currentUser && profile && profile.is_admin && profile.status === "approved"); },
    status: function () { return currentUser ? (profile ? profile.status : "approved") : "guest"; },
    openSignIn: function () { showSignIn("", ""); },
    openSignUp: function () { showSignUp(""); },
    signOut: signOut,
    currentEmail: function () { return currentUser ? currentUser.email : ""; },
    currentId: function () { return currentUser ? currentUser.id : ""; },
  };
})();
