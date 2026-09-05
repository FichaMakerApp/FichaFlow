/* =========================================================
   FichaFlow — app shell + wizard
   Text/number inputs mutate the live state object directly
   (they're the same object stored in Store.state) and then call
   persistSilently(), which saves + refreshes only the preview
   pane, so the field you're typing in never loses focus.
   Everything else (toggles, add/remove, uploads, tab switches)
   calls persistStruct(), which saves and rebuilds the whole view.

   Two steps only: 1) cliente + fichas/modelos/mapa together,
   2) revisión y descarga. "Modo diseñador" lives in its own
   modal window, gated behind a password, separate from whatever
   page you're editing.
   ========================================================= */
(function () {
  "use strict";
  const h = FichaRender.h;
  const S = Store;
  const C = Currency;

  let previewSlot = null;
  let designerPreviewSlot = null;
  let railMetaRefs = null;
  let designPresetsLoaded = false;

  // Interface dark mode — a UI preference, not part of the ficha document,
  // so it gets its own localStorage key instead of living in Store.state.
  // The ficha/PDF itself never follows this (see the variable re-anchor on
  // .ficha-page in styles.css): it must always match the real template.
  const LS_THEME = "fichaflow.theme.v1";
  function getTheme() {
    try { return localStorage.getItem(LS_THEME) === "dark" ? "dark" : "light"; } catch (e) { return "light"; }
  }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(LS_THEME, t); } catch (e) {}
  }
  applyTheme(getTheme());

  // Ficha-level fields the designer edits that are safe to mirror across
  // every ficha when "aplicar a todas" is on. Deliberately excludes
  // per-ficha content (desarrollo, ciudad, precios, imágenes...) — only
  // the visual/style fields.
  const FICHA_STYLE_FIELDS = [
    "estiloEyebrow", "estiloTitulo", "estiloFranja", "estiloPagoMonto", "estiloPagoMontoSub",
    "estiloModeloNombre", "estiloModeloPrecio", "estiloModeloPrecioSub", "estiloModeloSpecs",
    "colorPrecioBadge", "estiloPrecioBadge", "colorPrecioBadgeTexto", "colorPagoHead", "estiloPagoHead", "colorPagoHeadTexto",
    "colorShowroom", "estiloShowroom", "escalas",
    // Previously missing from this list — "aplicar a todas" silently never
    // mirrored the concepto/momento text style to the other fichas even
    // though every other payment/price style did.
    "estiloPagoConcepto", "colorPagoConcepto", "estiloPagoMomento", "colorPagoMomento",
  ];

  function syncFichaStylesIfNeeded() {
    const state = S.state;
    if (!state.designerPanelOpen || !state.designerApplyToAll) return;
    if (!state.designerFichaId || state.designerFichaId === "MAP") return;
    const source = S.getFicha(state.designerFichaId);
    if (!source) return;
    state.document.fichas.forEach(function (f) {
      if (f.id === source.id) return;
      FICHA_STYLE_FIELDS.forEach(function (key) {
        f[key] = JSON.parse(JSON.stringify(source[key]));
      });
      // Matched by POSITION, not by label: every ficha's botones keep the
      // same fixed slot order (BROCHURE, RENDERS, UBICACIÓN), but the label
      // itself is a free-text field the user can rename per ficha — matching
      // by texto silently skipped a button the moment its wording differed
      // even slightly, which is exactly the "tengo que actualizarlos
      // manualmente" complaint.
      (f.botones || []).forEach(function (b, i) {
        const match = (source.botones || [])[i];
        if (match) {
          b.color = match.color;
          b.colorTexto = match.colorTexto;
          b.estilo = JSON.parse(JSON.stringify(match.estilo));
        }
      });
    });
  }

  // Tracks whether we've already interrupted the user with the "no se pudo
  // guardar" alert for the CURRENT failure streak, so a burst of keystrokes
  // (each one calling persistSilently) doesn't spam a modal per keypress.
  // Resets itself as soon as a save succeeds again.
  let saveErrorAlerted = false;
  function checkSaveError() {
    const err = S.getLastSaveError();
    if (err && !saveErrorAlerted) {
      saveErrorAlerted = true;
      alert(
        "No se pudieron guardar los últimos cambios.\n\n" +
        "El documento probablemente se quedó sin espacio de almacenamiento del navegador (demasiadas imágenes en alta resolución). A partir de ahora los cambios pueden NO guardarse aunque parezca que todo va bien.\n\n" +
        "Recomendación: descarga el PDF ya mismo como respaldo de lo que llevas, y luego reduce el tamaño de las imágenes que subiste antes de seguir editando."
      );
    } else if (!err) {
      saveErrorAlerted = false;
    }
  }
  // Saving is async now (IndexedDB, not localStorage), so the outcome of
  // THIS particular call is only known once the returned promise settles —
  // checking S.getLastSaveError() synchronously right after calling
  // S.update() would still be reading the PREVIOUS write's result. Callers
  // that care about the outcome (the save button) chain onto the returned
  // promise; everything else is informed by the S.onSaveStatusChange
  // subscription below, which fires whenever any write actually settles.
  function persistSilently() {
    syncFichaStylesIfNeeded();
    const p = S.update(function () {}, { silent: true });
    refreshPreview();
    refreshDesignerPreview();
    refreshMeta();
    return p;
  }
  function persistStruct() {
    syncFichaStylesIfNeeded();
    return S.update(function () {});
  }

  function toast(msg, ms) {
    const t = h("div", { class: "toast", text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 3200);
  }
  window.UI = { toast: toast };

  // Every uploaded image (galería, plano, fondo de página) funnels through
  // here before being embedded as base64 in the document — and therefore
  // into localStorage. Downscaling oversized photos before storing is the
  // real fix for the "se llenó el almacenamiento y dejó de guardar" failure:
  // an unmodified phone photo can be 3000-4000px wide and several MB, and a
  // handful of those blow past the browser's per-origin storage quota with
  // no warning otherwise. 2000px is generous headroom for how large any
  // single element ever renders on a printed sales sheet.
  const MAX_IMAGE_DIM = 2000;
  function readFileAsDataURL(file, cb) {
    const reader = new FileReader();
    reader.onload = function () {
      const rawDataUrl = reader.result;
      const img = new Image();
      img.onload = function () {
        const w = img.naturalWidth, hgt = img.naturalHeight;
        if (w <= MAX_IMAGE_DIM && hgt <= MAX_IMAGE_DIM) { cb(rawDataUrl); return; }
        const scale = Math.min(MAX_IMAGE_DIM / w, MAX_IMAGE_DIM / hgt);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(hgt * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Keep PNG as PNG (in case it relies on transparency), everything
        // else re-encodes as JPEG — that's where most of the size win is.
        const isPng = file.type === "image/png";
        cb(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.85));
      };
      img.onerror = function () { cb(rawDataUrl); };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  }

  // ---------- small field builders ----------
  function field(label, inputEl, hint) {
    const wrap = h("div", { class: "field" }, [
      h("span", { class: "field-label", text: label }),
      inputEl,
    ]);
    if (hint) wrap.appendChild(h("span", { class: "field-hint", text: hint }));
    return wrap;
  }

  // House style: every free-text field types in caps. Mutates input.value
  // in place (not just a CSS text-transform) so the actual saved data is
  // uppercase everywhere it's used — ficha preview, PDF, everywhere — not
  // just visually in this one box. Restores cursor position afterward, and
  // skips the reassignment entirely when nothing actually changed case (so
  // it doesn't jostle the cursor while typing something already all-caps,
  // e.g. numbers).
  function uppercaseAsYouType(input) {
    input.addEventListener("input", function () {
      const upper = input.value.toUpperCase();
      if (upper !== input.value) {
        const start = input.selectionStart, end = input.selectionEnd;
        input.value = upper;
        input.setSelectionRange(start, end);
      }
    });
  }

  // Formats a "digits + at most one dot" string as "1,234,567" or
  // "1,234,567.89" — decimals only show up when the user actually typed a
  // decimal point, never padded to .00.
  function formatMoneyLive(cleaned) {
    const dotIdx = cleaned.indexOf(".");
    let intPart = dotIdx === -1 ? cleaned : cleaned.slice(0, dotIdx);
    const decPart = dotIdx === -1 ? null : cleaned.slice(dotIdx + 1).slice(0, 2);
    intPart = intPart.replace(/^0+(?=\d)/, "");
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (decPart === null) return withCommas;
    return (withCommas || "0") + "." + decPart;
  }

  // Reformats a money input's text live as you type (commas, decimals only
  // when present) while keeping the cursor in the right spot — counts
  // digits before the cursor in the old string, reformats, then walks the
  // new string to the same digit count instead of just leaving the cursor
  // wherever a naive reassignment would drop it. Reports the parsed plain
  // number back via onChange for storage; the "$"/currency around the
  // input are decoration (see moneyField), not part of the editable text,
  // so the cursor never has to fight fixed characters.
  function wireLiveMoneyInput(input, onChange) {
    function digitsBefore(str, pos) {
      let n = 0;
      for (let i = 0; i < pos && i < str.length; i++) if (/[\d.]/.test(str[i])) n++;
      return n;
    }
    function posAfterDigits(str, count) {
      let n = 0;
      for (let i = 0; i < str.length; i++) {
        if (n === count) return i;
        if (/[\d.]/.test(str[i])) n++;
      }
      return str.length;
    }
    input.addEventListener("input", function () {
      const cursor = input.selectionStart;
      const before = digitsBefore(input.value, cursor);
      let raw = input.value.replace(/[^\d.]/g, "");
      const firstDot = raw.indexOf(".");
      if (firstDot !== -1) raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
      const formatted = formatMoneyLive(raw);
      input.value = formatted;
      const pos = posAfterDigits(formatted, before);
      input.setSelectionRange(pos, pos);
      const numeric = raw === "" || raw === "." ? "" : parseFloat(raw);
      onChange(typeof numeric === "number" && isNaN(numeric) ? "" : numeric);
    });
  }

  // A currency field: "$" and the currency code sit outside the editable
  // text as fixed decoration, while the number in between formats live
  // with thousands separators as you type.
  function moneyField(label, value, currency, onInput, opts) {
    opts = opts || {};
    const input = h("input", { class: "input money-input", type: "text", inputmode: "decimal", placeholder: "0" });
    input.value = (value || value === 0) ? formatMoneyLive(String(value)) : "";
    wireLiveMoneyInput(input, onInput);
    const group = h("div", { class: "money-input-group" }, [
      h("span", { class: "money-affix", text: "$" }),
      input,
      h("span", { class: "money-affix", text: currency }),
    ]);
    return field(label, group, opts.hint);
  }

  function textField(label, value, onInput, opts) {
    opts = opts || {};
    const input = h(opts.textarea ? "textarea" : "input", {
      class: "input", type: opts.type || "text", placeholder: opts.placeholder || "",
    });
    input.value = value || "";
    if (opts.disabled) input.disabled = true;
    // Links must NOT be uppercased — URLs are case-sensitive past the
    // domain, and mangling one silently breaks the button it's attached to.
    if (!opts.noUppercase) uppercaseAsYouType(input);
    input.addEventListener("input", function () { onInput(input.value); });
    return field(label, input, opts.hint);
  }

  function segmented(options, value, onChange) {
    const wrap = h("div", { class: "segmented" });
    options.forEach(function (opt) {
      const btn = h("button", { type: "button", text: opt.label, class: value === opt.value ? "active" : "" });
      btn.addEventListener("click", function () { onChange(opt.value); });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function toggleRow(title, desc, checked, onChange) {
    const cb = h("input", { type: "checkbox" });
    cb.checked = !!checked;
    cb.addEventListener("change", function () { onChange(cb.checked); });
    const sw = h("label", { class: "switch" }, [cb, h("span", { class: "track" })]);
    return h("div", { class: "toggle-row" }, [
      h("div", { class: "txt" }, [
        h("div", { class: "t", text: title }),
        desc ? h("div", { class: "d", text: desc }) : null,
      ]),
      sw,
    ]);
  }

  function rangeField(label, value, min, max, onChange) {
    const input = h("input", { type: "range", min: String(min), max: String(max), class: "input" });
    input.value = value;
    const valLabel = h("span", { class: "field-hint", text: value + "%" });
    input.addEventListener("input", function () {
      valLabel.textContent = input.value + "%";
      onChange(Number(input.value));
    });
    return h("div", { class: "field" }, [h("span", { class: "field-label", text: label }), input, valLabel]);
  }

  // "Modo diseñador" — size + bold/italic/strike controls for a text style
  // object. `extraEl` (optional) is appended at the end of the same row —
  // used to fold a color swatch into this row instead of a separate one.
  function styleControlsRow(label, styleObj, extraEl) {
    // Defensive fallback: an older or imported document might be missing
    // this field even after normalizeDocument() — never let a missing
    // style object crash the whole designer modal.
    if (!styleObj) styleObj = S.defaultTextStyle();
    const sizeInput = h("input", { type: "number", class: "input", style: "width:64px;", min: "-20", max: "80" });
    sizeInput.value = styleObj.sizeDelta;
    sizeInput.addEventListener("input", function () {
      const clamped = Math.max(-20, Math.min(80, Number(sizeInput.value) || 0));
      styleObj.sizeDelta = clamped;
      persistSilently();
    });
    function toggleBtn(lbl, key) {
      const btn = h("button", { type: "button", class: "btn btn-sm" + (styleObj[key] ? " btn-primary" : ""), text: lbl });
      btn.addEventListener("click", function () {
        // Silent + toggle the button's own class in place, instead of the
        // usual full rebuild: a full rebuild inside the designer modal
        // recreates the scrollable panels from scratch, which resets their
        // scroll position to the top — clicking "N" while scrolled down
        // would visibly throw you back to the top of the window.
        styleObj[key] = !styleObj[key];
        btn.classList.toggle("btn-primary", !!styleObj[key]);
        persistSilently();
      });
      return btn;
    }
    const row = h("div", { style: "display:flex; gap:10px; align-items:center; margin-bottom:10px; flex-wrap:wrap;" }, [
      h("span", { style: "min-width:120px; font-size:12.5px; font-weight:700;", text: label }),
      h("span", { class: "field-label", text: "Tamaño ±" }), sizeInput,
      toggleBtn("N", "bold"), toggleBtn("K", "italic"), toggleBtn("T", "strike"),
    ]);
    if (extraEl) row.appendChild(extraEl);
    return row;
  }

  function colorStyleRow(label, ficha, colorKey, styleKey, fallbackColor) {
    const colorInput = h("input", { type: "color", class: "input", style: "max-width:44px; height:34px; padding:2px; flex:0 0 44px;" });
    colorInput.value = ficha[colorKey] || fallbackColor;
    colorInput.addEventListener("input", function () { ficha[colorKey] = colorInput.value; persistSilently(); });
    return styleControlsRow(label + " (texto)", ficha[styleKey], colorInput);
  }

  // Just a color swatch, no size/bold/italic/strike — for text whose size
  // and weight are already covered by another control (or, for "Precio
  // principal"/"secundario", deliberately follow the concepto/momento
  // style instead of getting their own).
  function colorOnlyRow(label, ficha, colorKey, fallbackColor) {
    const colorInput = h("input", { type: "color", class: "input", style: "max-width:44px; height:34px; padding:2px; flex:0 0 44px;" });
    colorInput.value = ficha[colorKey] || fallbackColor;
    colorInput.addEventListener("input", function () { ficha[colorKey] = colorInput.value; persistSilently(); });
    return h("div", { style: "display:flex; gap:10px; align-items:center; margin-bottom:10px;" }, [
      h("span", { style: "min-width:120px; font-size:12.5px; font-weight:700;", text: label }),
      colorInput,
    ]);
  }

  // Size-only version of styleControlsRow — used for "Precio principal"/
  // "secundario", whose font (negrita/cursiva/tachado) and color now
  // deliberately follow the concepto/momento style instead of having their
  // own, so only their independent size knob is left to show here.
  function sizeOnlyRow(label, styleObj, hint) {
    if (!styleObj) styleObj = S.defaultTextStyle();
    const sizeInput = h("input", { type: "number", class: "input", style: "width:64px;", min: "-20", max: "80" });
    sizeInput.value = styleObj.sizeDelta;
    sizeInput.addEventListener("input", function () {
      const clamped = Math.max(-20, Math.min(80, Number(sizeInput.value) || 0));
      styleObj.sizeDelta = clamped;
      persistSilently();
    });
    const row = h("div", { style: "display:flex; gap:10px; align-items:center; margin-bottom:4px; flex-wrap:wrap;" }, [
      h("span", { style: "min-width:120px; font-size:12.5px; font-weight:700;", text: label }),
      h("span", { class: "field-label", text: "Tamaño ±" }), sizeInput,
    ]);
    const nodes = [row];
    if (hint) nodes.push(h("p", { class: "field-hint", style: "margin:-4px 0 10px;", text: hint }));
    return h("div", {}, nodes);
  }

  function uploadSlot(src, label, onFile, onRemove) {
    // tabindex makes the label focusable, so clicking it (then Ctrl+V,
    // without needing to also click into some inner input) fires a native
    // "paste" event on it — same pattern as planoUploadSlot below.
    const slot = h("label", { class: "upload-slot", tabindex: "0" });
    if (src) {
      slot.appendChild(h("img", { src: src }));
      const rm = h("button", { class: "remove", type: "button", text: "✕" });
      rm.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); onRemove(); });
      slot.appendChild(rm);
    } else {
      slot.appendChild(h("div", { class: "placeholder", text: label + "\no clic aquí y pega con Ctrl+V" }));
    }
    const fi = h("input", { type: "file", accept: "image/*" });
    fi.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;
      readFileAsDataURL(file, onFile);
    });
    slot.appendChild(fi);
    slot.addEventListener("paste", function (e) {
      const items = (e.clipboardData || window.clipboardData).items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") === 0) {
          readFileAsDataURL(items[i].getAsFile(), onFile);
          e.preventDefault();
          break;
        }
      }
    });
    return slot;
  }

  // Plano-specific upload: opens the manual background-eraser editor on
  // every new upload (PlanoEditor, in plano-editor.js) instead of saving
  // the file as-is — nothing is applied to the document until the user
  // clicks "Aplicar" inside that editor. Paste-from-clipboard supported too.
  function handlePlanoFile(file, modelo) {
    readFileAsDataURL(file, function (dataUrl) {
      PlanoEditor.open(dataUrl, modelo);
    });
  }

  function planoUploadSlot(modelo) {
    const slot = h("label", { class: "upload-slot", tabindex: "0" });
    if (modelo.plano) {
      slot.appendChild(h("img", { src: modelo.plano }));
      const editBtn = h("button", { class: "edit", type: "button", text: "✏️" });
      editBtn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); PlanoEditor.open(modelo.plano, modelo); });
      const rm = h("button", { class: "remove", type: "button", text: "✕" });
      rm.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); modelo.plano = null; persistStruct(); });
      slot.appendChild(h("div", { class: "upload-actions" }, [editBtn, rm]));
    } else {
      slot.appendChild(h("div", { class: "placeholder", text: "Subir plano · o clic aquí y pega con Ctrl+V" }));
    }
    const fi = h("input", { type: "file", accept: "image/*" });
    fi.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (file) handlePlanoFile(file, modelo);
    });
    slot.appendChild(fi);
    slot.addEventListener("paste", function (e) {
      const items = (e.clipboardData || window.clipboardData).items;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") === 0) {
          handlePlanoFile(items[i].getAsFile(), modelo);
          e.preventDefault();
          break;
        }
      }
    });
    return slot;
  }

  // Gallery upload: crops to a fixed ratio matching where it sits in the
  // mosaic (wide top slot vs. the row of 3). Adjusting which part of the
  // image shows happens by double-clicking and dragging the image in the
  // live preview pane instead (see wireGalleryDblClick below) — this little
  // upload slot is just for picking/replacing/removing the file.
  function gallerySlot(g, ratio) {
    const upload = uploadSlot(g.src, "Imagen", function (dataUrl) {
      g.src = dataUrl; g.posX = 50; g.posY = 50; persistStruct();
    }, function () { g.src = null; persistStruct(); });

    const wrap = h("div", { class: "gallery-slot" }, [upload]);

    if (g.src) {
      const imgEl = upload.querySelector("img");
      imgEl.style.objectFit = "cover";
      imgEl.style.aspectRatio = ratio || "4/3";
      imgEl.style.width = "100%";
      imgEl.style.objectPosition = (g.posX || 50) + "% " + (g.posY || 50) + "%";
    }
    return wrap;
  }

  function sectionsLinear(items) {
    // items: [{key, title, done, body(container)}] — title/done are no
    // longer shown (no more per-section header bars), just one continuous,
    // unbroken form; still accepted here so call sites don't need to change.
    const wrap = h("div", { class: "sections-linear" });
    items.forEach(function (it) {
      const bodyWrap = h("div", { class: "sec-body" });
      it.body(bodyWrap);
      wrap.appendChild(bodyWrap);
    });
    return wrap;
  }

  // ---------- preview scaling ----------
  function scaledWrap(fichaEl) {
    const outer = h("div", { style: "position:relative; overflow:hidden;" }, [fichaEl]);
    function rescale() {
      const w = outer.clientWidth || 500;
      const scale = w / 816;
      fichaEl.style.transform = "scale(" + scale + ")";
      fichaEl.style.transformOrigin = "top left";
      outer.style.height = (fichaEl.scrollHeight * scale) + "px";
    }
    requestAnimationFrame(rescale);
    setTimeout(rescale, 120);
    return outer;
  }

  function thumbWrap(fichaEl) {
    const box = h("div", { class: "review-thumb" });
    const inner = h("div", { class: "thumb-inner" }, [fichaEl]);
    box.appendChild(inner);
    requestAnimationFrame(function () {
      const scale = (box.clientWidth || 74) / 816;
      fichaEl.style.width = "816px";
      inner.style.transform = "scale(" + scale + ")";
    });
    return box;
  }

  // Native HTML5 drag-and-drop reordering for a list of already-built
  // elements mapped 1:1 (by position) onto `arr`. Dropping an item onto
  // another moves it to that position in `arr`, then calls onReorder() —
  // used for ficha thumbnails, modelo tabs, etc.
  function enableDragReorder(els, arr, onReorder) {
    let dragIndex = null;
    els.forEach(function (el, index) {
      el.draggable = true;
      el.addEventListener("dragstart", function (e) {
        dragIndex = index;
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(index)); } catch (err) {} }
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", function () { el.classList.remove("dragging"); });
      el.addEventListener("dragover", function (e) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      });
      el.addEventListener("drop", function (e) {
        e.preventDefault();
        if (dragIndex === null || dragIndex === index) return;
        const moved = arr.splice(dragIndex, 1)[0];
        arr.splice(index, 0, moved);
        dragIndex = null;
        onReorder();
      });
    });
  }

  // Which gallery photo (by its stable .id) is currently draggable in the
  // live preview — tracked outside previewSlot's own contents because
  // refreshPreview() rebuilds that from scratch on every change anywhere in
  // the form (that's what lets typing elsewhere update the preview without
  // losing focus), so drag mode has to be re-applied consistently on every
  // rebuild rather than surviving as leftover DOM/listener state.
  let livePreviewDragGaleriaId = null;

  // How far a drag of `dxPx`/`dyPx` screen pixels should move object-position
  // (0-100), given how the image is actually scaled by object-fit:cover.
  // The box's own width/height is NOT the right divisor — cover scales the
  // image up until it fully covers the box, so the amount of "extra" image
  // available to pan through is (renderedSize - boxSize), not boxSize
  // itself. Using boxSize would make the image drift out of sync with the
  // cursor; this keeps the drag feeling 1:1.
  function dragOverflow(imgEl) {
    const rect = imgEl.getBoundingClientRect();
    const nw = imgEl.naturalWidth, nh = imgEl.naturalHeight;
    if (!nw || !nh || !rect.width || !rect.height) return { w: 0, h: 0 };
    const scale = Math.max(rect.width / nw, rect.height / nh);
    return { w: Math.max(0, nw * scale - rect.width), h: Math.max(0, nh * scale - rect.height) };
  }

  // Reads the drag position from either a MouseEvent or a TouchEvent, so
  // drag handlers can stay identical regardless of input device — iOS
  // Safari (and touch devices generally) don't fire mousemove/mouseup from
  // a finger drag, only the touch* events, which carry position in
  // touches/changedTouches instead of directly on the event.
  function pointFromEvent(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  // Double-click (or double-tap) a gallery photo IN THE LIVE PREVIEW (not
  // the small upload thumbnail in the form) to grab-drag it and adjust
  // which part shows, without changing its size/crop ratio. Doing it again
  // lets go.
  function wireGalleryDblClick(pageEl, ficha) {
    const imgEls = [];
    const mainImg = pageEl.querySelector(".f-gallery-main img");
    if (mainImg) imgEls.push(mainImg);
    pageEl.querySelectorAll(".f-gallery-row img").forEach(function (im) { imgEls.push(im); });
    (ficha.galeria || []).forEach(function (g, i) {
      const imgEl = imgEls[i];
      if (!imgEl || !g.src) return;
      const dragging = livePreviewDragGaleriaId === g.id;
      imgEl.style.cursor = dragging ? "grab" : "pointer";
      imgEl.title = dragging ? "Arrastra para ajustar · doble clic para soltar" : "Doble clic para arrastrar y ajustar el encuadre";
      imgEl.addEventListener("dblclick", function (e) {
        e.preventDefault();
        const turningOn = livePreviewDragGaleriaId !== g.id;
        livePreviewDragGaleriaId = turningOn ? g.id : null;
        if (turningOn) toast("Arrastra la imagen para ajustar el encuadre · doble clic para soltar", 2600);
        refreshPreview();
      });
      if (!dragging) return;
      // Without this, iOS treats a finger drag on the image as a page
      // scroll/pull gesture instead of handing us the touch events.
      imgEl.style.touchAction = "none";
      let active = false, startX = 0, startY = 0, startPosX = 50, startPosY = 50, overflow = { w: 0, h: 0 };
      function onStart(e) {
        e.preventDefault();
        active = true;
        imgEl.style.cursor = "grabbing";
        const p = pointFromEvent(e);
        startX = p.x; startY = p.y;
        startPosX = g.posX != null ? g.posX : 50;
        startPosY = g.posY != null ? g.posY : 50;
        overflow = dragOverflow(imgEl);
      }
      function onMove(e) {
        if (!active) return;
        e.preventDefault();
        const p = pointFromEvent(e);
        const dxPct = overflow.w > 0 ? ((p.x - startX) / overflow.w) * 100 : 0;
        const dyPct = overflow.h > 0 ? ((p.y - startY) / overflow.h) * 100 : 0;
        g.posX = Math.max(0, Math.min(100, startPosX - dxPct));
        g.posY = Math.max(0, Math.min(100, startPosY - dyPct));
        imgEl.style.objectPosition = g.posX + "% " + g.posY + "%";
      }
      function onEnd() {
        if (!active) return;
        active = false;
        imgEl.style.cursor = "grab";
        // Direct S.update (not persistSilently, which calls refreshPreview
        // and would tear this exact image/listeners out from under an
        // in-progress drag) — still saves, just doesn't self-destruct.
        S.update(function () {}, { silent: true });
      }
      imgEl.addEventListener("mousedown", onStart);
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onEnd);
      imgEl.addEventListener("touchstart", onStart, { passive: false });
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
      document.addEventListener("touchcancel", onEnd);
    });
  }

  function refreshPreview() {
    if (!previewSlot) return;
    previewSlot.innerHTML = "";
    const state = S.state;
    if (state.activeFichaId === "MAP") {
      previewSlot.appendChild(scaledWrap(FichaRender.renderMapPage(state.document)));
      return;
    }
    const f = S.getFicha(state.activeFichaId);
    if (f) {
      const isFirst = !!(state.document.fichas.length && f.id === state.document.fichas[0].id);
      const pageEl = FichaRender.renderFichaPage(f, state.document, isFirst);
      wireGalleryDblClick(pageEl, f);
      previewSlot.appendChild(scaledWrap(pageEl));
    }
  }

  function countAllPines(d) {
    return (d.mapas || []).reduce(function (n, m) { return n + (m.pines || []).length; }, 0);
  }

  function refreshMeta() {
    if (!railMetaRefs) return;
    const d = S.state.document;
    railMetaRefs.fichas.textContent = d.fichas.length;
    railMetaRefs.mapas.textContent = countAllPines(d);
    railMetaRefs.tc.textContent = d.exchangeRate;
  }

  window.addEventListener("resize", function () {
    if (S.state.step === 1) refreshPreview();
  });

  // =========================================================
  // RAIL
  // =========================================================
  function openDesignerModal() {
    const state = S.state;
    if (!state.designerUnlocked) {
      const pw = window.prompt("Contraseña del modo diseñador:");
      if (pw === null) return;
      if (pw !== S.DESIGNER_PASSWORD) { toast("Contraseña incorrecta."); return; }
      state.designerUnlocked = true;
      state.document.designerMode = true;
    }
    state.designerPanelOpen = true;
    if (!state.designerFichaId && state.document.fichas.length) state.designerFichaId = state.document.fichas[0].id;
    if (!designPresetsLoaded) {
      designPresetsLoaded = true;
      S.loadDesignPresets().then(function () { render(); }).catch(function () {});
    }
    persistStruct();
  }

  function renderRail(state) {
    const steps = [
      { n: 1, label: "Cliente, fichas y mapa" },
      { n: 2, label: "Revisión y descarga" },
    ];
    const stepper = h("div", { class: "stepper-v" });
    steps.forEach(function (s) {
      const cls = state.step === s.n ? "current" : (state.step > s.n ? "done" : "");
      const btn = h("button", { type: "button", class: "step-btn " + cls }, [
        h("span", { class: "num", text: state.step > s.n ? "✓" : String(s.n) }),
        h("span", { text: s.label }),
      ]);
      btn.addEventListener("click", function () { state.step = s.n; state.railMenuOpen = false; persistStruct(); });
      stepper.appendChild(btn);
    });

    railMetaRefs = {
      fichas: h("b", { text: state.document.fichas.length }),
      mapas: h("b", { text: countAllPines(state.document) }),
      tc: h("b", { text: state.document.exchangeRate }),
    };

    const designerBtn = h("button", { type: "button", class: "btn", style: "width:100%;", text: "🎨 Modo diseñador" });
    designerBtn.addEventListener("click", function () { state.railMenuOpen = false; openDesignerModal(); });

    const themeBtn = h("button", { type: "button", class: "btn btn-sm", style: "width:100%;" });
    function paintThemeBtn() {
      const dark = getTheme() === "dark";
      themeBtn.textContent = dark ? "☀ Modo claro" : "🌙 Modo oscuro";
    }
    paintThemeBtn();
    themeBtn.addEventListener("click", function () {
      applyTheme(getTheme() === "dark" ? "light" : "dark");
      paintThemeBtn();
    });

    const savedBadge = h("div", { class: "saved-badge" }, [h("span", { class: "dot" }), h("span", { class: "txt" })]);
    paintSavedBadge(savedBadge);

    // Everything already autosaves on every change (that's what the badge
    // above is showing) — this button doesn't save anything the autosave
    // hasn't already saved. It exists purely so there's an explicit action
    // to click for peace of mind, with its own immediate confirmation.
    const saveBtn = h("button", { type: "button", class: "btn btn-sm", style: "width:100%;", text: "💾 Guardar cambios" });
    saveBtn.addEventListener("click", function () {
      persistSilently().then(function () {
        paintSavedBadge(savedBadge);
        if (S.getLastSaveError()) {
          toast("⚠ No se pudo guardar (ver aviso)", 3200);
        } else {
          toast("Cambios guardados ✓", 1800);
        }
      });
    });

    const storageBtn = h("button", { type: "button", class: "btn btn-sm", style: "width:100%;", text: "📊 Ver almacenamiento" });
    storageBtn.addEventListener("click", function () { state.storagePanelOpen = true; state.railMenuOpen = false; persistStruct(); });

    // Guardar cambios and Modo oscuro stay permanently visible/reachable —
    // everything else (pasos, almacenamiento, modo diseñador, contadores)
    // lives behind a collapsible menu instead of always taking up space.
    const menuBtn = h("button", { type: "button", class: "btn btn-sm rail-menu-toggle", text: state.railMenuOpen ? "✕ Cerrar" : "☰ Más" });
    menuBtn.addEventListener("click", function () { state.railMenuOpen = !state.railMenuOpen; persistStruct(); });

    const railFixed = h("div", { class: "rail-fixed" }, [savedBadge, saveBtn, themeBtn, menuBtn]);

    const railChildren = [
      h("div", { class: "brand" }, [
        h("div", { class: "name", text: "FichaFlow" }),
        h("div", { class: "sub", text: "Análisis de propiedades" }),
      ]),
      railFixed,
    ];

    if (state.railMenuOpen) {
      railChildren.push(h("div", { class: "rail-dropdown" }, [
        stepper,
        storageBtn,
        designerBtn,
        h("div", { class: "rail-meta" }, [
          h("div", { class: "row" }, [h("span", { text: "Fichas" }), railMetaRefs.fichas]),
          h("div", { class: "row" }, [h("span", { text: "Pines en mapa" }), railMetaRefs.mapas]),
          h("div", { class: "row" }, [h("span", { text: "Tipo de cambio" }), railMetaRefs.tc]),
        ]),
      ]));
    }

    return h("div", { class: "rail" }, railChildren);
  }

  // Nothing else shows that the app auto-saves to the browser on every
  // change — this makes that visible instead of leaving it implicit.
  function paintSavedBadge(el) {
    const dot = el.querySelector(".dot");
    const txt = el.querySelector(".txt");
    if (S.getLastSaveError()) {
      if (dot) dot.classList.add("dot-error");
      txt.textContent = "⚠ No se pudo guardar";
      return;
    }
    if (dot) dot.classList.remove("dot-error");
    const t = S.getLastSavedAt();
    if (!t) { txt.textContent = "Sin cambios todavía"; return; }
    const secs = Math.round((Date.now() - t) / 1000);
    let label;
    if (secs < 3) label = "Guardado";
    else if (secs < 60) label = "Guardado hace " + secs + " s";
    else label = "Guardado hace " + Math.round(secs / 60) + " min";
    txt.textContent = label;
  }
  setInterval(function () {
    const el = document.querySelector(".saved-badge");
    if (el) paintSavedBadge(el);
  }, 4000);
  // Fires whenever ANY write actually settles (autosave from typing,
  // explicit save button, anything) — this is what makes the failure
  // banner/alert reliable regardless of which code path triggered the
  // save, now that writes are async instead of blocking.
  S.onSaveStatusChange(function () {
    const el = document.querySelector(".saved-badge");
    if (el) paintSavedBadge(el);
    checkSaveError();
  });

  // =========================================================
  // STORAGE VIEWER — lets you see which images are taking up
  // space in the saved document and remove the ones you no
  // longer need, instead of the size being invisible until a
  // save silently fails.
  // =========================================================
  function estimateBytes(dataUrl) {
    // base64 encodes 3 bytes as 4 chars, so ~0.75 bytes per char.
    if (!dataUrl) return 0;
    return Math.round(dataUrl.length * 0.75);
  }
  function fmtBytes(n) {
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + " MB";
    if (n >= 1024) return Math.round(n / 1024) + " KB";
    return n + " B";
  }
  // The document and library live in IndexedDB now, whose quota is tied to
  // free disk space (realistically gigabytes) instead of the old ~5-10MB
  // localStorage ceiling. navigator.storage.estimate() is the browser's own
  // real accounting of that — no need to empirically probe for it the way
  // the old localStorage-based version of this had to.
  let cachedQuota = null;
  function getQuota(forceRefresh) {
    if (cachedQuota !== null && !forceRefresh) return Promise.resolve(cachedQuota);
    if (!(navigator.storage && navigator.storage.estimate)) {
      cachedQuota = { available: false };
      return Promise.resolve(cachedQuota);
    }
    return navigator.storage.estimate().then(function (est) {
      if (est && typeof est.quota === "number" && est.quota > 0) {
        cachedQuota = { available: true, used: est.usage || 0, total: est.quota };
      } else {
        cachedQuota = { available: false };
      }
      return cachedQuota;
    }).catch(function () {
      cachedQuota = { available: false };
      return cachedQuota;
    });
  }
  function renderQuotaBlockInto(container, quota) {
    container.innerHTML = "";
    const refreshBtn = h("button", { type: "button", class: "btn-icon btn-ghost", style: "width:auto; padding:0 8px; font-size:11px;", text: "🔄 Recalcular" });
    refreshBtn.addEventListener("click", function () {
      container.innerHTML = "";
      container.appendChild(h("p", { class: "field-hint", text: "Calculando espacio disponible…" }));
      getQuota(true).then(function (q) { renderQuotaBlockInto(container, q); });
    });
    if (!quota.available) {
      container.appendChild(h("div", { style: "display:flex; justify-content:space-between; align-items:center; gap:8px;" }, [
        h("span", { style: "font-size:13px; font-weight:700;", text: "Espacio disponible: no se pudo calcular" }),
        refreshBtn,
      ]));
      container.appendChild(h("p", { class: "field-hint", style: "margin-top:6px;", text:
        "Este navegador no dio un dato de cuota (poco común). Los documentos se guardan en IndexedDB, que normalmente permite varios GB — muy por encima de lo que permitía antes." }));
      return;
    }
    const pctUsed = quota.total ? Math.min(100, Math.round((quota.used / quota.total) * 100)) : 0;
    const freeBytes = Math.max(0, quota.total - quota.used);
    const quotaBarClass = pctUsed >= 90 ? "quota-bar-fill quota-danger" : pctUsed >= 70 ? "quota-bar-fill quota-warn" : "quota-bar-fill";
    container.appendChild(h("div", { style: "display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;" }, [
      h("span", { style: "font-size:13px; font-weight:700;", text: "Espacio ocupado: " + pctUsed + "%" }),
      refreshBtn,
    ]));
    container.appendChild(h("div", { class: "quota-bar-track" }, [h("div", { class: quotaBarClass, style: "width:" + pctUsed + "%;" })]));
    container.appendChild(h("p", { class: "field-hint", style: "margin-top:6px;", text:
      "Ocupado: " + fmtBytes(quota.used) + " · Libre: " + fmtBytes(freeBytes) + " · Total: " + fmtBytes(quota.total) +
      ". Dato real que reporta el navegador para el almacenamiento de esta app — puede variar un poco según cuánto espacio libre tenga el disco." }));
  }
  function collectImageUsage(doc) {
    const items = [];
    const eg = doc.estilosGlobales;
    if (eg && eg.paperImage) {
      items.push({
        label: "Fondo del documento (todas las páginas)",
        bytes: estimateBytes(eg.paperImage),
        remove: function () { eg.paperImage = null; },
      });
    }
    (doc.mapas || []).forEach(function (m, i) {
      if (m.imagen) {
        items.push({
          label: "Mapa " + (i + 1) + (m.etiqueta ? " · " + m.etiqueta : ""),
          bytes: estimateBytes(m.imagen),
          remove: function () { m.imagen = null; },
        });
      }
    });
    (doc.fichas || []).forEach(function (f) {
      const fichaName = f.desarrollo || "Ficha sin nombre";
      (f.galeria || []).forEach(function (g, i) {
        if (g.src) {
          items.push({
            label: fichaName + " · " + (i === 0 ? "imagen principal" : "imagen " + (i + 1)),
            bytes: estimateBytes(g.src),
            remove: function () { g.src = null; },
          });
        }
      });
      (f.modelos || []).forEach(function (m) {
        if (m.plano) {
          items.push({
            label: fichaName + " · " + (m.nombre || "modelo") + " · plano",
            bytes: estimateBytes(m.plano),
            remove: function () { m.plano = null; },
          });
        }
      });
    });
    items.sort(function (a, b) { return b.bytes - a.bytes; });
    return items;
  }
  function renderStorageModal(state) {
    const doc = state.document;
    const close = h("button", { type: "button", class: "btn btn-sm btn-ghost", text: "✕ Cerrar" });
    close.addEventListener("click", function () { state.storagePanelOpen = false; persistStruct(); });

    const box = h("div", { class: "modal-box" }, [
      h("div", { class: "modal-head" }, [h("h2", { text: "Uso de almacenamiento" }), close]),
      h("p", { class: "modal-sub", text: "Cada imagen que subes queda guardada dentro del mismo archivo de datos del navegador, que tiene espacio limitado. Si el guardado empieza a fallar, quita aquí las imágenes más pesadas que ya no necesites." }),
    ]);

    const items = collectImageUsage(doc);
    const totalBytes = items.reduce(function (sum, it) { return sum + it.bytes; }, 0);
    const errActive = !!S.getLastSaveError();

    // Quota summary: how full the browser's storage actually is right now,
    // not just how much this document's images add up to. Rendered as a
    // placeholder first and patched in place once the (async) real number
    // comes back, instead of blocking the whole modal on it.
    const quotaBlock = h("div", { class: "quota-block", style: "flex:0 0 auto;" }, [
      h("p", { class: "field-hint", text: "Calculando espacio disponible…" }),
    ]);
    box.appendChild(quotaBlock);
    getQuota(false).then(function (quota) { renderQuotaBlockInto(quotaBlock, quota); });

    box.appendChild(h("p", {
      class: "field-hint",
      style: "margin-bottom:14px; flex:0 0 auto;" + (errActive ? " color:#B33A3A; font-weight:700;" : ""),
      text: (errActive ? "⚠ El guardado está fallando ahora mismo. " : "") +
        "Total estimado en imágenes: " + fmtBytes(totalBytes) + " en " + items.length + (items.length === 1 ? " imagen." : " imágenes."),
    }));

    if (!items.length) {
      box.appendChild(h("p", { class: "field-hint", text: "Todavía no hay imágenes subidas." }));
      return h("div", { class: "modal-overlay" }, [box]);
    }

    const maxBytes = items[0].bytes || 1;
    const list = h("div", { class: "storage-list" });
    items.forEach(function (it) {
      const pct = Math.max(4, Math.round((it.bytes / maxBytes) * 100));
      const rmBtn = h("button", { type: "button", class: "btn-icon btn-ghost btn-danger", text: "✕" });
      rmBtn.addEventListener("click", function () {
        if (!confirm("¿Quitar esta imagen?\n\n" + it.label + "\n\nNo se puede deshacer.")) return;
        it.remove();
        persistStruct();
      });
      list.appendChild(h("div", { class: "storage-row" }, [
        h("div", { class: "storage-row-top" }, [
          h("span", { class: "storage-label", text: it.label }),
          h("span", { class: "storage-size", text: fmtBytes(it.bytes) }),
          rmBtn,
        ]),
        h("div", { class: "storage-bar-track" }, [h("div", { class: "storage-bar-fill", style: "width:" + pct + "%;" })]),
      ]));
    });
    box.appendChild(list);

    return h("div", { class: "modal-overlay" }, [box]);
  }

  // =========================================================
  // DESIGNER MODAL
  // =========================================================
  // Controls and preview each scroll on their own — neither is inside the
  // modal's own scroll container, so scrolling one never moves the other
  // (and never moves the page behind the modal either).
  function finishModal(box, controls, previewCol) {
    const row = h("div", { class: "modal-scroll-row" }, [controls, previewCol || null]);
    box.appendChild(row);
    return h("div", { class: "modal-overlay" }, [box]);
  }

  function renderDesignerModal(state) {
    const doc = state.document;
    const close = h("button", { type: "button", class: "btn btn-sm btn-ghost", text: "✕ Cerrar" });
    close.addEventListener("click", function () { state.designerPanelOpen = false; persistStruct(); });

    const box = h("div", { class: "modal-box modal-box-wide" }, [
      h("div", { class: "modal-head" }, [h("h2", { text: "Modo diseñador" }), close]),
      h("p", { class: "modal-sub", text: "Cambios de fondo, tamaños y estilo de texto para todo el documento. Se guardan solos." }),
    ]);

    const controls = h("div", { class: "modal-controls" });

    // Global
    const eg = doc.estilosGlobales;
    const globalSection = h("div", { class: "modal-section" }, [h("h3", { text: "Documento completo" })]);
    const bgInput = h("input", { type: "color", class: "input", style: "max-width:120px; height:38px; padding:2px;" });
    bgInput.value = eg.paperColor || "#DFDAD5";
    bgInput.addEventListener("input", function () { eg.paperColor = bgInput.value; persistSilently(); });
    globalSection.appendChild(field("Color de fondo de todas las páginas", bgInput, eg.paperImage ? "Se usa mientras no haya imagen de fondo." : null));

    const bgImgSlot = uploadSlot(eg.paperImage, "Subir imagen de fondo", function (dataUrl) {
      eg.paperImage = dataUrl; persistStruct();
    }, function () { eg.paperImage = null; persistStruct(); });
    globalSection.appendChild(field("Imagen de fondo (opcional)", bgImgSlot,
      "Cubre toda la página (816 px de ancho de diseño, capturada al doble para impresión). Sube al menos 1650 px de ancho. La altura de cada página cambia según cuántos modelos tenga, así que una imagen alta (2400 px o más) o una textura discreta se ve mejor que una foto con un punto focal preciso — el recorte puede variar de una página a otra."));

    globalSection.appendChild(rangeField("Escala de texto global", eg.textScale, 60, 160, function (v) {
      eg.textScale = v; persistSilently();
    }));

    const fontSelect = h("select", { class: "input" });
    FichaRender.FONT_OPTIONS.forEach(function (fo) {
      const opt = h("option", { value: fo.id, text: fo.label });
      if ((eg.fontFamily || "") === fo.id) opt.selected = true;
      fontSelect.appendChild(opt);
    });
    fontSelect.addEventListener("change", function () { eg.fontFamily = fontSelect.value; persistSilently(); });
    globalSection.appendChild(field("Tipografía", fontSelect, "Montserrat se carga en todas sus variantes de grosor e itálica."));

    globalSection.appendChild(h("p", { class: "field-label", style: "margin-top:14px; margin-bottom:6px;", text: "Encabezado (solo en la primera página, en el orden en que aparece)" }));
    globalSection.appendChild(styleControlsRow("\"Análisis de propiedades\"", eg.estiloHeaderTitulo));
    globalSection.appendChild(styleControlsRow("\"Para: cliente\"", eg.estiloHeaderPara));
    globalSection.appendChild(styleControlsRow("\"Elaborado por: asesor\"", eg.estiloHeaderElaboradoPor));
    controls.appendChild(globalSection);

    if (!doc.fichas.length) {
      controls.appendChild(h("div", { class: "modal-section" }, [h("p", { class: "empty-hint", text: "Agrega una ficha para editar sus estilos y ver la vista en vivo." })]));
      return finishModal(box, controls, null);
    }

    if (!state.designerFichaId || (state.designerFichaId !== "MAP" && !S.getFicha(state.designerFichaId))) {
      state.designerFichaId = doc.fichas[0].id;
    }

    const fichaSection = h("div", { class: "modal-section" }, [h("h3", { text: "Ficha" })]);
    const fichaSelect = h("select", { class: "input" });
    doc.fichas.forEach(function (f, i) {
      const opt = h("option", { value: f.id, text: "F" + (i + 1) + " · " + (f.desarrollo || "Sin nombre") });
      if (f.id === state.designerFichaId) opt.selected = true;
      fichaSelect.appendChild(opt);
    });
    const mapOpt = h("option", { value: "MAP", text: "⌖ Mapa final" });
    if (state.designerFichaId === "MAP") mapOpt.selected = true;
    fichaSelect.appendChild(mapOpt);
    fichaSelect.addEventListener("change", function () { state.designerFichaId = fichaSelect.value; persistStruct(); });
    fichaSection.appendChild(field("Elegir ficha", fichaSelect, "También controla qué se muestra en la vista en vivo de la derecha."));

    const applyAllRow = h("label", { style: "display:flex; gap:8px; align-items:center; margin:4px 0 14px; cursor:pointer;" });
    const applyAllCheck = h("input", { type: "checkbox" });
    applyAllCheck.checked = !!state.designerApplyToAll;
    applyAllCheck.addEventListener("change", function () {
      state.designerApplyToAll = applyAllCheck.checked;
      if (state.designerApplyToAll) syncFichaStylesIfNeeded();
      persistStruct();
    });
    applyAllRow.appendChild(applyAllCheck);
    applyAllRow.appendChild(h("span", { style: "font-size:12.5px; font-weight:700;", text: "Aplicar cambios de estilo a todas las fichas" }));
    fichaSection.appendChild(applyAllRow);
    fichaSection.appendChild(h("p", { class: "field-hint", style: "margin-top:-8px; margin-bottom:12px;", text: state.designerApplyToAll
      ? "Activado: los estilos, colores y escalas de esta ficha se copian a todas las demás al guardar."
      : "Desactivado: los cambios solo afectan a la ficha elegida arriba." }));

    if (state.designerFichaId === "MAP") {
      fichaSection.appendChild(h("p", { class: "field-hint", text: "El mapa usa el fondo y la escala de texto globales de arriba. No tiene estilos propios de texto todavía." }));
      controls.appendChild(fichaSection);
      return finishModal(box, controls, buildDesignerPreviewColumn(state));
    }

    const ficha = S.getFicha(state.designerFichaId);

    // Presets — apply a whole look (colors, fonts, sizes) to what you're
    // editing right now with one click, or save the current look under a
    // name to come back to later. Different from "diseño predeterminado"
    // below: a preset applies immediately and you can keep several; the
    // default design only shapes brand-new fichas/documents going forward.
    const presetsSection = h("div", { class: "modal-section" }, [h("h3", { text: "Presets de diseño" })]);
    const presetsList = h("div", { style: "display:flex; flex-direction:column; gap:6px; margin-bottom:12px;" });
    S.getDesignPresets().forEach(function (preset) {
      const row = h("div", { style: "display:flex; gap:8px; align-items:center;" });
      const applyBtn = h("button", { type: "button", class: "btn btn-sm", style: "flex:1;", text: "🪄 " + preset.name });
      applyBtn.addEventListener("click", function () {
        S.applyDesignPreset(preset.id, doc, ficha);
        toast("Preset \"" + preset.name + "\" aplicado a esta ficha y al documento.", 3200);
        persistStruct();
      });
      row.appendChild(applyBtn);
      if (!preset.builtin) {
        const delBtn = h("button", { type: "button", class: "btn btn-sm btn-danger", text: "🗑" });
        delBtn.addEventListener("click", function () {
          if (!window.confirm("¿Eliminar el preset \"" + preset.name + "\"? Esto no afecta ninguna ficha que ya lo tenga aplicado, solo lo quita de la lista.")) return;
          delBtn.disabled = true;
          S.deleteDesignPreset(preset.id).then(function () {
            toast("Preset eliminado.", 2400);
            persistStruct();
          }).catch(function () {
            toast("No se pudo eliminar el preset (revisa tu conexión).", 3200);
            delBtn.disabled = false;
          });
        });
        row.appendChild(delBtn);
      }
      presetsList.appendChild(row);
    });
    presetsSection.appendChild(presetsList);

    const presetNameInput = h("input", { type: "text", class: "input", placeholder: "Nombre del preset (por ejemplo, FINAL)" });
    const savePresetBtn = h("button", { type: "button", class: "btn btn-sm", text: "💾 Guardar configuración actual como preset" });
    savePresetBtn.addEventListener("click", function () {
      const name = presetNameInput.value.trim();
      if (!name) { toast("Ponle un nombre al preset primero."); return; }
      savePresetBtn.disabled = true;
      S.saveDesignPreset(name, doc, ficha).then(function () {
        toast("Preset \"" + name + "\" guardado — se comparte con todos tus dispositivos y con quien más use la app.", 3600);
        presetNameInput.value = "";
        savePresetBtn.disabled = false;
        persistStruct();
      }).catch(function () {
        toast("No se pudo guardar el preset (revisa tu conexión).", 3200);
        savePresetBtn.disabled = false;
      });
    });
    presetsSection.appendChild(field("Guardar como nuevo preset", presetNameInput));
    presetsSection.appendChild(savePresetBtn);
    presetsSection.appendChild(h("p", { class: "field-hint", style: "margin-top:8px;", text: "Un preset toma los colores, tipografía y tamaños de ESTA ficha (más el documento completo) y los guarda con nombre para poder aplicarlos después con un clic, en cualquier ficha, sin tener que ajustar todo a mano otra vez." }));
    controls.appendChild(presetsSection);

    const savedDesign = S.loadDefaultDesign();
    const saveDesignBtn = h("button", { type: "button", class: "btn btn-sm", text: "💾 Guardar como diseño predeterminado" });
    saveDesignBtn.addEventListener("click", function () {
      saveDesignBtn.disabled = true;
      S.saveDefaultDesign(doc, ficha).then(function () {
        toast("Diseño guardado — se comparte con todos los dispositivos y personas que usan la app.", 3200);
        persistStruct();
      }).catch(function () {
        toast("No se pudo guardar el diseño compartido (revisa tu conexión).", 3200);
        saveDesignBtn.disabled = false;
      });
    });
    const designBtnsRow = h("div", { style: "display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px;" }, [saveDesignBtn]);
    if (savedDesign) {
      const resetDesignBtn = h("button", { type: "button", class: "btn btn-sm btn-danger", text: "↺ Restablecer al diseño de fábrica" });
      resetDesignBtn.addEventListener("click", function () {
        resetDesignBtn.disabled = true;
        S.resetDefaultDesign().then(function () {
          toast("Se quitó el diseño predeterminado compartido — las próximas fichas nuevas vuelven a arrancar en blanco.", 3200);
          persistStruct();
        }).catch(function () {
          toast("No se pudo restablecer el diseño compartido (revisa tu conexión).", 3200);
          resetDesignBtn.disabled = false;
        });
      });
      designBtnsRow.appendChild(resetDesignBtn);
    }
    fichaSection.appendChild(designBtnsRow);
    fichaSection.appendChild(h("p", { class: "field-hint", style: "margin-bottom:14px;", text: savedDesign
      ? "Ya hay un diseño predeterminado guardado, compartido entre todos tus dispositivos y con quien más uses esta app. Guardar de nuevo lo reemplaza con los ajustes de esta ficha."
      : "Toma los estilos, colores y escalas de ESTA ficha (más los del documento completo, arriba) y los deja como punto de partida para toda ficha o documento nuevo — en cualquier dispositivo, para cualquiera que use esta app." }));

    // Everything below follows the same top-to-bottom order things actually
    // appear on the printed ficha: título → botones → cada modelo (nombre,
    // specs, precio, showroom, esquema de pago) → franja al final — así vas
    // ajustando en el mismo orden en que vas mirando la vista en vivo, sin
    // tener que subir y bajar entre secciones que no van en ese orden.
    fichaSection.appendChild(styleControlsRow("Ciudad · tipo · entrega", ficha.estiloEyebrow));
    fichaSection.appendChild(styleControlsRow("Título del desarrollo", ficha.estiloTitulo));

    const visibleBotones = ficha.botones.filter(function (b) { return b.visible; });
    if (visibleBotones.length) {
      visibleBotones.forEach(function (b) {
        const colorInput = h("input", { type: "color", class: "input", title: "Fondo del botón", style: "max-width:44px; height:34px; padding:2px; flex:0 0 44px;" });
        colorInput.value = b.color || "#2A2621";
        colorInput.addEventListener("input", function () { b.color = colorInput.value; persistSilently(); });
        const colorTextoInput = h("input", { type: "color", class: "input", title: "Color del texto", style: "max-width:44px; height:34px; padding:2px; flex:0 0 44px;" });
        colorTextoInput.value = b.colorTexto || "#F1ECE2";
        colorTextoInput.addEventListener("input", function () { b.colorTexto = colorTextoInput.value; persistSilently(); });
        const colorsWrap = h("div", { style: "display:flex; gap:6px;" }, [colorInput, colorTextoInput]);
        fichaSection.appendChild(styleControlsRow("Texto de \"" + (b.texto || "botón") + "\"", b.estilo, colorsWrap));
      });
      fichaSection.appendChild(h("p", { class: "field-hint", style: "margin-top:-6px; margin-bottom:14px;", text: "El primer color es el fondo del botón, el segundo es el color del texto." }));
    } else {
      fichaSection.appendChild(h("p", { class: "field-hint", text: "Esta ficha no tiene botones visibles todavía." }));
    }
    controls.appendChild(fichaSection);

    // Modelo text styles — shared by every modelo in this ficha (same as escalas).
    const modeloSection = h("div", { class: "modal-section" }, [
      h("h3", { text: "Modelos de esta ficha" }),
      h("p", { class: "field-hint", style: "margin-bottom:10px;", text: "Se aplica a los " + ficha.modelos.length + " modelo(s) de esta ficha a la vez." }),
    ]);
    modeloSection.appendChild(styleControlsRow("Nombre del modelo", ficha.estiloModeloNombre));
    modeloSection.appendChild(styleControlsRow("Habitaciones, baños y m² (íconos y texto)", ficha.estiloModeloSpecs));
    modeloSection.appendChild(colorStyleRow("Insignia \"Desde\"", ficha, "colorPrecioBadge", "estiloPrecioBadge", "#DDD4C2"));
    modeloSection.appendChild(colorOnlyRow("Texto \"Desde\"", ficha, "colorPrecioBadgeTexto", "#2A2621"));
    // Precio principal/secundario ya no tienen su propio negrita/cursiva/
    // color: siguen exactamente los de "Concepto"/"Momento" (más abajo en
    // este mismo panel), así que aquí solo queda su tamaño.
    modeloSection.appendChild(sizeOnlyRow("Precio principal", ficha.estiloModeloPrecio, "La fuente y el color siguen a \"Concepto\", más abajo."));
    modeloSection.appendChild(sizeOnlyRow("Precio secundario (otra moneda)", ficha.estiloModeloPrecioSub, "La fuente y el color siguen a \"Momento\", más abajo."));
    const showsShowroom = ficha.modelos.some(function (m) { return m.mostrarShowroom; });
    if (showsShowroom) {
      modeloSection.appendChild(colorStyleRow("Botón \"Showroom\"", ficha, "colorShowroom", "estiloShowroom", "#DDD4C2"));
    } else {
      modeloSection.appendChild(h("p", { class: "field-hint", text: "Activa \"Mostrar botón showroom\" en algún modelo para poder editar su estilo." }));
    }
    modeloSection.appendChild(colorStyleRow("Barra \"Esquema de pago\"", ficha, "colorPagoHead", "estiloPagoHead", "#DDD4C2"));
    modeloSection.appendChild(colorOnlyRow("Texto \"Esquema de pago\"", ficha, "colorPagoHeadTexto", "#2A2621"));
    modeloSection.appendChild(colorStyleRow("Concepto (ENGANCHE, SALDO A LA ENTREGA...)", ficha, "colorPagoConcepto", "estiloPagoConcepto", "#2A2621"));
    modeloSection.appendChild(colorStyleRow("Momento (AL FIRMAR, CONTRA ESCRITURA...)", ficha, "colorPagoMomento", "estiloPagoMomento", "#766D5F"));
    modeloSection.appendChild(styleControlsRow("Montos del esquema de pago", ficha.estiloPagoMonto));
    modeloSection.appendChild(styleControlsRow("Montos secundarios (≈ en otra moneda)", ficha.estiloPagoMontoSub));
    modeloSection.appendChild(h("p", { class: "field-hint", style: "margin-top:-6px;", text: "Los montos solo se muestran cuando la ficha NO tiene activa la tabla de precios por nivel." }));
    controls.appendChild(modeloSection);

    // Franja destacada renders after every modelo, at the very bottom of
    // the ficha — so its control lives at the bottom of the modal too.
    const franjaSection = h("div", { class: "modal-section" }, [h("h3", { text: "Franja destacada" })]);
    if (ficha.franjaActiva) {
      franjaSection.appendChild(styleControlsRow("Texto de la franja", ficha.estiloFranja));
    } else {
      franjaSection.appendChild(h("p", { class: "field-hint", text: "Activa la franja destacada en la ficha para poder editar su estilo." }));
    }
    controls.appendChild(franjaSection);

    return finishModal(box, controls, buildDesignerPreviewColumn(state));
  }

  function buildDesignerPreviewColumn(state) {
    const col = h("div", { class: "modal-preview" }, [
      h("div", { class: "live-badge" }, [h("span", { class: "live-dot" }), document.createTextNode("Vista en vivo")]),
      (function () {
        const scaleBox = h("div", { class: "preview-scale" });
        designerPreviewSlot = scaleBox;
        return scaleBox;
      })(),
    ]);
    refreshDesignerPreview();
    return col;
  }

  function refreshDesignerPreview() {
    if (!designerPreviewSlot) return;
    designerPreviewSlot.innerHTML = "";
    const state = S.state;
    const doc = state.document;
    if (state.designerFichaId === "MAP") {
      designerPreviewSlot.appendChild(scaledWrap(FichaRender.renderMapPage(doc)));
      return;
    }
    const f = S.getFicha(state.designerFichaId);
    if (f) {
      const isFirst = !!(doc.fichas.length && f.id === doc.fichas[0].id);
      designerPreviewSlot.appendChild(scaledWrap(FichaRender.renderFichaPage(f, doc, isFirst)));
    }
  }

  // =========================================================
  // STEP 1 — client + fichas/modelos/mapa together
  // =========================================================
  function renderClientPanel(state) {
    const d = state.document;
    return h("div", { class: "panel" }, [
      h("h2", { text: "¿Para quién es el análisis?" }),
      h("p", { class: "desc", text: "\"Para\" y \"Elaborado por\" aparecen centrados en el encabezado de la primera página." }),
      h("div", { class: "grid-2" }, [
        textField("Para (cliente)", d.clientName, function (v) { d.clientName = v; persistSilently(); }),
        textField("Elaborado por (asesor)", d.advisorName, function (v) { d.advisorName = v; persistSilently(); }),
      ]),
      h("div", { class: "grid-2" }, [
        textField("Tipo de cambio · MXN por 1 USD", d.exchangeRate, function (v) {
          d.exchangeRate = C.num(v) || d.exchangeRate; persistSilently();
        }, { type: "number", hint: "Se aplica a todas las fichas que muestren conversión." }),
      ]),
    ]);
  }

  function addBlankFicha() {
    const f = S.defaultFicha();
    S.state.document.fichas.push(f);
    S.state.activeFichaId = f.id;
    S.state.activeModeloIndex = 0;
    persistStruct();
  }

  // Replaces the whole open document with a fresh one (still starting from
  // the saved "diseño predeterminado" if there is one) — destructive, so it
  // confirms first. The library of saved pages is untouched; it isn't part
  // of the document.
  function startNewDocument() {
    if (!confirm(
      "¿Empezar un documento nuevo?\n\n" +
      "El documento que tienes abierto se reemplaza por uno vacío. Si no lo " +
      "exportaste como PDF o como respaldo JSON, se pierde — esto no se " +
      "puede deshacer."
    )) return;
    S.state.document = S.defaultDocument();
    S.state.activeFichaId = null;
    S.state.activeModeloIndex = 0;
    S.state.step = 1;
    persistStruct();
    toast("Documento nuevo listo.");
  }

  function renderQuickStart(state) {
    const grid = h("div", { class: "quickstart-grid" });
    const newCard = h("button", { type: "button", class: "qs-card" }, [
      h("div", { class: "ic", text: "＋" }),
      h("div", { class: "t", text: "Nueva ficha en blanco" }),
      h("div", { class: "d", text: "Empieza a capturar un desarrollo desde cero." }),
    ]);
    newCard.addEventListener("click", addBlankFicha);

    const libCard = h("button", { type: "button", class: "qs-card" }, [
      h("div", { class: "ic", text: "▤" }),
      h("div", { class: "t", text: "Cargar desde la biblioteca" }),
      h("div", { class: "d", text: state.library.length + " página(s) guardadas para reutilizar." }),
    ]);
    libCard.addEventListener("click", function () { state.showLibraryPanel = true; persistStruct(); });

    grid.appendChild(newCard);
    grid.appendChild(libCard);
    return h("div", { class: "panel" }, [
      h("p", { class: "eyebrow", text: "Inicio rápido" }),
      h("h2", { text: "¿Qué quieres hacer hoy?" }),
      h("p", { class: "desc", text: "Elige un camino y la aplicación te lleva directo al trabajo necesario." }),
      grid,
    ]);
  }

  function renderLibraryPanel(state) {
    if (!state.showLibraryPanel) return null;
    const closeBtn = h("button", { class: "btn btn-sm btn-ghost", type: "button", text: "Cerrar" });
    closeBtn.addEventListener("click", function () { state.showLibraryPanel = false; persistStruct(); });

    const grid = h("div", { class: "card-grid" });
    if (!state.library.length) {
      grid.appendChild(h("div", { class: "empty-hint", text: "Todavía no has guardado ninguna página. Usa \"Guardar en biblioteca\" dentro de una ficha." }));
    }
    state.library.forEach(function (entry, i) {
      const prog = S.fichaProgress(entry.ficha);
      const mainImg = entry.ficha.galeria && entry.ficha.galeria[0] && entry.ficha.galeria[0].src;
      const swatch = h("div", { class: "swatch" }, [
        h("div", { class: "swatch-label", text: entry.ficha.desarrollo || "Sin nombre" }),
      ]);
      if (mainImg) swatch.style.backgroundImage = "url(" + mainImg + ")";
      const card = h("div", { class: "page-card" }, [
        swatch,
        h("div", { class: "body" }, [
          h("div", { class: "name", text: entry.ficha.desarrollo || "Sin nombre" }),
          h("div", { class: "meta", text: entry.ficha.modelos.length + " modelo(s) · " + prog.filled + "/" + prog.total + " imágenes" }),
          h("div", { class: "progress" }, [h("span", { style: "width:" + Math.round((prog.filled / Math.max(1, prog.total)) * 100) + "%" })]),
          h("div", { class: "actions" }, (function () {
            const addBtn = h("button", { class: "btn btn-sm btn-primary", type: "button", text: "Agregar" });
            addBtn.addEventListener("click", function () {
              const clone = JSON.parse(JSON.stringify(entry.ficha));
              clone.id = S.uid();
              // A library page is a frozen snapshot from whenever it was
              // saved — it carries whatever design was current back then,
              // not whatever "modo diseñador" has set up since. Without
              // this, a page pulled in from the library keeps looking like
              // an old design no matter how many times you tweak and
              // "aplicar a todas" the current one, since that only mirrors
              // across fichas already open when you make the edit. Copying
              // the current document's own look onto it right away — same
              // fields "aplicar a todas" already mirrors — means it matches
              // from the moment it's added instead of needing a fresh edit
              // afterward to catch up.
              const styleSource = state.document.fichas[0];
              if (styleSource) {
                FICHA_STYLE_FIELDS.forEach(function (key) {
                  clone[key] = JSON.parse(JSON.stringify(styleSource[key]));
                });
                (clone.botones || []).forEach(function (b, i) {
                  const match = (styleSource.botones || [])[i];
                  if (match) {
                    b.color = match.color;
                    b.colorTexto = match.colorTexto;
                    b.estilo = JSON.parse(JSON.stringify(match.estilo));
                  }
                });
              }
              state.document.fichas.push(clone);
              state.activeFichaId = clone.id;
              state.activeModeloIndex = 0;
              persistStruct();
            });
            const delBtn = h("button", { class: "btn btn-sm btn-danger", type: "button", text: "Eliminar" });
            delBtn.addEventListener("click", function () {
              // addLibraryEntry/removeLibraryEntry already notify() on their
              // own (optimistic update, then confirmed or rolled back) — no
              // need to also persistStruct() here.
              S.removeLibraryEntry(entry.id).catch(function () {
                toast("No se pudo eliminar de la biblioteca compartida (revisa tu conexión).", 3200);
              });
            });
            return [addBtn, delBtn];
          })()),
        ]),
      ]);
      grid.appendChild(card);
    });

    return h("div", { class: "panel library-panel" }, [
      h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;" }, [
        h("h2", { text: "Páginas guardadas (compartida)" }), closeBtn,
      ]),
      grid,
    ]);
  }

  // Real mini previews instead of plain text tabs, so you can see which
  // ficha is which at a glance, and drag one onto another to reorder —
  // since "isFirst" (the branded header with logo/photo) always follows
  // whichever ficha ends up at position 0, dragging a different one to
  // the front moves the header there automatically, no extra step.
  function renderTabsBar(state) {
    const strip = h("div", { class: "ficha-thumb-strip" });
    const cardEls = [];
    state.document.fichas.forEach(function (f, i) {
      const isActive = state.activeFichaId === f.id;
      const isFirst = i === 0;
      const thumb = thumbWrap(FichaRender.renderFichaPage(f, state.document, isFirst));
      const card = h("button", {
        type: "button",
        class: "ficha-thumb-card" + (isActive ? " active" : ""),
        title: "Arrastra para reordenar",
      }, [
        thumb,
        h("div", { class: "ficha-thumb-label", text: "F" + (i + 1) + " · " + (f.desarrollo || "Sin nombre") }),
      ]);
      card.addEventListener("click", function () { state.activeFichaId = f.id; state.activeModeloIndex = 0; persistStruct(); });
      strip.appendChild(card);
      cardEls.push(card);
    });
    enableDragReorder(cardEls, state.document.fichas, function () { persistStruct(); });

    const addTab = h("button", { type: "button", class: "tab-btn", text: "＋ Nueva ficha" });
    addTab.addEventListener("click", addBlankFicha);

    const mapTab = h("button", { type: "button", class: "tab-btn" + (state.activeFichaId === "MAP" ? " active" : ""), text: "⌖ Mapa final" });
    mapTab.addEventListener("click", function () { state.activeFichaId = "MAP"; persistStruct(); });

    const newDocTab = h("button", { type: "button", class: "btn btn-standout", text: "🗎 Nuevo documento" });
    newDocTab.addEventListener("click", startNewDocument);

    const smallTabs = h("div", { class: "tabs", style: "margin-bottom:0;" }, [addTab, mapTab, newDocTab]);

    const libToggle = h("button", { type: "button", class: "btn btn-sm btn-ghost", text: "▤ Biblioteca (" + state.library.length + ")" });
    libToggle.addEventListener("click", function () { state.showLibraryPanel = !state.showLibraryPanel; persistStruct(); });

    return h("div", { style: "margin-bottom:14px;" }, [
      h("div", { style: "display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap;" }, [strip, smallTabs]),
      h("div", { style: "display:flex; justify-content:flex-end; margin-top:6px;" }, [libToggle]),
    ]);
  }

  // ---------- ficha editor: accordion sections ----------
  function sectionHeader(ficha) {
    const dupBtn = h("button", { class: "btn btn-sm", type: "button", text: "Duplicar" });
    dupBtn.addEventListener("click", function () {
      const clone = JSON.parse(JSON.stringify(ficha));
      clone.id = S.uid();
      clone.desarrollo = (clone.desarrollo || "Sin nombre") + " (copia)";
      S.state.document.fichas.push(clone);
      S.state.activeFichaId = clone.id;
      persistStruct();
    });
    const saveLibBtn = h("button", { class: "btn btn-sm", type: "button", text: "Guardar en biblioteca" });
    saveLibBtn.addEventListener("click", function () {
      const clone = JSON.parse(JSON.stringify(ficha));
      S.addLibraryEntry({ id: S.uid(), savedAt: Date.now(), ficha: clone }).then(function () {
        toast("Página guardada en la biblioteca compartida.");
      }).catch(function () {
        toast("No se pudo guardar en la biblioteca compartida (revisa tu conexión).", 3200);
      });
    });
    const delBtn = h("button", { class: "btn btn-sm btn-danger", type: "button", text: "Eliminar ficha" });
    delBtn.addEventListener("click", function () {
      const idx = S.state.document.fichas.findIndex(function (f) { return f.id === ficha.id; });
      if (idx >= 0) S.state.document.fichas.splice(idx, 1);
      S.state.activeFichaId = S.state.document.fichas.length ? S.state.document.fichas[0].id : null;
      persistStruct();
    });
    return h("div", { style: "display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap;" }, [
      h("h2", { text: ficha.desarrollo || "Nueva ficha", style: "font-size:18px;" }),
      h("div", { style: "display:flex; gap:6px; flex-wrap:wrap;" }, [dupBtn, saveLibBtn, delBtn]),
    ]);
  }

  function sectionHeaderBody(container, ficha) {
    container.appendChild(h("div", { class: "grid-2" }, [
      textField("Nombre del desarrollo", ficha.desarrollo, function (v) { ficha.desarrollo = v; persistSilently(); }),
      textField("Ciudad", ficha.ciudad, function (v) { ficha.ciudad = v; persistSilently(); }),
    ]));
    container.appendChild(h("div", { class: "grid-2" }, [
      textField("Tipo de propiedad", ficha.tipoPropiedad, function (v) { ficha.tipoPropiedad = v; persistSilently(); }),
      textField("Entrega", ficha.entrega, function (v) { ficha.entrega = v; persistSilently(); }),
    ]));
    const convCb = h("input", { type: "checkbox" });
    convCb.checked = !!ficha.mostrarConversion;
    convCb.addEventListener("change", function () { ficha.mostrarConversion = convCb.checked; persistStruct(); });
    const convSwitch = h("label", { class: "switch", style: "flex:0 0 38px;" }, [convCb, h("span", { class: "track" })]);
    const convToggle = h("label", { style: "display:flex; align-items:center; gap:8px; cursor:pointer; white-space:nowrap;" }, [
      convSwitch, h("span", { style: "font-size:12.5px; font-weight:700;", text: "Mostrar conversión" }),
    ]);

    container.appendChild(h("div", { style: "display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap;" }, [
      field("Moneda de esta ficha", segmented(
        [{ value: "MXN", label: "MXN" }, { value: "USD", label: "USD" }], ficha.moneda,
        function (v) { ficha.moneda = v; persistStruct(); }
      )),
      convToggle,
    ]));
    container.appendChild(h("p", { class: "field-hint", style: "margin-top:2px;", text: "La moneda aplica a todos los modelos, niveles y pagos de esta ficha. Con la conversión activa, también se muestra el precio en la otra moneda." }));
  }

  function renderPagoRows(container, ficha, modelo) {
    if (modelo.pagos.tipo === "entrega_inmediata") {
      container.appendChild(textField("Texto de pago", modelo.pagos.textoContado, function (v) {
        modelo.pagos.textoContado = v; persistSilently();
      }, { placeholder: "PAGO DE CONTADO O CRÉDITO HIPOTECARIO" }));
      return;
    }
    const rowsWrap = h("div", { class: "pay-rows" });
    const totalEl = h("div", { class: "pay-total" });
    function refreshTotal() {
      const t = C.totalPct(modelo.pagos.filas);
      totalEl.textContent = "Total del esquema · " + t + "%" + (t === 100 ? " ✓" : "");
      totalEl.className = "pay-total " + (t === 100 ? "ok" : "bad");
    }
    modelo.pagos.filas.forEach(function (row) {
      const pctInput = h("input", { class: "input", type: "number" }); pctInput.value = row.pct;
      const conceptoInput = h("input", { class: "input" }); conceptoInput.value = row.concepto;
      uppercaseAsYouType(conceptoInput);
      const momentoInput = h("input", { class: "input" }); momentoInput.value = row.momento;
      uppercaseAsYouType(momentoInput);
      const montoMxn = h("input", { class: "input", disabled: "disabled" });
      const montoUsd = h("input", { class: "input", disabled: "disabled" });

      function refreshAmounts() {
        const amt = C.pagoRowAmounts(row.pct, modelo.precioBase, ficha.moneda, S.state.document.exchangeRate);
        montoMxn.value = C.fmtMoney(ficha.moneda === "USD" ? amt.usd * S.state.document.exchangeRate : amt.mxn, "MXN");
        montoUsd.value = C.fmtMoney(ficha.moneda === "USD" ? amt.usd : amt.mxn / (S.state.document.exchangeRate || 1), "USD");
      }
      refreshAmounts();

      pctInput.addEventListener("input", function () { row.pct = C.num(pctInput.value); refreshAmounts(); refreshTotal(); persistSilently(); });
      conceptoInput.addEventListener("input", function () { row.concepto = conceptoInput.value; persistSilently(); });
      momentoInput.addEventListener("input", function () { row.momento = momentoInput.value; persistSilently(); });

      const rmBtn = h("button", { class: "btn-icon btn-ghost", type: "button", text: "×" });
      rmBtn.addEventListener("click", function () {
        const idx = modelo.pagos.filas.indexOf(row);
        modelo.pagos.filas.splice(idx, 1);
        persistStruct();
      });

      rowsWrap.appendChild(h("div", { class: "pay-row" }, [
        field("%", pctInput), field("Concepto", conceptoInput), field("Momento", momentoInput),
        field("Monto MXN", montoMxn), field("Aprox. USD", montoUsd), rmBtn,
      ]));
    });
    refreshTotal();
    const addRowBtn = h("button", { class: "btn btn-sm", type: "button", text: "＋ Agregar porcentaje" });
    addRowBtn.addEventListener("click", function () {
      modelo.pagos.filas.push({ id: S.uid(), pct: 0, concepto: "", momento: "" });
      persistStruct();
    });
    container.appendChild(rowsWrap);
    container.appendChild(totalEl);
    container.appendChild(addRowBtn);
  }

  function renderModeloBody(container, ficha, modelo) {
    container.appendChild(h("div", { class: "grid-2" }, [
      textField("Nombre del modelo", modelo.nombre, function (v) { modelo.nombre = v; persistSilently(); }),
      textField("Superficie m²", modelo.superficieM2, function (v) { modelo.superficieM2 = v; persistSilently(); }, { type: "number" }),
    ]));
    container.appendChild(h("div", { class: "grid-3" }, [
      textField("Etiqueta de superficie", modelo.etiquetaSuperficie, function (v) { modelo.etiquetaSuperficie = v; persistSilently(); }),
      textField("Habitaciones", modelo.habitaciones, function (v) { modelo.habitaciones = v; persistSilently(); }, { type: "number" }),
      textField("Baños", modelo.banos, function (v) { modelo.banos = v; persistSilently(); }, { type: "number" }),
    ]));
    container.appendChild(moneyField("Precio base", modelo.precioBase, ficha.moneda, function (v) {
      modelo.precioBase = v; persistSilently();
    }));

    container.appendChild(field("Plano del modelo", planoUploadSlot(modelo),
      "Se sube tal cual, sin editar la imagen. También puedes pegar una imagen copiada: clic en el recuadro y Ctrl+V."));

    container.appendChild(h("div", { class: "block-divider", style: "margin-top:6px;" }));
    container.appendChild(h("p", { class: "field-hint", style: "margin-bottom:8px;", text: "Tamaño de cada panel — se aplica a todos los modelos de esta ficha" }));
    container.appendChild(h("div", { class: "grid-3" }, [
      rangeField("Plano", ficha.escalas.plano, 60, 160, function (v) { ficha.escalas.plano = v; persistSilently(); }),
      rangeField("Información", ficha.escalas.specs, 60, 160, function (v) { ficha.escalas.specs = v; persistSilently(); }),
      rangeField("Tabla de pago", ficha.escalas.pago, 60, 160, function (v) { ficha.escalas.pago = v; persistSilently(); }),
    ]));

    container.appendChild(toggleRow("Botón showroom", "Aparece debajo del plano y abre el enlace que indiques.", modelo.mostrarShowroom,
      function (v) { modelo.mostrarShowroom = v; persistStruct(); }));
    if (modelo.mostrarShowroom) {
      container.appendChild(h("div", { class: "grid-2" }, [
        textField("Texto del botón", modelo.showroomTexto, function (v) { modelo.showroomTexto = v; persistSilently(); }, { placeholder: "Showroom" }),
        textField("Enlace del showroom", modelo.showroomEnlace, function (v) { modelo.showroomEnlace = v; persistSilently(); }, { noUppercase: true }),
      ]));
    }

    container.appendChild(toggleRow("Tabla de precios por nivel", "Se coloca debajo del plano y las especificaciones.", modelo.mostrarTablaNivel,
      function (v) { modelo.mostrarTablaNivel = v; persistStruct(); }));
    if (modelo.mostrarTablaNivel) {
      const nivelesWrap = h("div", { style: "display:flex; flex-direction:column; gap:8px;" });
      modelo.niveles.forEach(function (n) {
        const nameI = h("input", { class: "input" }); nameI.value = n.nombre;
        uppercaseAsYouType(nameI);
        nameI.addEventListener("input", function () { n.nombre = nameI.value; persistSilently(); });
        const priceField = moneyField("Precio", n.precio, "MXN", function (v) { n.precio = v; persistSilently(); });
        const rm = h("button", { class: "btn-icon btn-ghost", type: "button", text: "×" });
        rm.addEventListener("click", function () { modelo.niveles.splice(modelo.niveles.indexOf(n), 1); persistStruct(); });
        nivelesWrap.appendChild(h("div", { style: "display:flex; gap:8px; align-items:end;" }, [
          field("Nivel", nameI), priceField, rm,
        ]));
      });
      const addNivel = h("button", { class: "btn btn-sm", type: "button", text: "＋ Agregar nivel" });
      addNivel.addEventListener("click", function () {
        modelo.niveles.push({ id: S.uid(), nombre: "", precio: "" }); persistStruct();
      });
      container.appendChild(nivelesWrap);
      container.appendChild(addNivel);
    }

    container.appendChild(h("div", { class: "block-divider", style: "margin-top:6px;" }));
    container.appendChild(field("Esquema de pago", segmented(
      [{ value: "preventa", label: "Preventa" }, { value: "entrega_inmediata", label: "Entrega inmediata" }],
      modelo.pagos.tipo, function (v) { modelo.pagos.tipo = v; persistStruct(); }
    ), "Cada modelo conserva el suyo."));
    renderPagoRows(container, ficha, modelo);
  }

  // A modelo nobody has touched yet still exports as a full "$0, 0 habs"
  // block — easy to add by accident (or leave behind while drafting) and
  // not notice until the PDF is already out. Flagging it on its own tab
  // catches that before export instead of after.
  function isModeloEmpty(m) {
    return !m.plano && !m.precioBase && !m.habitaciones && !m.banos && !m.superficieM2;
  }

  function sectionModelosBody(container, ficha) {
    const tabs = h("div", { class: "tabs" });
    const emptyCount = ficha.modelos.filter(isModeloEmpty).length;
    const tabEls = [];
    ficha.modelos.forEach(function (m, i) {
      const empty = isModeloEmpty(m);
      const btn = h("button", {
        type: "button",
        class: "tab-btn" + (S.state.activeModeloIndex === i ? " active" : "") + (empty ? " tab-btn-empty" : ""),
        text: String(i + 1) + (empty ? " ·" : ""),
        title: empty ? "Este modelo todavía está vacío (sin plano, precio ni specs)." : "Arrastra para reordenar",
      });
      btn.addEventListener("click", function () { S.state.activeModeloIndex = i; persistStruct(); });
      tabs.appendChild(btn);
      tabEls.push(btn);
    });
    // activeModeloIndex is a plain index, not an id — capture which modelo
    // object it points at now, so after a drag reorders the array it can
    // be re-pointed at the same modelo instead of whatever slid into its
    // old numeric slot.
    const activeModeloBeforeDrag = ficha.modelos[Math.min(S.state.activeModeloIndex, ficha.modelos.length - 1)];
    enableDragReorder(tabEls, ficha.modelos, function () {
      S.state.activeModeloIndex = Math.max(0, ficha.modelos.indexOf(activeModeloBeforeDrag));
      persistStruct();
    });
    if (ficha.modelos.length < S.MAX_MODELOS) {
      const addBtn = h("button", { type: "button", class: "tab-btn", text: "＋" });
      addBtn.addEventListener("click", function () {
        ficha.modelos.push(S.defaultModelo(ficha.modelos.length + 1));
        S.state.activeModeloIndex = ficha.modelos.length - 1;
        persistStruct();
      });
      tabs.appendChild(addBtn);
    }
    container.appendChild(tabs);
    container.appendChild(h("p", { class: "field-hint", text: "Hasta " + S.MAX_MODELOS + " modelos por ficha. Cada uno se agrega debajo del anterior, con el mismo formato completo." }));
    if (emptyCount > 0 && ficha.modelos.length > 1) {
      container.appendChild(h("p", { class: "field-hint", style: "color:var(--danger);", text: "⚠ " + emptyCount + " modelo(s) marcados con \"·\" están vacíos y de todas formas se incluyen en el PDF. Bórralos con \"Eliminar este modelo\" si no los necesitas." }));
    }

    const idx = Math.min(S.state.activeModeloIndex, ficha.modelos.length - 1);
    const modelo = ficha.modelos[idx];
    renderModeloBody(container, ficha, modelo);

    if (ficha.modelos.length > 1) {
      const rm = h("button", { class: "btn btn-sm btn-danger", type: "button", text: "Eliminar este modelo" });
      rm.addEventListener("click", function () {
        ficha.modelos.splice(idx, 1);
        S.state.activeModeloIndex = 0;
        persistStruct();
      });
      container.appendChild(rm);
    }

    container.appendChild(h("div", { class: "block-divider", style: "margin-top:10px;" }));
    if (!ficha.gastosCierre) ficha.gastosCierre = { activo: false, monto: "" };
    container.appendChild(toggleRow("Gastos aproximados de cierre", "Panel opcional debajo del esquema de pago, con una leyenda de que es una simulación.", ficha.gastosCierre.activo,
      function (v) { ficha.gastosCierre.activo = v; persistStruct(); }));
    if (ficha.gastosCierre.activo) {
      container.appendChild(moneyField("Monto aproximado", ficha.gastosCierre.monto, ficha.moneda, function (v) { ficha.gastosCierre.monto = v; persistSilently(); },
        { hint: "Déjalo vacío para mostrar solo la línea en blanco a llenar a mano." }));
    }
  }

  function sectionFranjaBody(container, ficha) {
    container.appendChild(toggleRow("Franja destacada", "Actívala solo cuando quieras mostrar una característica especial.", ficha.franjaActiva,
      function (v) { ficha.franjaActiva = v; persistStruct(); }));
    if (ficha.franjaActiva) {
      container.appendChild(textField("Texto de la franja", ficha.franjaTexto, function (v) { ficha.franjaTexto = v; persistSilently(); },
        { placeholder: "ESCRIBE LA CARACTERÍSTICA DESTACADA" }));
    }
  }

  function sectionBotonesBody(container, ficha) {
    ficha.botones.forEach(function (b) {
      container.appendChild(toggleRow(b.texto || "Botón", "Visible en el PDF", b.visible, function (v) { b.visible = v; persistStruct(); }));
      if (b.visible) {
        // Color lives only in modo diseñador now, not here.
        container.appendChild(h("div", { class: "grid-2" }, [
          textField("Texto del botón", b.texto, function (v) { b.texto = v; persistSilently(); }),
          textField("Enlace", b.enlace, function (v) { b.enlace = v; persistSilently(); }, { noUppercase: true }),
        ]));
      }
    });
  }

  function sectionImagenesBody(container, ficha) {
    // Fixed mosaic: 1 wide slot (the main image) then 3 in a row — matches
    // exactly how it prints, so this isn't a free "add as many as you
    // want" gallery, and there's no separate "imagen principal" upload —
    // the first slot of the mosaic is the main image.
    while (ficha.galeria.length < 4) ficha.galeria.push(S.defaultGaleriaItem());
    const mainGrid = h("div", { class: "gallery-grid", style: "grid-template-columns:1fr; margin-bottom:10px;" }, [
      gallerySlot(ficha.galeria[0], "2/1"),
    ]);
    const rowGrid = h("div", { class: "gallery-grid", style: "grid-template-columns:repeat(3,1fr);" },
      [1, 2, 3].map(function (i) { return gallerySlot(ficha.galeria[i], "4/3"); }));
    container.appendChild(field("Imágenes de esta ficha (siempre estas 4, en este orden)", h("div", {}, [mainGrid, rowGrid]),
      "La primera va ancha arriba y es la imagen principal; las otras tres en fila debajo, con la misma proporción con la que se imprimen. Doble clic en la imagen dentro de \"Vista en vivo\" para arrastrarla y ajustar el encuadre."));
  }

  function renderFichaEditor(ficha, isFirst) {
    const panel = h("div", { class: "panel" });
    panel.appendChild(sectionHeader(ficha));
    if (isFirst) {
      panel.appendChild(h("p", { class: "field-hint", style: "margin-bottom:10px;", text: "Esta es la primera ficha del documento: lleva el encabezado con logo y foto. Las demás se ven sin encabezado." }));
    }
    // Same order the ficha itself renders in, top to bottom: título arriba,
    // luego imagen principal + galería + legal, luego botones, luego cada
    // modelo, y la franja hasta el final — así lo que acabas de llenar es
    // justo lo próximo que aparece en la vista en vivo, sin tener que subir
    // hasta el final para ver cómo quedaron imágenes o botones.
    panel.appendChild(sectionsLinear([
      { key: "header", title: "01 · Encabezado y moneda", done: !!ficha.desarrollo, body: function (c) { sectionHeaderBody(c, ficha); } },
      { key: "imagenes", title: "02 · Imágenes de la ficha", done: !!(ficha.galeria[0] && ficha.galeria[0].src), body: function (c) { sectionImagenesBody(c, ficha); } },
      { key: "botones", title: "03 · Botones", done: ficha.botones.some(function (b) { return b.visible; }), body: function (c) { sectionBotonesBody(c, ficha); } },
      { key: "modelos", title: "04 · Modelos (" + ficha.modelos.length + ")", done: true, body: function (c) { sectionModelosBody(c, ficha); } },
      { key: "franja", title: "05 · Franja destacada", done: ficha.franjaActiva, body: function (c) { sectionFranjaBody(c, ficha); } },
    ]));

    const addFichaBtn = h("button", { class: "btn btn-sm", type: "button", text: "＋ Agregar otra ficha" });
    addFichaBtn.addEventListener("click", addBlankFicha);
    const goMapBtn = h("button", { class: "btn btn-sm", type: "button", text: "⌖ Ir al mapa final" });
    goMapBtn.addEventListener("click", function () { S.state.activeFichaId = "MAP"; persistStruct(); });
    const newDocBtn = h("button", { class: "btn btn-standout", type: "button", text: "🗎 Nuevo documento" });
    newDocBtn.addEventListener("click", startNewDocument);
    panel.appendChild(h("div", { class: "quick-add-row" }, [addFichaBtn, goMapBtn, newDocBtn]));

    return panel;
  }

  function renderMapEditorPanel(state) {
    const panel = h("div", { class: "panel" });
    panel.appendChild(h("h2", { text: "Mapa final del documento" }));
    panel.appendChild(h("p", { class: "desc", text: "Se coloca siempre al final del documento. Tú subes la captura y marcas los pines a mano." }));
    const body = h("div");
    MapEditor.build(body, persistStruct, refreshPreview);
    panel.appendChild(body);

    const addFichaBtn = h("button", { class: "btn btn-sm", type: "button", text: "＋ Agregar otra ficha" });
    addFichaBtn.addEventListener("click", addBlankFicha);
    panel.appendChild(h("div", { class: "quick-add-row" }, [addFichaBtn]));
    return panel;
  }

  function renderStepMain(state) {
    const wrap = h("div", {});
    wrap.appendChild(renderClientPanel(state));

    const lib = renderLibraryPanel(state);
    if (lib) wrap.appendChild(lib);

    if (!state.document.fichas.length && state.activeFichaId !== "MAP") {
      wrap.appendChild(renderQuickStart(state));
      return wrap;
    }

    wrap.appendChild(renderTabsBar(state));

    const split = h("div", { class: "split2" });
    const formCol = h("div", { class: "split2-form" });
    if (state.activeFichaId === "MAP") {
      formCol.appendChild(renderMapEditorPanel(state));
    } else {
      const f = S.getFicha(state.activeFichaId);
      if (f) {
        const isFirst = !!(state.document.fichas.length && f.id === state.document.fichas[0].id);
        formCol.appendChild(renderFichaEditor(f, isFirst));
      } else {
        wrap.appendChild(renderQuickStart(state));
      }
    }

    const previewCol = h("div", { class: "split2-preview" }, [
      h("div", { class: "preview-shell" }, [
        h("div", { class: "live-badge" }, [h("span", { class: "live-dot" }), document.createTextNode("Vista en vivo")]),
        (function () {
          const scaleBox = h("div", { class: "preview-scale" });
          previewSlot = scaleBox;
          return scaleBox;
        })(),
      ]),
    ]);

    split.appendChild(formCol);
    split.appendChild(previewCol);
    wrap.appendChild(split);

    const nav = h("div", { style: "display:flex; justify-content:flex-end; margin-top:18px;" });
    const fwd = h("button", { class: "btn btn-primary", type: "button", text: "Revisar todo →" });
    fwd.addEventListener("click", function () { state.step = 2; persistStruct(); });
    nav.appendChild(fwd);
    wrap.appendChild(nav);

    refreshPreview();
    return wrap;
  }

  // =========================================================
  // STEP 2 — review + export
  // =========================================================
  function renderStepReview(state) {
    const d = state.document;
    const list = h("div", { class: "review-list" });
    d.fichas.forEach(function (f, i) {
      const prog = S.fichaProgress(f);
      const up = h("button", { class: "btn-icon btn-ghost", type: "button", text: "↑" });
      const down = h("button", { class: "btn-icon btn-ghost", type: "button", text: "↓" });
      up.disabled = i === 0; down.disabled = i === d.fichas.length - 1;
      up.addEventListener("click", function () {
        const tmp = d.fichas[i - 1]; d.fichas[i - 1] = d.fichas[i]; d.fichas[i] = tmp; persistStruct();
      });
      down.addEventListener("click", function () {
        const tmp = d.fichas[i + 1]; d.fichas[i + 1] = d.fichas[i]; d.fichas[i] = tmp; persistStruct();
      });
      const del = h("button", { class: "btn btn-sm btn-danger", type: "button", text: "Eliminar" });
      del.addEventListener("click", function () { d.fichas.splice(i, 1); persistStruct(); });

      const thumb = thumbWrap(FichaRender.renderFichaPage(f, d, i === 0));

      list.appendChild(h("div", { class: "review-row" }, [
        thumb,
        h("div", { class: "idx", text: String(i + 1) }),
        h("div", { class: "info" }, [
          h("div", { class: "t", text: (f.desarrollo || "Sin nombre") + (i === 0 ? " · con encabezado" : "") }),
          h("div", { class: "d", text: f.modelos.length + " modelo(s) · " + prog.filled + "/" + prog.total + " imágenes" }),
        ]),
        h("div", { class: "move" }, [up, down]),
        del,
      ]));
    });
    if (!d.fichas.length) list.appendChild(h("div", { class: "empty-hint", text: "Todavía no hay fichas en el documento." }));

    const hasMap = (d.mapas || []).some(function (m) { return m.imagen || (m.pines || []).length; });
    const mapThumb = hasMap ? thumbWrap(FichaRender.renderMapPage(d)) : h("div", { class: "review-thumb" });
    const mapRow = h("div", { class: "review-row" }, [
      mapThumb,
      h("div", { class: "idx", text: "⌖" }),
      h("div", { class: "info" }, [
        h("div", { class: "t", text: (d.mapas || []).length > 1 ? "Mapas finales" : "Mapa final" }),
        h("div", { class: "d", text: countAllPines(d) + " pin(es) marcados en " + (d.mapas || []).length + " mapa(s)" }),
      ]),
    ]);

    const pdfBtn = h("button", { class: "btn btn-primary", type: "button", text: "⭳ Descargar PDF" });
    pdfBtn.addEventListener("click", function () {
      pdfBtn.disabled = true; pdfBtn.textContent = "Generando…";
      // On iOS, PdfExport hands the file to the native share sheet instead
      // of forcing a download or navigating away — see the comment in
      // pdf-export.js for why (iOS's "Quick Look" preview, which a plain
      // download/navigation can land in, ignores PDF links entirely no
      // matter how correct the file is; the share sheet lets the user pick
      // a real PDF-capable destination instead).
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      PdfExport.exportPdf(d, isIOS).then(function (n) {
        toast(isIOS ? "PDF listo · " + n + " página(s). Elige dónde abrirlo o a quién enviárselo." : "PDF descargado · " + n + " página(s).");
        pdfBtn.disabled = false; pdfBtn.textContent = "⭳ Descargar PDF";
      }).catch(function (err) {
        console.error(err);
        toast("No se pudo generar el PDF. Revisa la consola.");
        pdfBtn.disabled = false; pdfBtn.textContent = "⭳ Descargar PDF";
      });
    });

    const backupBtn = h("button", { class: "btn", type: "button", text: "Exportar respaldo (JSON)" });
    backupBtn.addEventListener("click", exportBackup);
    const importLabel = h("label", { class: "btn", text: "Importar respaldo" });
    const importInput = h("input", { type: "file", accept: "application/json", style: "display:none;" });
    importInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (file) importBackup(file);
    });
    importLabel.appendChild(importInput);

    const back = h("button", { class: "btn", type: "button", text: "← Regresar" });
    back.addEventListener("click", function () { state.step = 1; persistStruct(); });

    const newDocBtn = h("button", { class: "btn btn-standout", type: "button", text: "🗎 Nuevo documento" });
    newDocBtn.addEventListener("click", startNewDocument);

    return h("div", {}, [
      h("div", { class: "panel" }, [
        h("h2", { text: "Documento combinado" }),
        h("p", { class: "desc", text: d.fichas.length + " ficha(s) · solo la primera lleva encabezado · el mapa siempre se coloca al final." }),
        list, mapRow,
      ]),
      h("div", { class: "export-bar" }, [
        h("div", {}, [
          h("div", { class: "t", text: "Todo listo para exportar" }),
          h("div", { class: "d", text: "El PDF usa exactamente lo que ves en la vista previa, página por página." }),
        ]),
        h("div", { style: "display:flex; gap:8px; flex-wrap:wrap; align-items:center;" }, [backupBtn, importLabel, pdfBtn, newDocBtn]),
      ]),
      h("div", { style: "margin-top:18px;" }, [back]),
    ]);
  }

  function exportBackup() {
    const payload = { document: S.state.document, library: S.state.library, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = (S.state.document.clientName || "fichaflow").trim().replace(/\s+/g, "_");
    a.href = url; a.download = name + "_respaldo.json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("Respaldo descargado.");
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.document) throw new Error("Archivo sin la forma esperada.");
        S.state.document = S.normalizeDocument(parsed.document);
        S.state.library = parsed.library || [];
        S.state.activeFichaId = S.state.document.fichas.length ? S.state.document.fichas[0].id : null;
        persistStruct();
        toast("Respaldo importado correctamente.");
      } catch (err) {
        console.error(err);
        toast("Ese archivo no se pudo leer como respaldo de FichaFlow.");
      }
    };
    reader.readAsText(file);
  }

  // =========================================================
  // ROOT
  // =========================================================
  // Any toggle that shows/hides other fields (mostrar conversión, un
  // botón visible, la franja, etc.) has to rebuild the DOM structurally —
  // there's no way around that. But app.innerHTML="" throws away every
  // scroll position along with the old nodes, so toggling something near
  // the bottom of a long form used to always throw you back to the top.
  // Remembering each scrollable container's position before the rebuild
  // and reapplying it to its replacement afterwards fixes that without
  // having to special-case every individual toggle.
  const SCROLL_PRESERVE_SELECTORS = [".split2-form", ".split2-preview", ".modal-controls", ".modal-preview", ".rail"];
  function captureScroll() {
    const positions = {};
    SCROLL_PRESERVE_SELECTORS.forEach(function (sel) {
      const el = document.querySelector(sel);
      if (el) positions[sel] = el.scrollTop;
    });
    positions.window = window.scrollY;
    return positions;
  }
  function restoreScroll(positions) {
    SCROLL_PRESERVE_SELECTORS.forEach(function (sel) {
      if (positions[sel] === undefined) return;
      const el = document.querySelector(sel);
      if (el) el.scrollTop = positions[sel];
    });
    if (positions.window !== undefined) window.scrollTo(0, positions.window);
  }

  // Library sync happens in the background after boot (see store.js) — this
  // surfaces a toast the first time a batch of failures shows up, without
  // re-nagging on every unrelated render. Nothing ever disappears from the
  // library because of a failed sync (each device always shows its own
  // local pages regardless), so this is informational, not a data-loss
  // warning — it just tells you those pages aren't shared with other
  // devices yet.
  let lastToastedLibraryFailureIds = "";
  function checkLibraryMigrationFailures() {
    const failed = S.getLibraryMigrationFailures();
    const ids = failed.map(function (f) { return f.id; }).sort().join(",");
    if (ids === lastToastedLibraryFailureIds) return;
    lastToastedLibraryFailureIds = ids;
    if (!failed.length) return;
    const names = failed.map(function (f) { return (f.ficha && f.ficha.desarrollo) || "sin nombre"; }).join(", ");
    toast("⚠ " + failed.length + " página(s) de la biblioteca no se pudieron compartir todavía (siguen visibles aquí, solo no en tus otros dispositivos): " + names + ". Se reintenta solo más tarde.", 6000);
  }

  function render() {
    const state = S.state;
    checkLibraryMigrationFailures();
    const app = document.getElementById("app");
    const scrollPositions = captureScroll();
    app.innerHTML = "";
    previewSlot = null;
    designerPreviewSlot = null;

    const main = h("div", { class: "main" });
    const titles = { 1: "Cliente, fichas y mapa", 2: "Revisión y descarga" };
    main.appendChild(h("div", { class: "topbar" }, [
      h("div", {}, [
        h("p", { class: "eyebrow", text: "Análisis de propiedades" }),
        h("h1", { text: titles[state.step] }),
      ]),
    ]));

    if (state.step === 2) main.appendChild(renderStepReview(state));
    else main.appendChild(renderStepMain(state));

    app.appendChild(renderRail(state));
    app.appendChild(main);
    if (state.designerPanelOpen) {
      try {
        app.appendChild(renderDesignerModal(state));
      } catch (err) {
        // A crash here used to fail completely silently — the button click
        // would do nothing visible at all. Now it at least tells you why.
        console.error("Modo diseñador: no se pudo abrir.", err);
        state.designerPanelOpen = false;
        toast("No se pudo abrir el modo diseñador (revisa la consola). Se cerró para no dejar la pantalla en blanco.");
      }
    }
    if (state.storagePanelOpen) {
      app.appendChild(renderStorageModal(state));
    }
    if (state.planoEditor) {
      app.appendChild(PlanoEditor.renderModal(state.planoEditor));
    }
    refreshMeta();
    restoreScroll(scrollPositions);
  }

  S.subscribe(render);
  window.App = { render: render };
})();
