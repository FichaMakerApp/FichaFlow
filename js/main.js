(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    const app = document.getElementById("app");
    app.innerHTML = '<div class="boot-loading">Cargando tu documento…</div>';
    Store.init().then(function () {
      App.render();
    }).catch(function (e) {
      console.error("No se pudo iniciar FichaFlow.", e);
      app.innerHTML = '<div class="boot-loading">No se pudo cargar el documento. Intenta recargar la página (F5). Si el problema sigue, avísale a quien te dio la app.</div>';
    });
  });
})();
