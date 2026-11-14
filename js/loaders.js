/* =========================================================
   Propentia — animaciones de carga (solo piezas reales de la marca)
   · boot():      la ola se dibuja y termina en su punto terracota (al abrir la app, sin texto)
   · progress():  la ola como barra de avance con conteo real (carga de la biblioteca)
   · busy():      tres puntos, el último en terracota (botones y cargas cortas)
   ========================================================= */
(function () {
  "use strict";
  const WAVE = "M379.6 296C442.9 262 495.6 330 569.5 296S685.5 262 738.2 296";
  const VB = "365 243 430 106";

  function waveSvg(cls, style) {
    return '<svg class="ld-wave ' + (cls || "") + '" viewBox="' + VB + '" aria-hidden="true"' + (style ? ' style="' + style + '"' : "") + ">" +
      '<path class="track" d="' + WAVE + '" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"/>' +
      '<path class="w" d="' + WAVE + '" pathLength="1" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"/>' +
      '<circle class="dot" cx="767.7" cy="296" r="13"/></svg>';
  }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  window.Loaders = {
    waveSvg: waveSvg,
    // Pantalla de arranque: solo la animación (el texto va oculto, para lectores de pantalla).
    boot: function () {
      return '<div class="ld-boot" role="status" aria-label="Cargando">' + waveSvg("ld-draw") + "</div>";
    },
    // Tres puntos sueltos (cargas cortas dentro de una pantalla).
    dots: function (label) {
      return '<span class="ld-dots" role="status" aria-label="' + esc(label || "Cargando") + '"><i></i><i></i><i></i></span>';
    },
    // Barra de avance con la ola. Con total conocido muestra «Van X de N»; sin total, la ola fluye.
    progress: function (loaded, total, what, sub) {
      const known = total > 0;
      const p = known ? Math.max(0, Math.min(1, loaded / total)) : 0;
      const msg = known ? "Van " + loaded + " de " + total + " " + what : "Cargando " + (what === "proyectos" ? "tu biblioteca" : "tus " + what) + "…";
      return '<div class="ld-prog" role="status" aria-live="polite">' +
        waveSvg(known ? "ld-bar" : "ld-flow", known ? "--off:" + (1 - p) + ";--dot:" + (p >= 1 ? 1 : 0) : "") +
        '<p class="ld-msg">' + esc(msg) + "</p>" + (sub ? '<p class="ld-sub">' + esc(sub) + "</p>" : "") + "</div>";
    },
    // Botón ocupado: su texto se oculta y salen los tres puntos. busy(btn, false) lo devuelve a la normalidad.
    busy: function (btn, on) {
      if (!btn) return;
      if (on) {
        if (btn.classList.contains("busy")) return;
        btn.classList.add("busy");
        btn.setAttribute("aria-busy", "true");
        const d = document.createElement("span");
        d.className = "ld-dots btn-dots";
        d.setAttribute("aria-hidden", "true");
        d.innerHTML = "<i></i><i></i><i></i>";
        btn.appendChild(d);
      } else {
        btn.classList.remove("busy");
        btn.removeAttribute("aria-busy");
        const d = btn.querySelector(".btn-dots");
        if (d) d.remove();
      }
    },
  };
})();
