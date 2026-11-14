(function () {
  "use strict";
  document.addEventListener("DOMContentLoaded", function () {
    const app = document.getElementById("app");
    app.innerHTML = '<div class="boot-loading">Cargando…</div>';
    // Nada de lo de abajo corre hasta que haya una sesión iniciada (js/auth.js):
    // Store.init() ya lee el diseño predeterminado propio de esa cuenta.
    Auth.start(function () {
      app.innerHTML = '<div class="boot-loading">Cargando tu espacio…</div>';
      Auth.loadProfile().then(function () {
        // La marca se lee antes de iniciar: los documentos nuevos salen con ella.
        if (!Auth.canWork()) return null;
        return Sync.getBrandRemote().catch(function () { return { unavailable: true }; });
      }).then(function (brand) {
        Store.setBrand(brand);
        window.__brandAtBoot = brand;
        return Store.init();
      }).then(function () {
        App.render();
        if (App.afterBoot) App.afterBoot();
      }).catch(function (e) {
        console.error("No se pudo iniciar Propentia.", e);
        app.innerHTML = '<div class="boot-loading">No se pudo cargar tu espacio. Intenta recargar la página (F5). Si el problema sigue, avísale a quien te dio la app.</div>';
      });
    });
  });
})();
