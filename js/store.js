/* =========================================================
   FichaFlow — data model + store
   Plain client-side state. No build step, no backend:
   everything persists to localStorage. Use "Exportar respaldo"
   in the review step to save a JSON backup off the browser.
   ========================================================= */
(function () {
  "use strict";

  const LS_DOC = "fichaflow.document.v1";
  const LS_LIB = "fichaflow.library.v1";
  const LS_DESIGN = "fichaflow.defaultDesign.v1";

  const DEFAULT_LEGAL = "IMÁGENES ÚNICAMENTE ILUSTRATIVAS, LA PROPIEDAD PUEDE NO INCLUIR LO MOSTRADO EN ELLAS. LOS PRECIOS E IMÁGENES AQUÍ MOSTRADAS PUEDEN CAMBIAR SIN PREVIO AVISO Y ESTÁN SUJETOS A DISPONIBILIDAD. EL TIPO DE CAMBIO PUEDE VARIAR SEGÚN LA COMPRA DE DIVISAS.";

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  // ---------- factories ----------
  function defaultPagoRow(pct, concepto, momento) {
    return { id: uid(), pct: pct, concepto: concepto, momento: momento };
  }

  function defaultGaleriaItem() {
    return { id: uid(), src: null, titulo: "", posX: 50, posY: 50 };
  }

  // Fixed 4-slot mosaic: 1 wide image on top, 3 in a row below. The count
  // is not user-configurable on purpose — always exactly these 4 slots.
  function defaultGaleria() {
    return [defaultGaleriaItem(), defaultGaleriaItem(), defaultGaleriaItem(), defaultGaleriaItem()];
  }

  function defaultTextStyle() {
    return { sizeDelta: 0, bold: true, italic: false, strike: false };
  }

  function defaultModelo(n) {
    return {
      id: uid(),
      nombre: n === 1 ? "MODELO 1" : "MODELO " + n,
      superficieM2: "",
      etiquetaSuperficie: "CONSTRUCCIÓN",
      habitaciones: "",
      banos: "",
      precioBase: "",
      plano: null, // dataURL
      mostrarShowroom: false,
      showroomEnlace: "",
      showroomTexto: "Showroom",
      mostrarTablaNivel: false,
      niveles: [
        { id: uid(), nombre: "PLANTA BAJA", precio: "" },
      ],
      pagos: {
        tipo: "preventa", // 'preventa' | 'entrega_inmediata'
        textoContado: "PAGO DE CONTADO O CRÉDITO HIPOTECARIO",
        filas: [
          defaultPagoRow(30, "ENGANCHE", "AL FIRMAR"),
          defaultPagoRow(70, "SALDO A LA ENTREGA", "CON CRÉDITO HIPOTECARIO"),
        ],
      },
    };
  }

  function defaultBoton(texto) {
    return { texto: texto, enlace: "", visible: true, color: "#AE9479", estilo: defaultTextStyle() };
  }

  // ---------- default design (a personal template, not tied to any one document) ----------
  // "Modo diseñador" edits a ficha's/document's style fields directly — this
  // lets you save the CURRENT look as your own baseline, so every new ficha
  // and every new document starts from it instead of the plain factory
  // colors/sizes. It lives in its own localStorage key, separate from any
  // document, so it survives "Nuevo documento" and applies across the board.
  const FICHA_DESIGN_FIELDS = [
    "escalas", "estiloModeloNombre", "estiloModeloPrecio", "estiloModeloPrecioSub", "estiloModeloSpecs",
    "colorPrecioBadge", "estiloPrecioBadge", "colorPagoHead", "estiloPagoHead",
    "colorShowroom", "estiloShowroom", "estiloTitulo", "estiloEyebrow", "estiloFranja", "estiloPagoMonto", "estiloPagoMontoSub",
  ];
  const GLOBAL_DESIGN_FIELDS = [
    "paperColor", "paperImage", "textScale", "fontFamily",
    "estiloHeaderTitulo", "estiloHeaderPara", "estiloHeaderElaboradoPor",
  ];

  function loadDefaultDesign() {
    try {
      const raw = localStorage.getItem(LS_DESIGN);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveDefaultDesign(doc, ficha) {
    const design = { estilosGlobales: {}, ficha: {}, botones: [] };
    GLOBAL_DESIGN_FIELDS.forEach(function (k) { design.estilosGlobales[k] = doc.estilosGlobales[k]; });
    FICHA_DESIGN_FIELDS.forEach(function (k) { design.ficha[k] = ficha[k]; });
    // Botones vary in count/order per ficha — save by label so a saved
    // "BROCHURE" style always finds its way back onto a new "BROCHURE".
    (ficha.botones || []).forEach(function (b) {
      design.botones.push({ texto: b.texto, color: b.color, estilo: b.estilo });
    });
    try {
      localStorage.setItem(LS_DESIGN, JSON.stringify(design));
    } catch (e) {
      console.error("No se pudo guardar el diseño predeterminado.", e);
    }
    return design;
  }

  function resetDefaultDesign() {
    try { localStorage.removeItem(LS_DESIGN); } catch (e) {}
  }

  // Deep-clones each saved field onto the target so callers never share a
  // reference back into the stored design (each ficha/document needs its
  // own independent copy to edit).
  function applyDesignFields(target, saved, keys) {
    if (!saved) return;
    keys.forEach(function (k) {
      if (saved[k] !== undefined) target[k] = JSON.parse(JSON.stringify(saved[k]));
    });
  }

  function defaultFicha() {
    const f = {
      id: uid(),
      desarrollo: "",
      tipoPropiedad: "",
      ciudad: "",
      entrega: "",
      moneda: "MXN", // 'MXN' | 'USD'
      mostrarConversion: true,
      modelos: [defaultModelo(1)],
      // Shared by every modelo in this ficha — adjusting one applies to all.
      escalas: { plano: 100, specs: 100, pago: 100 },
      estiloModeloNombre: defaultTextStyle(),
      estiloModeloPrecio: defaultTextStyle(),
      estiloModeloPrecioSub: defaultTextStyle(),
      estiloModeloSpecs: defaultTextStyle(),
      colorPrecioBadge: "#AE9479",
      estiloPrecioBadge: defaultTextStyle(),
      colorPagoHead: "#AE9479",
      estiloPagoHead: defaultTextStyle(),
      colorShowroom: "#AE9479",
      estiloShowroom: defaultTextStyle(),
      franjaActiva: false,
      franjaTexto: "",
      estiloTitulo: defaultTextStyle(),
      estiloEyebrow: defaultTextStyle(),
      estiloFranja: defaultTextStyle(),
      estiloPagoMonto: defaultTextStyle(),
      estiloPagoMontoSub: defaultTextStyle(),
      botones: [
        defaultBoton("BROCHURE"),
        defaultBoton("RENDERS"),
        defaultBoton("UBICACIÓN"),
      ],
      galeria: defaultGaleria(), // fixed 4 slots: [0] is the main wide image, [1..3] the row below
      pinNombre: "",
      avisoLegal: DEFAULT_LEGAL,
      gastosCierre: { activo: false, monto: "" },
    };
    const saved = loadDefaultDesign();
    if (saved) {
      applyDesignFields(f, saved.ficha, FICHA_DESIGN_FIELDS);
      f.botones.forEach(function (b) {
        const match = (saved.botones || []).find(function (sb) { return sb.texto === b.texto; });
        if (match) { b.color = match.color; b.estilo = JSON.parse(JSON.stringify(match.estilo)); }
      });
    }
    return f;
  }

  // Up to 3 maps can share the final page, each with its own image, pins,
  // and an optional label banner above it ("Playa del Carmen", "Tulum"...).
  const MAX_MAPAS = 3;
  function defaultMapaItem() {
    return { id: uid(), imagen: null, pines: [], etiqueta: "" }; // pines: [{id, x, y, nombre, bgColor, textColor, scale}]  x,y in %
  }
  function defaultMapasList() {
    return [defaultMapaItem()];
  }

  function defaultEstilosGlobales() {
    const eg = {
      paperColor: "#DFDAD5",
      paperImage: null, // dataURL, optional — overrides paperColor as a background image
      textScale: 100,
      fontFamily: "", // "" = original brand typeface — see FichaRender.FONT_OPTIONS
      estiloHeaderTitulo: defaultTextStyle(), // "Análisis de propiedades"
      estiloHeaderPara: defaultTextStyle(),   // "Para: cliente"
      estiloHeaderElaboradoPor: defaultTextStyle(), // "Elaborado por: asesor"
    };
    const saved = loadDefaultDesign();
    if (saved) applyDesignFields(eg, saved.estilosGlobales, GLOBAL_DESIGN_FIELDS);
    return eg;
  }

  function defaultDocument() {
    return {
      clientName: "",
      advisorName: "",
      exchangeRate: 17.5,
      fichas: [],
      mapas: defaultMapasList(),
      designerMode: false,
      estilosGlobales: defaultEstilosGlobales(),
    };
  }

  const MAX_MODELOS = 10;
  const DESIGNER_PASSWORD = "diseno2024";

  // Ensures every field the app expects to find actually exists, no matter
  // how old the document is — whether it came from localStorage or from an
  // imported JSON backup. Anything that reads e.g. `ficha.estiloEyebrow`
  // without checking first will throw on an older document and the
  // designer modal (or the preview) will silently fail to open.
  function normalizeDocument(parsed) {
    if (!parsed || typeof parsed !== "object") return defaultDocument();
    // Older documents had a single `mapa` object — migrate it into the
    // first slot of the new `mapas` array (up to MAX_MAPAS on one page).
    if (!Array.isArray(parsed.mapas)) {
      parsed.mapas = parsed.mapa
        ? [{ id: uid(), imagen: parsed.mapa.imagen || null, pines: parsed.mapa.pines || [], etiqueta: "" }]
        : defaultMapasList();
    }
    delete parsed.mapa;
    parsed.mapas = parsed.mapas.slice(0, MAX_MAPAS);
    if (!parsed.mapas.length) parsed.mapas = defaultMapasList();
    parsed.mapas.forEach(function (m) {
      if (typeof m.etiqueta !== "string") m.etiqueta = "";
      if (!Array.isArray(m.pines)) m.pines = [];
    });
    if (typeof parsed.advisorName !== "string") parsed.advisorName = "";
    if (typeof parsed.designerMode !== "boolean") parsed.designerMode = false;
    if (!parsed.estilosGlobales) parsed.estilosGlobales = defaultEstilosGlobales();
    const eg = parsed.estilosGlobales;
    if (eg.paperColor === undefined) eg.paperColor = "#DFDAD5";
    if (eg.paperImage === undefined) eg.paperImage = null;
    if (eg.textScale === undefined) eg.textScale = 100;
    if (typeof eg.fontFamily !== "string") eg.fontFamily = "";
    if (!eg.estiloHeaderTitulo) eg.estiloHeaderTitulo = defaultTextStyle();
    if (!eg.estiloHeaderPara) eg.estiloHeaderPara = defaultTextStyle();
    if (!eg.estiloHeaderElaboradoPor) eg.estiloHeaderElaboradoPor = defaultTextStyle();

    (parsed.fichas || []).forEach(function (f) {
      // The separate "imagen principal" upload was folded into the fixed
      // 4-slot gallery mosaic — its first slot is now the one big image.
      // Older documents get their old imagenPrincipal moved into that slot
      // (only if that slot is still empty, so nothing gets overwritten).
      if (f.imagenPrincipal) {
        if (!Array.isArray(f.galeria)) f.galeria = [];
        if (!f.galeria[0]) f.galeria[0] = defaultGaleriaItem();
        if (!f.galeria[0].src) f.galeria[0].src = f.imagenPrincipal;
      }
      delete f.imagenPrincipal;
      if (!f.estiloTitulo) f.estiloTitulo = defaultTextStyle();
      if (!f.estiloEyebrow) f.estiloEyebrow = defaultTextStyle();
      if (!f.estiloFranja) f.estiloFranja = defaultTextStyle();
      if (!f.estiloPagoMonto) f.estiloPagoMonto = defaultTextStyle();
      if (!f.estiloPagoMontoSub) f.estiloPagoMontoSub = defaultTextStyle();
      if (!f.colorPrecioBadge) f.colorPrecioBadge = "#AE9479";
      if (!f.estiloPrecioBadge) f.estiloPrecioBadge = defaultTextStyle();
      if (!f.colorPagoHead) f.colorPagoHead = "#AE9479";
      if (!f.estiloPagoHead) f.estiloPagoHead = defaultTextStyle();
      if (!f.colorShowroom) f.colorShowroom = "#AE9479";
      if (!f.estiloShowroom) f.estiloShowroom = defaultTextStyle();
      if (!f.escalas) {
        const fromModelo = (f.modelos && f.modelos[0] && f.modelos[0].escalas) || { plano: 100, specs: 100, pago: 100 };
        f.escalas = fromModelo;
      }
      // Per-modelo text styles used to live on each modelo — now shared
      // across every modelo in the ficha, same as escalas. Migrate the
      // first modelo's old values (if any) up to the ficha.
      const firstModelo = f.modelos && f.modelos[0];
      if (!f.estiloModeloNombre) f.estiloModeloNombre = (firstModelo && firstModelo.estiloNombre) || defaultTextStyle();
      if (!f.estiloModeloPrecio) f.estiloModeloPrecio = (firstModelo && firstModelo.estiloPrecio) || defaultTextStyle();
      if (!f.estiloModeloPrecioSub) f.estiloModeloPrecioSub = defaultTextStyle();
      if (!f.estiloModeloSpecs) f.estiloModeloSpecs = (firstModelo && firstModelo.estiloSpecs) || defaultTextStyle();
      if (typeof f.avisoLegal !== "string" || !f.avisoLegal.trim()) f.avisoLegal = DEFAULT_LEGAL;
      if (!f.gastosCierre) f.gastosCierre = { activo: false, monto: "" };
      (f.botones || []).forEach(function (b) {
        if (!b.color) b.color = "#AE9479";
        if (!b.estilo) b.estilo = defaultTextStyle();
      });
      // Gallery is a fixed 4-slot mosaic now (1 wide + 3 in a row) — pad or
      // trim any older, freely-sized gallery down to exactly that.
      if (!Array.isArray(f.galeria)) f.galeria = [];
      f.galeria = f.galeria.slice(0, 4);
      while (f.galeria.length < 4) f.galeria.push(defaultGaleriaItem());
      f.galeria.forEach(function (g) {
        if (g.posX === undefined) g.posX = 50;
        if (g.posY === undefined) g.posY = 50;
      });
      // clean up the old per-modelo style fields so they don't linger unused
      (f.modelos || []).forEach(function (m) {
        delete m.estiloNombre; delete m.estiloPrecio; delete m.estiloSpecs;
        if (typeof m.showroomTexto !== "string" || !m.showroomTexto.trim()) m.showroomTexto = "Showroom";
      });
    });
    parsed.mapas.forEach(function (mapa) {
      (mapa.pines || []).forEach(function (p) {
        if (!p.bgColor) p.bgColor = "#FFFFFF";
        if (!p.textColor) p.textColor = "#171512";
        if (!p.scale) p.scale = 100;
      });
    });
    return parsed;
  }

  // ---------- persistence ----------
  // ---------- IndexedDB (large-object storage) ----------
  // localStorage caps out around 5-10MB per origin — nowhere near enough
  // once real documents carry several photos each. IndexedDB's quota is
  // tied to available disk space instead (realistically gigabytes), so the
  // document and the page library — the two things that hold embedded
  // images — live here now. The default-design template stays in
  // localStorage: it holds no images, is tiny, and dozens of call sites
  // across the app read it synchronously.
  const IDB_NAME = "fichaflow";
  const IDB_STORE = "kv";
  let idbPromise = null;
  function openIdb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error("IndexedDB no disponible en este navegador.")); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return idbPromise;
  }
  function idbGet(key) {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function idbSet(key, value) {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  // One-time migration: the first time this runs after the IndexedDB
  // switch, IndexedDB is empty but localStorage may hold a real document
  // from before. Read it, write it into IndexedDB, verify it round-trips,
  // and only then clear the old localStorage copy — if anything about the
  // migration is uncertain, the original stays put instead of being lost.
  function loadFromIdbOrMigrate(key, normalizeFn, defaultFn) {
    return idbGet(key).then(function (found) {
      if (found !== undefined) return found;
      let migrated = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw) migrated = normalizeFn(JSON.parse(raw));
      } catch (e) {
        console.warn("No se pudo leer el respaldo anterior de " + key + ".", e);
      }
      if (migrated === null) return defaultFn();
      return idbSet(key, migrated)
        .then(function () { return idbGet(key); })
        .then(function (readBack) {
          if (readBack === undefined) throw new Error("La migración no se pudo verificar.");
          try { localStorage.removeItem(key); } catch (e) {}
          return migrated;
        })
        .catch(function (e) {
          console.error("No se pudo migrar " + key + " a IndexedDB; se mantiene en localStorage por ahora.", e);
          return migrated;
        });
    });
  }

  let lastSavedAt = null;
  let lastSaveError = null;
  let pendingWrites = 0;
  function getLastSavedAt() { return lastSavedAt; }
  function getLastSaveError() { return lastSaveError; }
  function hasPendingWrites() { return pendingWrites > 0; }

  const saveStatusListeners = [];
  function onSaveStatusChange(fn) { saveStatusListeners.push(fn); }
  function notifySaveStatus() { saveStatusListeners.forEach(function (fn) { fn(); }); }

  function persistDocument(doc) {
    pendingWrites++;
    return idbSet(LS_DOC, doc).then(function () {
      lastSavedAt = Date.now();
      lastSaveError = null;
    }, function (e) {
      // Deliberately NOT swallowed silently: a failed write here used to
      // leave the UI showing a stale "Guardado hace X" badge and a false
      // "Cambios guardados ✓" toast, with zero indication the save failed.
      // render-app.js reads getLastSaveError() to surface this to the user.
      console.error("No se pudo guardar (¿espacio lleno?)", e);
      lastSaveError = e;
    }).then(function () {
      pendingWrites--;
      notifySaveStatus();
    });
  }

  function persistLibrary(lib) {
    return idbSet(LS_LIB, lib).catch(function (e) {
      console.error("No se pudo guardar la biblioteca de páginas.", e);
    });
  }

  // ---------- store ----------
  // document/library start empty and are filled in by init() — reading
  // them out of IndexedDB is unavoidably async, unlike the old synchronous
  // localStorage read. Nothing reads state.document until after the first
  // render, and the first render only happens once init()'s promise
  // resolves (see main.js), so this gap is never visible to app code.
  const state = {
    step: 1,
    document: null,
    library: [],
    ready: false,
    activeFichaId: null,
    activeModeloIndex: 0,
    showLibraryPanel: false,
    designerPanelOpen: false,
    storagePanelOpen: false,
    planoEditor: null, // { src, modelo } while the plano background-eraser modal is open
    designerUnlocked: false,
    designerApplyToAll: false,
  };

  function init() {
    return Promise.all([
      loadFromIdbOrMigrate(LS_DOC, normalizeDocument, defaultDocument),
      loadFromIdbOrMigrate(LS_LIB, function (v) { return v; }, function () { return []; }),
    ]).then(function (results) {
      state.document = results[0];
      state.library = results[1];
      state.ready = true;
      if (state.document.fichas.length && !state.activeFichaId) {
        state.activeFichaId = state.document.fichas[0].id;
      }
    });
  }

  const listeners = [];

  function subscribe(fn) {
    listeners.push(fn);
  }

  function notify() {
    listeners.forEach(function (fn) { fn(state); });
  }

  function update(mutator, opts) {
    mutator(state);
    const p = persistDocument(state.document);
    if (!(opts && opts.silent)) notify();
    return p;
  }

  function updateLibrary(mutator) {
    mutator(state);
    const p = persistLibrary(state.library);
    notify();
    return p;
  }

  // ---------- helpers on state ----------
  function getFicha(id) {
    return state.document.fichas.find(function (f) { return f.id === id; }) || null;
  }

  function fichaProgress(ficha) {
    // counts filled "slots": galeria items (the first is the main image), plano por modelo
    let filled = 0, total = 0;
    total += ficha.galeria.length || 1; filled += ficha.galeria.filter(function(g){return g.src;}).length;
    ficha.modelos.forEach(function (m) {
      total += 1; filled += m.plano ? 1 : 0;
    });
    return { filled: filled, total: total };
  }

  // If the most recent write to localStorage failed (e.g. quota exceeded from
  // heavy images), warn before the tab/window closes instead of letting the
  // user lose work silently — this is the last line of defense against the
  // "cerré la app y perdí el progreso" failure mode.
  window.addEventListener("beforeunload", function (e) {
    // pendingWrites catches the (usually sub-millisecond) gap where an
    // IndexedDB write is still in flight when the window closes — without
    // this, closing right after the very last keystroke could race the
    // write and lose it with no warning.
    if (lastSaveError || pendingWrites > 0) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
  });

  window.Store = {
    state: state,
    init: init,
    subscribe: subscribe,
    update: update,
    updateLibrary: updateLibrary,
    onSaveStatusChange: onSaveStatusChange,
    hasPendingWrites: hasPendingWrites,
    uid: uid,
    defaultFicha: defaultFicha,
    defaultModelo: defaultModelo,
    defaultBoton: defaultBoton,
    defaultTextStyle: defaultTextStyle,
    defaultGaleriaItem: defaultGaleriaItem,
    defaultMapaItem: defaultMapaItem,
    defaultDocument: defaultDocument,
    defaultEstilosGlobales: defaultEstilosGlobales,
    getFicha: getFicha,
    fichaProgress: fichaProgress,
    normalizeDocument: normalizeDocument,
    getLastSavedAt: getLastSavedAt,
    getLastSaveError: getLastSaveError,
    saveDefaultDesign: saveDefaultDesign,
    loadDefaultDesign: loadDefaultDesign,
    resetDefaultDesign: resetDefaultDesign,
    MAX_MODELOS: MAX_MODELOS,
    MAX_MAPAS: MAX_MAPAS,
    DESIGNER_PASSWORD: DESIGNER_PASSWORD,
    DEFAULT_LEGAL: DEFAULT_LEGAL,
    LS_DOC: LS_DOC,
    LS_LIB: LS_LIB,
    LS_DESIGN: LS_DESIGN,
  };
})();
