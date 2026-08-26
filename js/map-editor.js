/* =========================================================
   FichaFlow — map pin editor
   User uploads their own map screenshot (e.g. from Google Earth,
   framed and angled however they like) and places pins by
   clicking on it. Only the name they type is shown — no marker
   icon, no auto-generated numbers — and an existing pin can be
   dragged to fix its position.
   Up to Store.MAX_MAPAS maps can share the final page, each with
   its own image, pins, and an optional label banner above it.
   ========================================================= */
(function () {
  "use strict";
  const h = FichaRender.h;

  function readFileAsDataURL(file, cb) {
    const reader = new FileReader();
    reader.onload = function () { cb(reader.result); };
    reader.readAsDataURL(file);
  }

  // House style: free-text fields type in caps. Mutates the actual value
  // (not just a CSS text-transform) so what's saved is uppercase
  // everywhere it's used, not just visually in this input.
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

  // Reads position from either a MouseEvent or a TouchEvent — iOS Safari
  // doesn't fire mousemove/mouseup from a finger drag, only touch* events,
  // which carry position in touches/changedTouches instead of directly on
  // the event.
  function pointFromEvent(e) {
    if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function pinStyleAttr(p) {
    return "left:" + p.x + "%; top:" + p.y + "%;";
  }

  // Builds the editor for a single map (mapa) at index mi within doc.mapas.
  function buildMapBlock(mapa, mi, doc, fullRender, refreshPreview) {
    const block = h("div", { class: "map-editor-block" });

    if (doc.mapas.length > 1) {
      block.appendChild(h("div", { class: "field-label", style: "margin-bottom:6px;", text: "Mapa " + (mi + 1) }));
    }

    const etiquetaInput = h("input", { class: "input", placeholder: "Ej. Playa del Carmen, Tulum, Cancún…" });
    etiquetaInput.value = mapa.etiqueta || "";
    uppercaseAsYouType(etiquetaInput);
    etiquetaInput.addEventListener("input", function () {
      Store.update(function (s) { s.document.mapas[mi].etiqueta = etiquetaInput.value; }, { silent: true });
      refreshPreview();
    });
    block.appendChild(h("div", { class: "field", style: "margin-bottom:10px;" }, [
      h("span", { class: "field-label", text: "Franja sobre este mapa (opcional)" }),
      etiquetaInput,
    ]));

    // No full-size image preview here on purpose — once there's an image,
    // the editing canvas right below (and "Vista en vivo") already show it
    // at full size, so a second copy just ate space for nothing.
    const fileInput = h("input", { type: "file", accept: "image/*" });
    fileInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;
      readFileAsDataURL(file, function (dataUrl) {
        Store.update(function (s) { s.document.mapas[mi].imagen = dataUrl; });
        fullRender();
      });
    });

    if (!mapa.imagen) {
      const uploadSlot = h("label", { class: "upload-slot", tabindex: "0" }, [
        h("div", { class: "placeholder", text: "Subir captura del mapa\n(Google Earth u otra)\no clic aquí y pega con Ctrl+V" }),
        fileInput,
      ]);
      uploadSlot.addEventListener("paste", function (e) {
        const items = (e.clipboardData || window.clipboardData).items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") === 0) {
            readFileAsDataURL(items[i].getAsFile(), function (dataUrl) {
              Store.update(function (s) { s.document.mapas[mi].imagen = dataUrl; });
              fullRender();
            });
            e.preventDefault();
            break;
          }
        }
      });
      block.appendChild(h("div", { class: "field" }, [
        h("span", { class: "field-label", text: "Captura del mapa" }),
        uploadSlot,
      ]));
    } else {
      const changeBtn = h("label", { class: "btn btn-sm", style: "display:inline-flex;" }, [
        document.createTextNode("🖼 Cambiar captura del mapa"),
        fileInput,
      ]);
      const rmBtn = h("button", { class: "btn btn-sm btn-danger", type: "button", text: "Quitar mapa" });
      rmBtn.addEventListener("click", function () {
        Store.update(function (s) { s.document.mapas[mi].imagen = null; s.document.mapas[mi].pines = []; });
        fullRender();
      });
      block.appendChild(h("div", { style: "display:flex; gap:8px; margin-bottom:10px;" }, [changeBtn, rmBtn]));
    }

    if (mapa.imagen) {
      const hint = h("p", { class: "field-hint", text: "Haz clic sobre el mapa para marcar un pin. Arrastra uno existente para corregir su posición." });
      block.appendChild(hint);

      const wrap = h("div", { class: "map-canvas-wrap editing" }, [
        h("img", { src: mapa.imagen }),
      ]);

      function startDrag(pinEl, p, downEvent) {
        downEvent.preventDefault();
        const rect = wrap.getBoundingClientRect();
        function clamp(v) { return Math.max(0, Math.min(100, v)); }
        function onMove(ev) {
          ev.preventDefault();
          const client = pointFromEvent(ev);
          const x = clamp(((client.x - rect.left) / rect.width) * 100);
          const y = clamp(((client.y - rect.top) / rect.height) * 100);
          p.x = x; p.y = y;
          pinEl.style.left = x + "%";
          pinEl.style.top = y + "%";
        }
        function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          document.removeEventListener("touchmove", onMove);
          document.removeEventListener("touchend", onUp);
          document.removeEventListener("touchcancel", onUp);
          Store.update(function () {}, { silent: true });
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        document.addEventListener("touchmove", onMove, { passive: false });
        document.addEventListener("touchend", onUp);
        document.addEventListener("touchcancel", onUp);
      }

      (mapa.pines || []).forEach(function (p) {
        const pinEl = h("div", { class: "map-pin", style: pinStyleAttr(p) }, [
          h("div", {
            class: "label", text: p.nombre || "Sin nombre",
            style: "background:" + (p.bgColor || "#FFFFFF") + "; color:" + (p.textColor || "#171512") + "; transform:scale(" + ((p.scale || 100) / 100) + ");",
          }),
        ]);
        pinEl.style.touchAction = "none";
        pinEl.addEventListener("mousedown", function (e) { startDrag(pinEl, p, e); });
        pinEl.addEventListener("touchstart", function (e) { startDrag(pinEl, p, e); }, { passive: false });
        wrap.appendChild(pinEl);
      });
      wrap.addEventListener("click", function (e) {
        if (e.target.closest(".map-pin")) return; // clicking/dragging a pin must not also add a new one
        const rect = wrap.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        Store.update(function (s) {
          s.document.mapas[mi].pines.push({ id: Store.uid(), x: x, y: y, nombre: "", bgColor: "#FFFFFF", textColor: "#171512", scale: 100 });
        });
        fullRender();
      });
      block.appendChild(wrap);

      const list = h("div", { class: "pin-list" });
      (mapa.pines || []).forEach(function (p, i) {
        const nameInput = h("input", { class: "input", placeholder: "Nombre del proyecto" });
        nameInput.value = p.nombre || "";
        uppercaseAsYouType(nameInput);
        nameInput.addEventListener("input", function () {
          Store.update(function (s) { s.document.mapas[mi].pines[i].nombre = nameInput.value; }, { silent: true });
          refreshPreview();
          const label = wrap.querySelectorAll(".map-pin .label")[i];
          if (label) label.textContent = nameInput.value || "Sin nombre";
        });

        const bgInput = h("input", { type: "color", class: "input", title: "Color de fondo del texto", style: "padding:2px; height:34px;" });
        bgInput.value = p.bgColor || "#FFFFFF";
        bgInput.addEventListener("input", function () {
          Store.update(function (s) { s.document.mapas[mi].pines[i].bgColor = bgInput.value; }, { silent: true });
          refreshPreview();
          const label = wrap.querySelectorAll(".map-pin .label")[i];
          if (label) label.style.background = bgInput.value;
        });

        const fgInput = h("input", { type: "color", class: "input", title: "Color del texto", style: "padding:2px; height:34px;" });
        fgInput.value = p.textColor || "#171512";
        fgInput.addEventListener("input", function () {
          Store.update(function (s) { s.document.mapas[mi].pines[i].textColor = fgInput.value; }, { silent: true });
          refreshPreview();
          const label = wrap.querySelectorAll(".map-pin .label")[i];
          if (label) label.style.color = fgInput.value;
        });

        const scaleInput = h("input", { type: "range", min: "60", max: "200", class: "input", title: "Tamaño del cuadro de texto" });
        scaleInput.value = p.scale || 100;
        scaleInput.addEventListener("input", function () {
          Store.update(function (s) { s.document.mapas[mi].pines[i].scale = Number(scaleInput.value); }, { silent: true });
          refreshPreview();
          const labelEl = wrap.querySelectorAll(".map-pin .label")[i];
          if (labelEl) labelEl.style.transform = "scale(" + (Number(scaleInput.value) / 100) + ")";
        });

        const del = h("button", { class: "btn btn-sm btn-danger", type: "button", text: "Eliminar" });
        del.addEventListener("click", function () {
          Store.update(function (s) { s.document.mapas[mi].pines.splice(i, 1); });
          fullRender();
        });

        const row = h("div", { class: "pin-list-row" }, [
          nameInput,
          h("div", { class: "field", style: "flex:0 0 auto;" }, [h("span", { class: "field-label", text: "Fondo" }), bgInput]),
          h("div", { class: "field", style: "flex:0 0 auto;" }, [h("span", { class: "field-label", text: "Texto" }), fgInput]),
          h("div", { class: "field", style: "flex:0 0 90px;" }, [h("span", { class: "field-label", text: "Tamaño" }), scaleInput]),
          del,
        ]);
        list.appendChild(row);
      });
      if (!mapa.pines.length) {
        list.appendChild(h("div", { class: "empty-hint", text: "Todavía no hay pines. Haz clic sobre el mapa para agregar el primero." }));
      }
      block.appendChild(list);
    }

    return block;
  }

  // container: DOM node to fill.
  // fullRender: call to fully rebuild the app (structural changes: add/remove pin, upload image).
  // refreshPreview: call to just update the live preview pane (typing a pin name).
  function build(container, fullRender, refreshPreview) {
    const doc = Store.state.document;
    container.innerHTML = "";
    if (!Array.isArray(doc.mapas) || !doc.mapas.length) doc.mapas = [Store.defaultMapaItem()];

    doc.mapas.forEach(function (mapa, mi) {
      if (mi > 0) container.appendChild(h("div", { class: "block-divider" }));
      const block = buildMapBlock(mapa, mi, doc, fullRender, refreshPreview);
      container.appendChild(block);
      if (doc.mapas.length > 1) {
        const rmMap = h("button", { class: "btn btn-sm btn-danger", type: "button", text: "Eliminar mapa " + (mi + 1) });
        rmMap.addEventListener("click", function () {
          Store.update(function (s) { s.document.mapas.splice(mi, 1); });
          fullRender();
        });
        container.appendChild(rmMap);
      }
    });

    if (doc.mapas.length < Store.MAX_MAPAS) {
      const addBtn = h("button", { type: "button", class: "btn btn-sm", style: "margin-top:10px;", text: "＋ Agregar otro mapa a esta página" });
      addBtn.addEventListener("click", function () {
        Store.update(function (s) { s.document.mapas.push(Store.defaultMapaItem()); });
        fullRender();
      });
      container.appendChild(addBtn);
      container.appendChild(h("p", { class: "field-hint", text: "Hasta " + Store.MAX_MAPAS + " mapas en la misma página final." }));
    }
  }

  window.MapEditor = { build: build };
})();
