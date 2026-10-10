/* =========================================================
   FichaFlow — cuentas (correo + contraseña, vía Supabase Auth)
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
  const PUBLISHED_URL = "https://fichamakerapp.github.io/FichaFlow/";
  function redirectUrl() {
    if (window.location.protocol === "file:") return PUBLISHED_URL;
    return window.location.origin + window.location.pathname;
  }

  const MIN_PASSWORD = 6; // Supabase's own default minimum

  let currentUser = null;
  let booted = false;

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

    const app = document.getElementById("app");
    app.innerHTML = "";
    app.appendChild(h("div", { class: "auth-screen" }, [
      h("div", { class: "auth-card" }, [
        h("div", { class: "auth-brand" }, [
          h("div", { class: "name", text: "FichaFlow" }),
          h("div", { class: "sub", text: "Análisis de propiedades" }),
        ]),
        h("h1", { class: "auth-title", text: opts.title }),
        opts.intro ? h("p", { class: "auth-intro", text: opts.intro }) : null,
        form,
        opts.footer ? h("div", { class: "auth-footer" }, opts.footer) : null,
      ]),
    ]));
    const first = form.querySelector("input");
    if (first && !first.value) first.focus();
  }

  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

  function showSignIn(email) {
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
        linkBtn("Crear cuenta", function () { showSignUp(emailEl.value.trim()); }),
      ],
    });
  }

  function showSignUp(email) {
    const emailEl = emailInput(email);
    const passEl = passwordInput("new-password");
    const pass2El = passwordInput("new-password");
    card({
      title: "Crear cuenta",
      intro: "Tus documentos y diseños quedan guardados en tu cuenta y los puedes abrir desde cualquier dispositivo.",
      fields: [
        field("Correo", emailEl),
        field("Contraseña (mínimo " + MIN_PASSWORD + " caracteres)", passEl),
        field("Repite la contraseña", pass2El),
      ],
      submitText: "Crear cuenta",
      validate: function () {
        if (!validEmail(emailEl.value.trim())) return "Escribe un correo válido.";
        if (passEl.value.length < MIN_PASSWORD) return "La contraseña debe tener al menos " + MIN_PASSWORD + " caracteres.";
        if (passEl.value !== pass2El.value) return "Las contraseñas no coinciden.";
        return "";
      },
      onSubmit: function () {
        return auth.signUp({
          email: emailEl.value.trim(),
          password: passEl.value,
          options: { emailRedirectTo: redirectUrl() },
        }).then(function (res) {
          if (res.error) throw res.error;
          // With "Confirm email" on, Supabase returns no session until the
          // link is opened. With it off, SIGNED_IN fires and boots the app.
          if (!res.data.session) {
            return "¡Listo! Te enviamos un correo a " + emailEl.value.trim() + ". Abre el enlace para confirmar tu cuenta y luego inicia sesión.";
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
          bootOnce();
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

  // Calls `ready(user)` exactly once, as soon as there's a signed-in
  // session (right away if one was already stored in this browser).
  function start(ready) {
    onReady = ready;
    let recovering = Sync.passwordRecovery;
    auth.onAuthStateChange(function (event, session) {
      currentUser = session ? session.user : null;
      if (event === "PASSWORD_RECOVERY") recovering = true;
      if (event === "SIGNED_OUT") {
        if (booted) window.location.reload();
        else showSignIn();
        return;
      }
      if (!session) {
        // INITIAL_SESSION with nothing stored — or a recovery link that
        // had already expired, in which case the person just starts over.
        if (event === "INITIAL_SESSION") showSignIn();
        return;
      }
      if (recovering) {
        // Fire-and-forget the screen from inside the callback: Supabase
        // holds an internal lock while it runs, and updateUser() (the
        // next step) waits on that same lock.
        recovering = false;
        setTimeout(showNewPassword, 0);
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") setTimeout(bootOnce, 0);
    });
  }

  function signOut() {
    return auth.signOut().then(function (res) {
      if (res && res.error) throw res.error;
    });
  }

  window.Auth = {
    start: start,
    signOut: signOut,
    currentEmail: function () { return currentUser ? currentUser.email : ""; },
  };
})();
