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

  function defaultTextStyle(bold) {
    return { sizeDelta: 0, bold: bold === undefined ? true : bold, italic: false, strike: false };
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
    return { texto: texto, enlace: "", visible: true, color: "#2A2621", colorTexto: "#F1ECE2", estilo: defaultTextStyle(false) };
  }

  // ---------- default design (a personal template, not tied to any one document) ----------
  // "Modo diseñador" edits a ficha's/document's style fields directly — this
  // lets you save the CURRENT look as your own baseline, so every new ficha
  // and every new document starts from it instead of the plain factory
  // colors/sizes. It lives in its own localStorage key, separate from any
  // document, so it survives "Nuevo documento" and applies across the board.
  const FICHA_DESIGN_FIELDS = [
    "escalas", "estiloModeloNombre", "estiloModeloPrecio", "estiloModeloPrecioSub", "estiloModeloSpecs",
    "colorPrecioBadge", "estiloPrecioBadge", "colorPrecioBadgeTexto", "colorPagoHead", "estiloPagoHead", "colorPagoHeadTexto",
    "colorShowroom", "colorShowroomTexto", "estiloShowroom", "estiloTitulo", "estiloEyebrow", "estiloFranja",
    "estiloPagoConcepto", "colorPagoConcepto", "estiloPagoMomento", "colorPagoMomento",
    "estiloPagoMonto", "estiloPagoMontoSub",
  ];
  const GLOBAL_DESIGN_FIELDS = [
    "paperColor", "paperImage", "textScale", "fontFamily",
    "estiloHeaderTitulo", "estiloHeaderPara", "estiloHeaderElaboradoPor",
  ];

  // Shared across every device and every person using the app (Supabase,
  // not localStorage) — that's the whole point: it should start the same
  // in the desktop app and on the iPhone link. Kept as an in-memory cache
  // populated once by Store.init() so defaultFicha()/defaultEstilosGlobales()
  // — called synchronously all over the place whenever something new is
  // created — don't need to become async themselves; only the initial load
  // and explicit save/reset touch the network.
  let cachedDefaultDesign = null;
  function loadDefaultDesign() {
    return cachedDefaultDesign;
  }

  function saveDefaultDesign(doc, ficha) {
    const design = { estilosGlobales: {}, ficha: {}, botones: [] };
    GLOBAL_DESIGN_FIELDS.forEach(function (k) { design.estilosGlobales[k] = doc.estilosGlobales[k]; });
    FICHA_DESIGN_FIELDS.forEach(function (k) { design.ficha[k] = ficha[k]; });
    // Botones vary in count/order per ficha — save by label so a saved
    // "BROCHURE" style always finds its way back onto a new "BROCHURE".
    (ficha.botones || []).forEach(function (b) {
      design.botones.push({ texto: b.texto, color: b.color, colorTexto: b.colorTexto, estilo: b.estilo });
    });
    return compressImagesForSync(design).then(function (compressedDesign) {
      return Sync.saveDefaultDesignRemote(compressedDesign);
    }).then(function () {
      // Cache the original (uncompressed) locally — only what travels to
      // Supabase needs the smaller version, this device keeps full quality.
      cachedDefaultDesign = design;
      return design;
    }).catch(function (e) {
      console.error("No se pudo guardar el diseño predeterminado compartido.", e);
      throw e;
    });
  }

  function resetDefaultDesign() {
    return Sync.resetDefaultDesignRemote().then(function () {
      cachedDefaultDesign = null;
    }).catch(function (e) {
      console.error("No se pudo restablecer el diseño predeterminado compartido.", e);
      throw e;
    });
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

  // ---------- named design presets ----------
  // Different from the single "default design" above (which only shapes
  // brand-new fichas/documents): a preset can be applied directly onto
  // whatever you're editing right now, and you can keep as many as you
  // want, shared the same way as the library — save the current look
  // under a name (e.g. "FINAL"), then flip back to it anytime instead of
  // re-adjusting every color/font/size by hand. "Piedra Caliza" ships
  // built in, matching the app's current factory look exactly.
  const PIEDRA_CALIZA_PRESET = {
    estilosGlobales: {
      paperColor: "#F1ECE2", paperImage: null, textScale: 100, fontFamily: "",
      estiloHeaderTitulo: defaultTextStyle(), estiloHeaderPara: defaultTextStyle(), estiloHeaderElaboradoPor: defaultTextStyle(),
    },
    ficha: {
      escalas: { plano: 100, specs: 100, pago: 100 },
      estiloModeloNombre: defaultTextStyle(), estiloModeloPrecio: defaultTextStyle(),
      estiloModeloPrecioSub: defaultTextStyle(), estiloModeloSpecs: defaultTextStyle(),
      colorPrecioBadge: "#DDD4C2", estiloPrecioBadge: defaultTextStyle(), colorPrecioBadgeTexto: "#2A2621",
      colorPagoHead: "#DDD4C2", estiloPagoHead: defaultTextStyle(), colorPagoHeadTexto: "#2A2621",
      colorShowroom: "#2A2621", colorShowroomTexto: "#F1ECE2", estiloShowroom: defaultTextStyle(),
      estiloTitulo: defaultTextStyle(), estiloEyebrow: defaultTextStyle(), estiloFranja: defaultTextStyle(),
      estiloPagoConcepto: defaultTextStyle(), colorPagoConcepto: "#2A2621",
      estiloPagoMomento: defaultTextStyle(false), colorPagoMomento: "#766D5F",
      estiloPagoMonto: defaultTextStyle(), estiloPagoMontoSub: defaultTextStyle(),
    },
    botones: [
      { texto: "BROCHURE", color: "#2A2621", colorTexto: "#F1ECE2", estilo: defaultTextStyle(false) },
      { texto: "RENDERS", color: "#2A2621", colorTexto: "#F1ECE2", estilo: defaultTextStyle(false) },
      { texto: "UBICACIÓN", color: "#2A2621", colorTexto: "#F1ECE2", estilo: defaultTextStyle(false) },
      { texto: "SHOWROOM", color: "#2A2621", colorTexto: "#F1ECE2", estilo: defaultTextStyle(false) },
    ],
  };
  const BUILTIN_DESIGN_PRESETS = [
    { id: "piedra-caliza", name: "Piedra Caliza", builtin: true, value: PIEDRA_CALIZA_PRESET },
  ];

  // Custom (Supabase-backed) presets only — builtins are always available
  // locally and never need a network round-trip.
  let cachedDesignPresets = null;
  function getDesignPresets() {
    return BUILTIN_DESIGN_PRESETS.concat(cachedDesignPresets || []);
  }

  function loadDesignPresets() {
    return Sync.listDesignPresetsRemote().then(function (rows) {
      cachedDesignPresets = rows;
      return getDesignPresets();
    }).catch(function (e) {
      console.error("No se pudieron cargar los presets de diseño compartidos.", e);
      cachedDesignPresets = cachedDesignPresets || [];
      return getDesignPresets();
    });
  }

  function saveDesignPreset(name, doc, ficha) {
    const value = { estilosGlobales: {}, ficha: {}, botones: [] };
    GLOBAL_DESIGN_FIELDS.forEach(function (k) { value.estilosGlobales[k] = doc.estilosGlobales[k]; });
    FICHA_DESIGN_FIELDS.forEach(function (k) { value.ficha[k] = ficha[k]; });
    (ficha.botones || []).forEach(function (b) {
      value.botones.push({ texto: b.texto, color: b.color, colorTexto: b.colorTexto, estilo: b.estilo });
    });
    const preset = { id: uid(), name: name, savedAt: Date.now(), value: value };
    return compressImagesForSync(value).then(function (compressedValue) {
      return Sync.saveDesignPresetRemote({ id: preset.id, name: preset.name, savedAt: preset.savedAt, value: compressedValue });
    }).then(function () {
      cachedDesignPresets = (cachedDesignPresets || []).concat([preset]);
      return preset;
    }).catch(function (e) {
      console.error("No se pudo guardar el preset de diseño.", e);
      throw e;
    });
  }

  function deleteDesignPreset(id) {
    const prior = cachedDesignPresets || [];
    cachedDesignPresets = prior.filter(function (p) { return p.id !== id; });
    return Sync.deleteDesignPresetRemote(id).catch(function (e) {
      cachedDesignPresets = prior; // roll back the optimistic removal
      console.error("No se pudo eliminar el preset de diseño.", e);
      throw e;
    });
  }

  // Applies a preset directly onto the document/ficha being edited right
  // now (mutates in place — caller is responsible for persisting/re-rendering).
  function applyDesignPreset(id, doc, ficha) {
    const preset = getDesignPresets().find(function (p) { return p.id === id; });
    if (!preset) return false;
    const value = preset.value;
    applyDesignFields(doc.estilosGlobales, value.estilosGlobales, GLOBAL_DESIGN_FIELDS);
    applyDesignFields(ficha, value.ficha, FICHA_DESIGN_FIELDS);
    // Matched by POSITION, not by label: botones keep a fixed slot order
    // (BROCHURE, RENDERS, UBICACIÓN...) but the label itself is a free-text
    // field the user can rename per ficha, so matching by texto silently
    // skipped any button whose wording didn't match byte-for-byte.
    (ficha.botones || []).forEach(function (b, i) {
      const match = (value.botones || [])[i];
      if (match) { b.color = match.color; b.colorTexto = match.colorTexto; b.estilo = JSON.parse(JSON.stringify(match.estilo)); }
    });
    return true;
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
      colorPrecioBadge: "#DDD4C2",
      estiloPrecioBadge: defaultTextStyle(),
      colorPrecioBadgeTexto: "#2A2621",
      colorPagoHead: "#DDD4C2",
      estiloPagoHead: defaultTextStyle(),
      colorPagoHeadTexto: "#2A2621",
      colorShowroom: "#2A2621",
      colorShowroomTexto: "#F1ECE2",
      estiloShowroom: defaultTextStyle(),
      franjaActiva: false,
      franjaTexto: "",
      estiloTitulo: defaultTextStyle(),
      estiloEyebrow: defaultTextStyle(),
      estiloFranja: defaultTextStyle(),
      estiloPagoConcepto: defaultTextStyle(),
      colorPagoConcepto: "#2A2621",
      estiloPagoMomento: defaultTextStyle(false),
      colorPagoMomento: "#766D5F",
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
      // Matched by position — see the same note in applyDesignPreset().
      f.botones.forEach(function (b, i) {
        const match = (saved.botones || [])[i];
        if (match) { b.color = match.color; b.colorTexto = match.colorTexto; b.estilo = JSON.parse(JSON.stringify(match.estilo)); }
      });
      // A "diseño predeterminado" saved before Showroom's restyle still
      // carries the old light-accent color — the same one-time upgrade
      // normalizeDocument() applies to existing fichas, so a brand-new
      // ficha doesn't quietly bring the old look back until someone
      // re-saves the default design by hand.
      if (!f.colorShowroom || f.colorShowroom === "#DDD4C2") f.colorShowroom = "#2A2621";
      if (!f.colorShowroomTexto) f.colorShowroomTexto = "#F1ECE2";
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
      paperColor: "#F1ECE2",
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
    if (eg.paperColor === undefined) eg.paperColor = "#F1ECE2";
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
      if (!f.estiloPagoConcepto) f.estiloPagoConcepto = defaultTextStyle();
      if (!f.estiloPagoMomento) f.estiloPagoMomento = defaultTextStyle(false);
      if (!f.estiloPagoMonto) f.estiloPagoMonto = defaultTextStyle();
      if (!f.estiloPagoMontoSub) f.estiloPagoMontoSub = defaultTextStyle();
      if (!f.colorPrecioBadge) f.colorPrecioBadge = "#DDD4C2";
      if (!f.estiloPrecioBadge) f.estiloPrecioBadge = defaultTextStyle();
      if (!f.colorPrecioBadgeTexto) f.colorPrecioBadgeTexto = "#2A2621";
      if (!f.colorPagoHead) f.colorPagoHead = "#DDD4C2";
      if (!f.estiloPagoHead) f.estiloPagoHead = defaultTextStyle();
      if (!f.colorPagoHeadTexto) f.colorPagoHeadTexto = "#2A2621";
      if (!f.colorPagoConcepto) f.colorPagoConcepto = "#2A2621";
      if (!f.colorPagoMomento) f.colorPagoMomento = "#766D5F";
      // "#DDD4C2" was the OLD factory default (light accent pill, matching
      // the badge/header bars) — upgrading it here (not just backfilling a
      // missing value) is what makes existing fichas pick up the new
      // dark-ink look that now matches BROCHURE/RENDERS/UBICACIÓN, instead
      // of only new ones. A showroom color someone actually chose on
      // purpose (anything other than that old default) is left alone.
      if (!f.colorShowroom || f.colorShowroom === "#DDD4C2") f.colorShowroom = "#2A2621";
      if (!f.colorShowroomTexto) f.colorShowroomTexto = "#F1ECE2";
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
        if (!b.color) b.color = "#2A2621";
        if (!b.colorTexto) b.colorTexto = "#F1ECE2";
        if (!b.estilo) b.estilo = defaultTextStyle(false);
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

  // The library is shared (Supabase), not per-device — each saved page is
  // its own row rather than one big array overwritten wholesale, so you
  // and whoever else you share this with adding pages at the same time
  // from different devices never collide. Updates are optimistic (the UI
  // reflects the change immediately) and roll back if the remote write
  // fails, with the failure surfaced via console (render-app.js can check
  // getLastLibraryError() the same way it already does for document saves).
  let lastLibraryError = null;
  function getLastLibraryError() { return lastLibraryError; }

  // Anything synced to the shared backend gets its embedded images
  // recompressed first — a page saved before per-upload auto-compression
  // existed can still carry full-resolution, multi-MB photos, which is a
  // real candidate for a sync request failing. This only affects what
  // travels to Supabase; the local copy shown on this device keeps its
  // original quality. Walks the object generically instead of hardcoding
  // field names (galeria[].src, modelos[].plano, paperImage, …) so any new
  // image field added later is covered automatically.
  const SYNC_MAX_IMAGE_DIM = 1600;
  function compressDataUrlForSync(dataUrl) {
    return new Promise(function (resolve) {
      if (typeof dataUrl !== "string" || dataUrl.indexOf("data:image/") !== 0) { resolve(dataUrl); return; }
      const img = new Image();
      img.onload = function () {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h || (w <= SYNC_MAX_IMAGE_DIM && h <= SYNC_MAX_IMAGE_DIM)) { resolve(dataUrl); return; }
        const scale = Math.min(SYNC_MAX_IMAGE_DIM / w, SYNC_MAX_IMAGE_DIM / h);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }
  function compressImagesForSync(value) {
    if (Array.isArray(value)) return Promise.all(value.map(compressImagesForSync));
    if (value && typeof value === "object") {
      const keys = Object.keys(value);
      return Promise.all(keys.map(function (k) { return compressImagesForSync(value[k]); })).then(function (vals) {
        const out = {};
        keys.forEach(function (k, i) { out[k] = vals[i]; });
        return out;
      });
    }
    if (typeof value === "string" && value.indexOf("data:image/") === 0) return compressDataUrlForSync(value);
    return Promise.resolve(value);
  }

  function addLibraryEntry(entry) {
    state.library.push(entry);
    notify();
    return compressImagesForSync(entry.ficha).then(function (compressedFicha) {
      return Sync.addLibraryEntryRemote({ id: entry.id, savedAt: entry.savedAt, ficha: compressedFicha });
    }).then(function () {
      lastLibraryError = null;
    }).catch(function (e) {
      console.error("No se pudo guardar en la biblioteca compartida.", e);
      lastLibraryError = e;
      const idx = state.library.indexOf(entry);
      if (idx !== -1) state.library.splice(idx, 1);
      notify();
      throw e;
    });
  }

  function removeLibraryEntry(id) {
    const idx = state.library.findIndex(function (e) { return e.id === id; });
    const removed = idx !== -1 ? state.library.splice(idx, 1)[0] : null;
    notify();
    return Sync.removeLibraryEntryRemote(id).then(function () {
      lastLibraryError = null;
    }).catch(function (e) {
      console.error("No se pudo eliminar de la biblioteca compartida.", e);
      lastLibraryError = e;
      if (removed && idx !== -1) state.library.splice(idx, 0, removed);
      notify();
      throw e;
    });
  }

  // CRITICAL invariant: what you can SEE in the library on a given device
  // must never depend on whether syncing to the shared backend succeeded.
  // A page that fails to migrate is still real data sitting in this
  // device's IndexedDB — hiding it because Supabase doesn't have it yet
  // would look exactly like data loss, which is exactly what happened
  // before this: the displayed library was built ONLY from the remote
  // list, so a page that failed to upload silently disappeared even on
  // the device where it still physically existed. This merges local-only
  // pages (by id) into what's shown, on top of whatever the shared list
  // has — remote is null (not []) specifically when it couldn't be
  // reached at all, so a temporary connection problem falls back to
  // "show what's local" instead of being treated as "the shared library
  // is genuinely empty".
  function mergeLibraryForDisplay(legacyLocal, remote) {
    if (!remote) return (legacyLocal || []).slice();
    const remoteIds = {};
    remote.forEach(function (e) { remoteIds[e.id] = true; });
    const localOnly = (legacyLocal || []).filter(function (e) { return !remoteIds[e.id]; });
    return remote.concat(localOnly).sort(function (a, b) { return a.savedAt - b.savedAt; });
  }

  // Fire-and-forget, run AFTER the app has already booted and shown the
  // merged library from local data — sync success/failure updates
  // libraryMigrationFailures and re-notifies, but never blocks or gates
  // what's already on screen. Each page migrates independently
  // (Promise.all, not a chain) so one bad page can't block the rest.
  let libraryMigrationFailures = [];
  function getLibraryMigrationFailures() { return libraryMigrationFailures; }
  function migrateLocalOnlyLibraryEntries(legacyLocal, remote) {
    const remoteIds = {};
    (remote || []).forEach(function (e) { remoteIds[e.id] = true; });
    const missing = (legacyLocal || []).filter(function (e) { return !remoteIds[e.id]; });
    if (!missing.length) { libraryMigrationFailures = []; return; }
    Promise.all(missing.map(function (entry) {
      return compressImagesForSync(entry.ficha).then(function (compressedFicha) {
        return Sync.addLibraryEntryRemote({ id: entry.id, savedAt: entry.savedAt, ficha: compressedFicha });
      }).then(function () {
        return { ok: true, entry: entry };
      }).catch(function (e) {
        console.error("No se pudo subir a la biblioteca compartida la página \"" + ((entry.ficha && entry.ficha.desarrollo) || "sin nombre") + "\".", e);
        return { ok: false, entry: entry, error: e };
      });
    })).then(function (results) {
      libraryMigrationFailures = results.filter(function (r) { return !r.ok; }).map(function (r) { return r.entry; });
      notify();
    });
  }

  // ---------- store ----------
  // document/library/defaultDesign start empty and are filled in by init()
  // — reading them (IndexedDB for the document, Supabase for the shared
  // library/design) is unavoidably async. Nothing reads state.document
  // until after the first render, and the first render only happens once
  // init()'s promise resolves (see main.js), so this gap is never visible
  // to app code.
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
    railMenuOpen: false,
    planoEditor: null, // { src, modelo } while the plano background-eraser modal is open
    designerUnlocked: false,
    designerApplyToAll: false,
  };

  function init() {
    // defaultDesign has to be cached BEFORE the document loads: a
    // brand-new document falls back to defaultDocument()/defaultFicha(),
    // which read the cached design synchronously — loading it in parallel
    // with the document (instead of before) would race, sometimes seeding
    // a new document before the shared design arrived.
    return Sync.loadDefaultDesignRemote().catch(function (e) {
      console.error("No se pudo cargar el diseño predeterminado compartido.", e);
      return null;
    }).then(function (design) {
      if (design) return design;
      // Same one-time migration idea as the library: a design saved
      // locally before this became shared shouldn't just vanish.
      let legacy = null;
      try {
        const raw = localStorage.getItem(LS_DESIGN);
        legacy = raw ? JSON.parse(raw) : null;
      } catch (e) {}
      if (!legacy) return null;
      return Sync.saveDefaultDesignRemote(legacy).then(function () { return legacy; }).catch(function (e) {
        console.error("No se pudo migrar el diseño predeterminado local al compartido; se queda local por ahora.", e);
        return legacy;
      });
    }).then(function (design) {
      cachedDefaultDesign = design;
      return Promise.all([
        loadFromIdbOrMigrate(LS_DOC, normalizeDocument, defaultDocument),
        idbGet(LS_LIB).catch(function () { return null; }),
      ]);
    }).then(function (results) {
      state.document = results[0];
      const legacyLocal = results[1];
      // Show the local-only view immediately — never block boot on the
      // shared library. A library with several heavy pages (each one can
      // be multiple MB, mostly images) takes a real handful of seconds to
      // fetch in full; waiting on that here would bring back the exact
      // "app takes forever to open" complaint that an earlier fix already
      // solved for the migration step. The remote copy is merged in below,
      // in the background, whenever it arrives.
      state.library = mergeLibraryForDisplay(legacyLocal, null);
      state.ready = true;
      if (state.document.fichas.length && !state.activeFichaId) {
        state.activeFichaId = state.document.fichas[0].id;
      }
      Sync.loadLibraryRemote().catch(function (e) {
        console.error("No se pudo cargar la biblioteca compartida.", e);
        return null; // null = couldn't reach it at all, distinct from "reached it and it's empty"
      }).then(function (remoteLibrary) {
        state.library = mergeLibraryForDisplay(legacyLocal, remoteLibrary);
        notify();
        // Sync anything local-only up to the shared library in the
        // background too — never block or gate boot on this (that's what
        // made every open slow while pages kept re-attempting a broken
        // upload).
        if (remoteLibrary !== null) migrateLocalOnlyLibraryEntries(legacyLocal, remoteLibrary);
      });
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
    // Legacy generic mutator, kept only so nothing breaks if some call
    // site still uses it — prefer addLibraryEntry/removeLibraryEntry,
    // which map to real per-row inserts/deletes instead of resaving the
    // whole shared list.
    mutator(state);
    notify();
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
    addLibraryEntry: addLibraryEntry,
    getLibraryMigrationFailures: getLibraryMigrationFailures,
    removeLibraryEntry: removeLibraryEntry,
    getLastLibraryError: getLastLibraryError,
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
    getDesignPresets: getDesignPresets,
    loadDesignPresets: loadDesignPresets,
    saveDesignPreset: saveDesignPreset,
    deleteDesignPreset: deleteDesignPreset,
    applyDesignPreset: applyDesignPreset,
    MAX_MODELOS: MAX_MODELOS,
    MAX_MAPAS: MAX_MAPAS,
    DESIGNER_PASSWORD: DESIGNER_PASSWORD,
    DEFAULT_LEGAL: DEFAULT_LEGAL,
    LS_DOC: LS_DOC,
    LS_LIB: LS_LIB,
    LS_DESIGN: LS_DESIGN,
  };
})();
