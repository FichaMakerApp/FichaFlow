(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    const app = document.getElementById("app");
    app.innerHTML = '<div class="boot-loading">Cargando tu documento…</div>';
    Store.init().then(function () {
      App.render();
      const failed = Store.getLibraryMigrationFailures();
      if (failed.length) {
        const names = failed.map(function (f) { return (f.ficha && f.ficha.desarrollo) || "sin nombre"; }).join(", ");
        UI.toast("⚠ " + failed.length + " página(s) de tu biblioteca local no se pudieron subir a la compartida (probablemente muy pesadas): " + names + ". Se van a reintentar la próxima vez que abras la app.", 6000);
      }
    }).catch(function (e) {
      console.error("No se pudo iniciar FichaFlow.", e);
      app.innerHTML = '<div class="boot-loading">No se pudo cargar el documento. Intenta recargar la página (F5). Si el problema sigue, avísale a quien te dio la app.</div>';
    });
  });
})();
