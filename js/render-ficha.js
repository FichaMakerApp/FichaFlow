/* =========================================================
   FichaFlow — ficha renderer
   Pure DOM builder used BOTH for the live preview pane and for
   PDF capture, so what you see while editing is what you export.
   Visual language (header photo, logo, tan accent used only as
   a fill, black bold text, table-style payment schedule) is
   taken directly from the client's own PLANTILLA VACÍA.pdf.
   ========================================================= */
(function () {
  "use strict";
  const C = window.Currency;

  // Embedded as a data URI (not a relative file path) on purpose: when the
  // app is opened straight from disk (file://), a browser treats separate
  // local image files as a different origin and refuses to let html2canvas
  // read them back out for the PDF ("tainted canvas"). Inlining sidesteps
  // that entirely — the PDF export works the same whether you open
  // index.html by double-click or through a local server.
  const LOGO_DATA_URI = "data:image/png;base64,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";

  // Selectable typefaces for "modo diseñador" — 5 universally-installed
  // basics (no loading needed) plus Montserrat, loaded in index.html across
  // its full weight/italic range so the existing bold/italic toggles render
  // real glyphs instead of the browser faking (synthesizing) them.
  // `mono` overrides --font-mono too (prices, specs, payment amounts —
  // most of a ficha's visible text) so picking a typeface changes the
  // whole document, not just headings. Only the original brand look keeps
  // a dedicated monospace for tabular numbers; none of the alternates are
  // monospace fonts anyway, so reusing `body` there reads as one
  // consistent typeface throughout instead of half the page staying in
  // the old font.
  const FONT_OPTIONS = [
    { id: "", label: "Original (Newsreader + Archivo)", display: '"Newsreader","Georgia",serif', body: '"Archivo",-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif', mono: '"Archivo",-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif' },
    { id: "century-gothic", label: "Century Gothic (anterior)", display: '"Century Gothic","Futura","Avenir Next","Poppins","Segoe UI",sans-serif', body: '-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif', mono: '"SF Mono","Cascadia Code",Consolas,"Roboto Mono",monospace' },
    { id: "arial", label: "Arial", display: "Arial, Helvetica, sans-serif", body: "Arial, Helvetica, sans-serif", mono: "Arial, Helvetica, sans-serif" },
    { id: "georgia", label: "Georgia", display: 'Georgia, "Times New Roman", serif', body: "Georgia, serif", mono: "Georgia, serif" },
    { id: "times", label: "Times New Roman", display: '"Times New Roman", Times, serif', body: '"Times New Roman", Times, serif', mono: '"Times New Roman", Times, serif' },
    { id: "verdana", label: "Verdana", display: "Verdana, Geneva, sans-serif", body: "Verdana, Geneva, sans-serif", mono: "Verdana, Geneva, sans-serif" },
    { id: "trebuchet", label: "Trebuchet MS", display: '"Trebuchet MS", sans-serif', body: '"Trebuchet MS", sans-serif', mono: '"Trebuchet MS", sans-serif' },
    { id: "montserrat", label: "Montserrat", display: '"Montserrat", sans-serif', body: '"Montserrat", sans-serif', mono: '"Montserrat", sans-serif' },
  ];
  function findFontOption(id) {
    for (let i = 0; i < FONT_OPTIONS.length; i++) if (FONT_OPTIONS[i].id === id) return FONT_OPTIONS[i];
    return FONT_OPTIONS[0];
  }

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else if (k.indexOf("data-") === 0) el.setAttribute(k, attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c) el.appendChild(c);
    });
    return el;
  }

  function ph(className, label) {
    const box = h("div", { class: (className || "") + " ph" });
    if (label) box.setAttribute("data-label", label);
    return box;
  }

  function img(src, className) {
    if (!src) return null;
    return h("img", { class: className || "", src: src });
  }

  function line(parts) {
    return parts.filter(Boolean).join(" · ");
  }

  // "Modo diseñador" text overrides -> inline CSS.
  // baseSizePx MUST be the element's own normal font-size (from its CSS
  // rule) — `calc(1em + Npx)` looked like the simpler way to do this, but
  // "1em" in an inline font-size resolves against what the element would
  // INHERIT, not its own class default, so on any element with its own
  // explicit font-size (headings, prices...) it silently computed from the
  // wrong starting point. Doing the math here, in px, sidesteps that.
  function textStyleCss(ts, baseSizePx) {
    if (!ts) return "";
    const parts = [];
    if (baseSizePx) {
      parts.push("font-size:" + Math.max(6, baseSizePx + (ts.sizeDelta || 0)) + "px");
    } else if (ts.sizeDelta) {
      parts.push("font-size:calc(1em + " + ts.sizeDelta + "px)");
    }
    parts.push("font-weight:" + (ts.bold ? 700 : 400));
    if (ts.italic) parts.push("font-style:italic");
    if (ts.strike) parts.push("text-decoration:line-through");
    return parts.join(";");
  }

  // Minimal line-art icons matching the reference template's style.
  const ICONS = {
    bed: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="7" rx="1"/><path d="M3 18v2M21 18v2M5 11V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>',
    bath: '<svg viewBox="0 0 24 24"><path d="M4 12h16v2a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-2Z"/><path d="M4 12V7a2 2 0 0 1 2-2c1 0 1.6.5 1.8 1.2M6 18v2M18 18v2"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><rect x="4" y="7" width="12" height="12"/><path d="M13 3h7v7M20 3l-8 8"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/></svg>',
    cursor: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M4 3l16 6.5-6.7 2.2L11 18z"/></svg>',
  };
  function icon(name, extraClass, sizePx) {
    const attrs = { class: "f-icon" + (extraClass ? " " + extraClass : ""), html: ICONS[name] || "" };
    if (sizePx) attrs.style = "width:" + sizePx + "px; height:" + sizePx + "px; flex:0 0 " + sizePx + "px;";
    return h("span", attrs);
  }

  function globalScaleOf(doc) {
    const eg = doc && doc.estilosGlobales;
    return (eg && eg.textScale ? eg.textScale : 100) / 100;
  }

  function renderBrandHeader(doc) {
    const eg = doc.estilosGlobales || {};
    const gs = globalScaleOf(doc);
    return h("div", { class: "f-brand-header" }, [
      h("div", { class: "f-brand-title", style: textStyleCss(eg.estiloHeaderTitulo, 19 * gs) }, [
        document.createTextNode("Análisis de"),
        h("span", { class: "light", text: "propiedades" }),
      ]),
      h("div", { class: "f-brand-for", style: textStyleCss(eg.estiloHeaderPara, 12.5 * gs), text: "Para: " + (doc.clientName || "") }),
      h("div", { class: "f-brand-by", style: textStyleCss(eg.estiloHeaderElaboradoPor, 11 * gs), text: "Elaborado por: " + (doc.advisorName || "") }),
      h("img", { class: "f-brand-logo", src: LOGO_DATA_URI, alt: "Logo" }),
    ]);
  }

  function renderTitleBlock(ficha, gs) {
    gs = gs || 1;
    return h("div", { class: "f-title-block" }, [
      h("div", { class: "f-h1", style: textStyleCss(ficha.estiloTitulo, 34 * gs), text: ficha.desarrollo || "NOMBRE DEL DESARROLLO" }),
      h("div", { class: "f-eyebrow", style: textStyleCss(ficha.estiloEyebrow, 13.5 * gs), text: line([ficha.ciudad, ficha.tipoPropiedad, ficha.entrega]) || "CIUDAD · TIPO · ENTREGA" }),
    ]);
  }

  function renderModelBlock(ficha, modelo, doc, gs) {
    gs = gs || 1;
    const conv = C.convertPrice(modelo.precioBase, ficha.moneda, doc.exchangeRate);
    const priceMain = ficha.moneda === "USD" ? conv.usd : conv.mxn;
    const priceMainCur = ficha.moneda;
    const priceSub = ficha.moneda === "USD" ? conv.mxn : conv.usd;
    const priceSubCur = ficha.moneda === "USD" ? "MXN" : "USD";
    const escalas = ficha.escalas || { plano: 100, specs: 100, pago: 100 };
    // These four styles live on the ficha, not the modelo, on purpose:
    // adjusting one modelo's text style applies to every modelo in the
    // same ficha, same as the panel-size sliders.
    // escalas.specs/pago used to be applied as CSS `zoom` on the whole
    // block. html2canvas does not measure text correctly under `zoom`
    // (glyphs end up mis-spaced — overlapping or with stray gaps — and on
    // a flex child like `.f-specs` the zoomed box also breaks out of the
    // `justify-content:center` sizing, pulling the plano+specs group off
    // center). Baking the percentage directly into each element's own
    // font-size instead keeps the layout math (and html2canvas) sane.
    const specsScale = (escalas.specs || 100) / 100 * gs;
    const specsBase = 13; // shared base for the icon row + the "M² CONSTRUCCIÓN" line
    const specsStyle = textStyleCss(ficha.estiloModeloSpecs, specsBase * specsScale);
    // Grows at the same rate as the habitaciones/baños number next to it
    // (both now computed from an explicit px base — see textStyleCss —
    // so a ratio fixed once here stays correct at any size instead of
    // drifting apart the way it did under the old em-based math).
    const specsDelta = ((ficha.estiloModeloSpecs || {}).sizeDelta) || 0;
    // Base bumped up (was 22) so the icons read as clearly bigger than the
    // numbers next to them, matching the reference proportion — the ratio
    // to the text base (32/13) is baked into the delta coefficient too, so
    // growing/shrinking the specs text size scales the icons in the same
    // proportion instead of the two drifting apart.
    const iconSize = Math.max(12, Math.round((32 + specsDelta * 2.46) * specsScale));

    const specs = h("div", { class: "f-specs" }, [
      h("div", { class: "f-model-name", style: textStyleCss(ficha.estiloModeloNombre, 17 * specsScale), text: modelo.nombre || "MODELO" }),
      h("div", { class: "f-icon-row", style: specsStyle }, [
        h("div", { class: "f-icon-item" }, [icon("bed", null, iconSize), h("span", { class: "val", text: modelo.habitaciones || "0" })]),
        h("div", { class: "f-icon-item" }, [icon("bath", null, iconSize), h("span", { class: "val", text: modelo.banos || "0" })]),
      ]),
      h("div", { class: "f-surface-line", style: specsStyle }, [
        icon("expand", null, iconSize),
        h("span", { text: modelo.superficieM2 ? modelo.superficieM2 + " M² " + (modelo.etiquetaSuperficie || "") : (modelo.etiquetaSuperficie || "SUPERFICIE") }),
      ]),
      // "Desde $X" describes a single base price — once the level table is
      // active, per-level prices replace it, so showing both would just be
      // two conflicting numbers for the same modelo.
      modelo.mostrarTablaNivel ? null : h("div", { class: "f-price-block" }, [
        h("div", {
          class: "f-price-badge", text: "Desde",
          style: "background:" + (ficha.colorPrecioBadge || "#DDD4C2") + ";" + textStyleCss(ficha.estiloPrecioBadge, 15 * specsScale),
        }),
        h("div", { class: "f-price-big", style: textStyleCss(ficha.estiloModeloPrecio, 24 * specsScale), text: C.fmtMoney(priceMain, priceMainCur) }),
        ficha.mostrarConversion
          ? h("div", { class: "f-price-sub", style: textStyleCss(ficha.estiloModeloPrecioSub, 16 * specsScale), text: "APROX. " + C.fmtMoney(priceSub, priceSubCur) })
          : null,
      ]),
      modelo.mostrarShowroom
        ? h("a", {
            class: "f-btn f-showroom", href: modelo.showroomEnlace || "#",
            style: "background:" + (ficha.colorShowroom || "#DDD4C2") + ";" + textStyleCss(ficha.estiloShowroom, 15 * specsScale),
          }, [document.createTextNode(modelo.showroomTexto || "Showroom"), icon("cursor", "f-btn-cursor")])
        : null,
    ]);

    // Fixed pixel width instead of a flex percentage basis: CSS `zoom` does not
    // reliably resize a flex item whose size comes from flex-basis, so the
    // plano size control computes its own width directly.
    const planoBaseWidth = 336; // ~46% of the 736px content width
    const planoW = Math.round(planoBaseWidth * (escalas.plano / 100));
    const planoWrap = h("div", { class: "f-plano", style: "flex:0 0 auto; width:" + planoW + "px;" }, [
      modelo.plano ? img(modelo.plano, "") : ph("", "plano")
    ]);

    const row = h("div", { class: "f-model" }, [planoWrap, specs]);

    const pagoScale = (escalas.pago || 100) / 100 * gs;
    // Amounts per row only get hidden when the level-pricing table is also
    // showing (that's when they'd be redundant, sitting right below level
    // prices). Otherwise the payment schedule shows amounts as always.
    const pay = modelo.pagos.tipo === "entrega_inmediata"
      ? h("div", { class: "f-pay-text", style: "font-size:" + (14 * pagoScale) + "px", text: modelo.pagos.textoContado || "PAGO DE CONTADO O CRÉDITO HIPOTECARIO" })
      : renderPayTable(modelo, ficha, doc, pagoScale, !modelo.mostrarTablaNivel);

    const level = modelo.mostrarTablaNivel ? renderLevelTable(modelo, ficha, doc, pagoScale) : null;

    // Level pricing (when active) sits above the payment schedule, not below.
    const payWrap = h("div", { class: "f-pay-wrap" });
    if (level) payWrap.appendChild(level);
    payWrap.appendChild(pay);

    const wrap = h("div", { class: "f-model-wrap" });
    wrap.appendChild(row);
    wrap.appendChild(payWrap);
    return wrap;
  }

  function renderPayTable(modelo, ficha, doc, pagoScale, showAmounts) {
    pagoScale = pagoScale || 1;
    const rows = modelo.pagos.filas.map(function (f) {
      const children = [
        h("div", {}, [
          h("div", { class: "f-pay-concepto", style: textStyleCss(ficha.estiloPagoConcepto, 16 * pagoScale), text: (C.num(f.pct) || 0) + "% " + (f.concepto || "") }),
          f.momento ? h("div", { class: "f-pay-momento", style: textStyleCss(ficha.estiloPagoMomento, 13 * pagoScale), text: f.momento }) : null,
        ]),
      ];
      if (showAmounts) {
        const amt = C.pagoRowAmounts(f.pct, modelo.precioBase, ficha.moneda, doc.exchangeRate);
        const amtCur = ficha.moneda === "USD" ? amt.usd : amt.mxn;
        const amtSubCur = ficha.moneda === "USD" ? amt.mxn : amt.usd;
        const amtSubLabel = ficha.moneda === "USD" ? "MXN" : "USD";
        children.push(h("div", { class: "f-pay-amt-col" }, [
          h("span", { class: "amt", style: textStyleCss(ficha.estiloPagoMonto, 16 * pagoScale), text: C.fmtMoney(amtCur, ficha.moneda) }),
          ficha.mostrarConversion
            ? h("span", { class: "amt-sub", style: textStyleCss(ficha.estiloPagoMontoSub, 13 * pagoScale), text: "APROX. " + C.fmtMoney(amtSubCur, amtSubLabel) })
            : null,
        ]));
      }
      // No amounts (showAmounts=false) means the level pricing table is
      // active above this — the row only has the concepto/momento block
      // left, and flexbox's justify-content:space-between just shoves a
      // single leftover item to the start, hence the unwanted left-align.
      return h("div", { class: "f-pay-row" + (showAmounts ? "" : " f-pay-row-centered") }, children);
    });
    return h("div", { class: "f-pay-table" }, [
      h("div", {
        class: "f-pay-table-head", text: "Esquema de pago",
        style: "background:" + (ficha.colorPagoHead || "#DDD4C2") + ";" + textStyleCss(ficha.estiloPagoHead, 13 * pagoScale),
      }),
      ...rows,
    ]);
  }

  function renderLevelTable(modelo, ficha, doc, pagoScale) {
    pagoScale = pagoScale || 1;
    const rows = [h("div", { class: "lt-row head", style: "font-size:" + (16 * pagoScale) + "px" }, [
      h("span", { text: "Nivel" }), h("span", { text: "Precio" }),
    ])];
    // Matches the payment schedule's own sizes (concepto/amt/amt-sub) so
    // both tables read as one consistent system, not two different scales.
    modelo.niveles.forEach(function (n) {
      let priceCell;
      if (n.precio) {
        // n.precio is entered IN the ficha's own currency (ficha.moneda) —
        // same convention as modelo.precioBase — not always MXN. Otherwise
        // a USD ficha showed its level prices mislabeled as MXN, with the
        // "aprox" conversion computed backwards.
        const conv = C.convertPrice(n.precio, ficha.moneda, doc.exchangeRate);
        const main = ficha.moneda === "USD" ? conv.usd : conv.mxn;
        const sub = ficha.moneda === "USD" ? conv.mxn : conv.usd;
        const subCur = ficha.moneda === "USD" ? "MXN" : "USD";
        const col = [h("span", { class: "lt-price", style: "font-size:" + (16 * pagoScale) + "px", text: C.fmtMoney(main, ficha.moneda) })];
        if (ficha.mostrarConversion) {
          col.push(h("span", { class: "lt-price-sub", style: "font-size:" + (13 * pagoScale) + "px", text: "APROX. " + C.fmtMoney(sub, subCur) }));
        }
        priceCell = h("div", { class: "lt-price-col" }, col);
      } else {
        priceCell = h("span", { text: "" });
      }
      rows.push(h("div", { class: "lt-row" }, [
        h("span", { class: "lt-nombre", style: "font-size:" + (16 * pagoScale) + "px", text: n.nombre || "" }),
        priceCell,
      ]));
    });
    return h("div", { class: "f-level-table", style: "font-size:" + (12 * pagoScale) + "px" }, rows);
  }

  function renderFichaPage(ficha, doc, isFirst) {
    const body = [];
    const gs = globalScaleOf(doc);

    // Title block sits above the main image, centered, full width.
    body.push(renderTitleBlock(ficha, gs));

    // Fixed 4-slot mosaic — 1 wide image on top (the main/hero image), 3 in
    // a row below. The count and arrangement are not configurable on
    // purpose, so this always renders the same shape (with placeholders for
    // anything not uploaded yet) instead of a variable-length strip.
    function galleryCell(g) {
      if (g && g.src) {
        const im = img(g.src, "");
        im.style.objectPosition = (g.posX != null ? g.posX : 50) + "% " + (g.posY != null ? g.posY : 50) + "%";
        return im;
      }
      return ph("", "imagen");
    }
    const gal = ficha.galeria || [];
    body.push(h("div", { class: "f-gallery" }, [
      h("div", { class: "f-gallery-main" }, [galleryCell(gal[0])]),
      h("div", { class: "f-gallery-row" }, [galleryCell(gal[1]), galleryCell(gal[2]), galleryCell(gal[3])]),
    ]));

    // Legal disclaimer is not optional — always present.
    body.push(h("div", { class: "f-legal", text: ficha.avisoLegal || Store.DEFAULT_LEGAL }));

    const visibleBotones = ficha.botones.filter(function (b) { return b.visible; });
    if (visibleBotones.length) {
      body.push(h("div", { class: "f-buttons" }, visibleBotones.map(function (b) {
        return h("a", {
          class: "f-btn",
          href: b.enlace || "#",
          style: "background:" + (b.color || "#2A2621") + ";color:" + (b.colorTexto || "#F1ECE2") + ";" + textStyleCss(b.estilo, 15 * gs),
        }, [document.createTextNode(b.texto || "BOTÓN"), h("span", { class: "f-btn-arrow", text: "→" })]);
      })));
    }

    body.push(h("div", { class: "f-rule" }));

    // Up to 10 modelos, each stacked in the same full block — never side by side.
    ficha.modelos.forEach(function (m, i) {
      if (i > 0) body.push(h("div", { class: "f-rule" }));
      body.push(renderModelBlock(ficha, m, doc, gs));
    });

    const gc = ficha.gastosCierre;
    if (gc && gc.activo) {
      body.push(h("div", { class: "f-closing" }, [
        h("span", { class: "lbl", text: "Gastos aproximados de cierre:" }),
        h("span", { class: "amt", text: gc.monto ? C.fmtMoney(gc.monto, ficha.moneda) : "$_______" }),
      ]));
      body.push(h("div", { class: "f-closing-note", text: "Esta es una simulación de referencia; el monto real puede variar." }));
    }

    if (ficha.franjaActiva) {
      body.push(h("div", { class: "f-ribbon" }, [
        h("div", { class: "txt", style: textStyleCss(ficha.estiloFranja, 13 * gs), text: ficha.franjaTexto || "CARACTERÍSTICA DESTACADA" }),
      ]));
    }

    const nodes = [];
    if (isFirst) nodes.push(renderBrandHeader(doc));
    nodes.push(h("div", { class: "f-body" + (isFirst ? "" : " no-header") }, body));

    const eg = doc.estilosGlobales || { paperColor: "#F1ECE2", textScale: 100 };
    const pageStyle = [];
    if (eg.paperColor) pageStyle.push("background-color:" + eg.paperColor);
    if (eg.paperImage) pageStyle.push("background-image:url('" + eg.paperImage + "'); background-size:cover; background-position:top center;");
    // "Escala de texto global" used to be a CSS `zoom` on the whole page —
    // same bug as escalas.specs/pago had: html2canvas mis-measures text
    // under `zoom`, causing glyph spacing artifacts across the entire
    // document. Every scalable element above now takes `gs` as an explicit
    // multiplier on its own font-size instead, so nothing here needs zoom.
    // Always set the three font vars explicitly, even for the default (""
    // = Newsreader/Archivo) option — eg.fontFamily is "" (falsy) for that
    // case, and skipping the push then would silently fall back to the
    // app UI's own --font-display/--font-mono instead of the ficha's.
    {
      const fo = findFontOption(eg.fontFamily);
      pageStyle.push("--font-display:" + fo.display, "--font-body:" + fo.body, "--font-mono:" + fo.mono);
    }

    return h("div", { class: "ficha-page", style: pageStyle.join(";") }, nodes);
  }

  function renderMapBlock(mapa, gs) {
    gs = gs || 1;
    // The map image is painted as a CSS background (like the header photo)
    // rather than an <img> child: html2canvas has a known issue drawing an
    // <img> inside an overflow:hidden/rounded container at the wrong size,
    // which bled the map past the page's right edge in the exported PDF.
    const wrap = mapa.imagen
      ? h("div", { class: "map-canvas-wrap has-image", style: "background-image:url('" + mapa.imagen + "');" })
      : h("div", { class: "map-canvas-wrap ph", "data-label": "mapa" });
    (mapa.pines || []).forEach(function (p) {
      const scale = (p.scale || 100) / 100;
      // Scale is applied to the label itself (transform), not to the
      // absolutely-positioned wrapper (zoom) — html2canvas can miscompute
      // the page's captured width when `zoom` sits on a positioned element,
      // cutting off or overflowing the exported PDF page.
      const pin = h("div", { class: "map-pin", style: "left:" + p.x + "%; top:" + p.y + "%;" }, [
        h("div", {
          class: "label", text: p.nombre || "",
          style: "background:" + (p.bgColor || "#FFFFFF") + "; color:" + (p.textColor || "#171512") + "; transform:scale(" + scale + ");",
        }),
      ]);
      wrap.appendChild(pin);
    });
    const nodes = [];
    if (mapa.etiqueta) nodes.push(h("div", { class: "f-map-label", style: "font-size:" + (13 * gs) + "px", text: mapa.etiqueta }));
    nodes.push(wrap);
    return h("div", { class: "f-map-block" }, nodes);
  }

  function renderMapPage(doc) {
    // Up to MAX_MAPAS maps stacked on the same page — each with its own
    // image, pins, and an optional label banner ("Playa del Carmen"...).
    const gs = globalScaleOf(doc);
    const mapas = (doc.mapas && doc.mapas.length) ? doc.mapas : [{ imagen: null, pines: [], etiqueta: "" }];
    const blocks = [];
    mapas.forEach(function (mapa, i) {
      if (i > 0) blocks.push(h("div", { class: "f-rule" }));
      blocks.push(renderMapBlock(mapa, gs));
    });
    const eg = doc.estilosGlobales || { paperColor: "#F1ECE2", textScale: 100 };
    const mapPageStyle = [];
    if (eg.paperColor) mapPageStyle.push("background-color:" + eg.paperColor);
    if (eg.paperImage) mapPageStyle.push("background-image:url('" + eg.paperImage + "'); background-size:cover; background-position:top center;");
    {
      const fo = findFontOption(eg.fontFamily);
      mapPageStyle.push("--font-display:" + fo.display, "--font-body:" + fo.body, "--font-mono:" + fo.mono);
    }
    return h("div", { class: "ficha-page f-map-page", style: mapPageStyle.join(";") }, [
      h("div", { class: "f-body no-header" }, [
        h("div", { class: "f-eyebrow", style: "font-size:" + (13.5 * gs) + "px", text: "Ubicación de los proyectos" }),
        h("div", { class: "f-h1", style: "font-size:" + (34 * gs) + "px", text: mapas.length > 1 ? "Mapas" : "Mapa" }),
        h("div", { class: "f-rule" }),
      ].concat(blocks)),
    ]);
  }

  window.FichaRender = {
    h: h,
    icon: icon,
    textStyleCss: textStyleCss,
    renderFichaPage: renderFichaPage,
    renderMapPage: renderMapPage,
    FONT_OPTIONS: FONT_OPTIONS,
  };
})();
