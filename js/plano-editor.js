/* =========================================================
   FichaFlow — plano background eraser
   Manual-only editor (no automatic detection — that was tried
   before and removed because it altered colors it shouldn't
   have). Three tools: magic wand (click a color, erases every
   connected pixel close enough to it), brush (drag to erase
   freehand, adjustable size), and rectangle (drag a box, erases
   everything inside it on release). Undo history + a reset back
   to how the image looked when the editor was opened.

   Everything here is local canvas/DOM state, deliberately never
   routed through Store.update while the editor is open — only
   "Cancelar"/"✓ Aplicar" touch the document, so nothing else in
   the app re-rendering mid-edit can blow away the canvas.
   ========================================================= */
(function () {
  "use strict";
  const h = FichaRender.h;

  function segmentedRow(options, value, onChange) {
    const wrap = h("div", { class: "segmented" });
    const btns = options.map(function (opt) {
      const btn = h("button", { type: "button", text: opt.label, class: value === opt.value ? "active" : "" });
      btn.addEventListener("click", function () {
        btns.forEach(function (b, i) { b.classList.toggle("active", options[i].value === opt.value); });
        onChange(opt.value);
      });
      wrap.appendChild(btn);
      return btn;
    });
    return wrap;
  }

  function open(src, modelo) {
    Store.state.planoEditor = { src: src, modelo: modelo };
    window.App.render();
  }

  function renderModal(editorState) {
    const originalSrc = editorState.src;
    const modeloRef = editorState.modelo;

    const close = h("button", { type: "button", class: "btn btn-sm btn-ghost", text: "✕ Cancelar" });
    close.addEventListener("click", function () { Store.state.planoEditor = null; window.App.render(); });

    const box = h("div", { class: "modal-box modal-box-wide" }, [
      h("div", { class: "modal-head" }, [h("h2", { text: "Editor de plano" }), close]),
      h("p", { class: "modal-sub", text: "Borra el fondo tú mismo: varita para seleccionar por color, pincel para borrar a mano, o un rectángulo para limpiar un área completa. Nada se aplica automáticamente." }),
    ]);

    // ---- toolbar (built once "active" is known so buttons can highlight) ----
    let activeTool = "wand";
    let tolerance = 30;
    let brushSize = 40;

    const toleranceRow = h("div", { class: "field", style: "flex:0 0 200px;" }, [
      h("span", { class: "field-label", text: "Tolerancia (" + tolerance + ")" }),
      (function () {
        const r = h("input", { type: "range", min: "2", max: "120", class: "input" });
        r.value = tolerance;
        r.addEventListener("input", function () {
          tolerance = Number(r.value);
          toleranceRow.querySelector(".field-label").textContent = "Tolerancia (" + tolerance + ")";
        });
        return r;
      })(),
    ]);
    const brushRow = h("div", { class: "field", style: "flex:0 0 200px;" }, [
      h("span", { class: "field-label", text: "Tamaño de pincel (" + brushSize + "px)" }),
      (function () {
        const r = h("input", { type: "range", min: "6", max: "160", class: "input" });
        r.value = brushSize;
        r.addEventListener("input", function () {
          brushSize = Number(r.value);
          brushRow.querySelector(".field-label").textContent = "Tamaño de pincel (" + brushSize + "px)";
        });
        return r;
      })(),
    ]);

    function paintToolControls() {
      toleranceRow.style.display = activeTool === "wand" ? "" : "none";
      brushRow.style.display = activeTool === "brush" ? "" : "none";
    }

    const toolTabs = segmentedRow(
      [{ label: "🪄 Varita mágica", value: "wand" }, { label: "🖌 Pincel", value: "brush" }, { label: "▭ Rectángulo", value: "rect" }],
      activeTool,
      function (v) { activeTool = v; paintToolControls(); updateCanvasCursor(); }
    );

    const undoBtn = h("button", { type: "button", class: "btn btn-sm", text: "↩ Deshacer" });
    const resetBtn = h("button", { type: "button", class: "btn btn-sm btn-ghost", text: "↺ Reiniciar" });
    const rotateLeftBtn = h("button", { type: "button", class: "btn btn-sm btn-ghost", title: "Rotar 90° a la izquierda", text: "⟲" });
    const rotateRightBtn = h("button", { type: "button", class: "btn btn-sm btn-ghost", title: "Rotar 90° a la derecha", text: "⟳" });

    const toolbar = h("div", { class: "plano-editor-toolbar" }, [toolTabs, toleranceRow, brushRow, rotateLeftBtn, rotateRightBtn, undoBtn, resetBtn]);
    box.appendChild(toolbar);

    // ---- canvas ----
    const canvas = h("canvas", { class: "plano-editor-canvas" });
    const rectPreview = h("div", { class: "plano-editor-rect-preview", style: "display:none;" });
    const wrap = h("div", { class: "plano-editor-wrap" }, [canvas, rectPreview]);
    const scrollArea = h("div", { class: "plano-editor-scroll" }, [wrap]);
    box.appendChild(scrollArea);

    const footer = h("div", { style: "display:flex; justify-content:flex-end; gap:8px; margin-top:14px; flex:0 0 auto;" });
    const cancelBtn = h("button", { type: "button", class: "btn", text: "Cancelar" });
    const applyBtn = h("button", { type: "button", class: "btn btn-primary", text: "✓ Aplicar cambios" });
    footer.appendChild(cancelBtn);
    footer.appendChild(applyBtn);
    box.appendChild(footer);
    cancelBtn.addEventListener("click", function () { Store.state.planoEditor = null; window.App.render(); });

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let originalSnapshot = null; // { data, w, h } — how the image looked when the editor opened
    const undoStack = [];
    const UNDO_LIMIT = 15;

    // Snapshots carry their own width/height (not just pixel data) because
    // rotating changes the canvas's dimensions — restoring a pre-rotation
    // snapshot has to resize the canvas back first, or putImageData would
    // only cover part of it (or overflow) and leave stale pixels behind.
    function snapshot() {
      return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), w: canvas.width, h: canvas.height };
    }
    function restore(snap) {
      canvas.width = snap.w;
      canvas.height = snap.h;
      ctx.putImageData(snap.data, 0, 0);
    }
    function pushUndo() {
      undoStack.push(snapshot());
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
      undoBtn.disabled = false;
    }
    undoBtn.addEventListener("click", function () {
      const prev = undoStack.pop();
      if (!prev) return;
      restore(prev);
      if (!undoStack.length) undoBtn.disabled = true;
    });
    resetBtn.addEventListener("click", function () {
      if (!originalSnapshot) return;
      pushUndo();
      restore(originalSnapshot);
    });
    function rotateCanvas(deg) {
      pushUndo();
      const w = canvas.width, hgt = canvas.height;
      const tmp = document.createElement("canvas");
      tmp.width = hgt;
      tmp.height = w;
      const tctx = tmp.getContext("2d");
      tctx.translate(tmp.width / 2, tmp.height / 2);
      tctx.rotate((deg * Math.PI) / 180);
      tctx.drawImage(canvas, -w / 2, -hgt / 2);
      canvas.width = tmp.width;
      canvas.height = tmp.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tmp, 0, 0);
    }
    rotateLeftBtn.addEventListener("click", function () { rotateCanvas(-90); });
    rotateRightBtn.addEventListener("click", function () { rotateCanvas(90); });
    undoBtn.disabled = true;

    function toCanvasCoords(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    // ---- magic wand: iterative flood fill, erases every connected pixel
    // within `tolerance` of the clicked pixel's color ----
    function magicWandErase(startX, startY) {
      const w = canvas.width, hgt = canvas.height;
      startX = Math.max(0, Math.min(w - 1, Math.floor(startX)));
      startY = Math.max(0, Math.min(hgt - 1, Math.floor(startY)));
      const imgData = ctx.getImageData(0, 0, w, hgt);
      const data = imgData.data;
      const i0 = (startY * w + startX) * 4;
      const r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], a0 = data[i0 + 3];
      if (a0 === 0) return; // clicked an already-erased spot, nothing to do
      const visited = new Uint8Array(w * hgt);
      const stack = [startY * w + startX];
      visited[startY * w + startX] = 1;
      function matches(p) {
        const o = p * 4;
        return Math.abs(data[o] - r0) <= tolerance && Math.abs(data[o + 1] - g0) <= tolerance &&
               Math.abs(data[o + 2] - b0) <= tolerance && Math.abs(data[o + 3] - a0) <= tolerance;
      }
      while (stack.length) {
        const p = stack.pop();
        data[p * 4 + 3] = 0;
        const px = p % w, py = (p / w) | 0;
        if (px > 0) { const n = p - 1; if (!visited[n] && matches(n)) { visited[n] = 1; stack.push(n); } }
        if (px < w - 1) { const n = p + 1; if (!visited[n] && matches(n)) { visited[n] = 1; stack.push(n); } }
        if (py > 0) { const n = p - w; if (!visited[n] && matches(n)) { visited[n] = 1; stack.push(n); } }
        if (py < hgt - 1) { const n = p + w; if (!visited[n] && matches(n)) { visited[n] = 1; stack.push(n); } }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    function eraseSegment(x1, y1, x2, y2) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = brushSize;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    function updateCanvasCursor() {
      canvas.style.cursor = activeTool === "wand" ? "crosshair" : activeTool === "brush" ? "cell" : "crosshair";
    }

    let brushActive = false, lastX = 0, lastY = 0;
    let rectActive = false, rectStartClient = null;

    canvas.addEventListener("mousedown", function (e) {
      e.preventDefault();
      const p = toCanvasCoords(e.clientX, e.clientY);
      if (activeTool === "wand") {
        pushUndo();
        magicWandErase(p.x, p.y);
      } else if (activeTool === "brush") {
        pushUndo();
        brushActive = true;
        lastX = p.x; lastY = p.y;
        eraseSegment(p.x, p.y, p.x + 0.01, p.y + 0.01);
      } else if (activeTool === "rect") {
        pushUndo();
        rectActive = true;
        rectStartClient = { x: e.clientX, y: e.clientY };
        const rect = canvas.getBoundingClientRect();
        rectPreview.style.display = "block";
        rectPreview.style.left = (e.clientX - rect.left) + "px";
        rectPreview.style.top = (e.clientY - rect.top) + "px";
        rectPreview.style.width = "0px";
        rectPreview.style.height = "0px";
      }
    });
    document.addEventListener("mousemove", function (e) {
      if (brushActive) {
        const p = toCanvasCoords(e.clientX, e.clientY);
        eraseSegment(lastX, lastY, p.x, p.y);
        lastX = p.x; lastY = p.y;
      } else if (rectActive) {
        const rect = canvas.getBoundingClientRect();
        const x1 = rectStartClient.x, y1 = rectStartClient.y;
        const x2 = Math.max(rect.left, Math.min(rect.right, e.clientX));
        const y2 = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
        const left = Math.min(x1, x2) - rect.left, top = Math.min(y1, y2) - rect.top;
        rectPreview.style.left = left + "px";
        rectPreview.style.top = top + "px";
        rectPreview.style.width = Math.abs(x2 - x1) + "px";
        rectPreview.style.height = Math.abs(y2 - y1) + "px";
      }
    });
    document.addEventListener("mouseup", function (e) {
      if (brushActive) { brushActive = false; }
      if (rectActive) {
        rectActive = false;
        rectPreview.style.display = "none";
        const p1 = toCanvasCoords(rectStartClient.x, rectStartClient.y);
        const p2 = toCanvasCoords(e.clientX, e.clientY);
        const x = Math.max(0, Math.min(p1.x, p2.x));
        const y = Math.max(0, Math.min(p1.y, p2.y));
        const w = Math.min(canvas.width, Math.max(p1.x, p2.x)) - x;
        const hgt = Math.min(canvas.height, Math.max(p1.y, p2.y)) - y;
        if (w > 0 && hgt > 0) ctx.clearRect(x, y, w, hgt);
      }
    });

    applyBtn.addEventListener("click", function () {
      const finalSrc = canvas.toDataURL("image/png");
      Store.state.planoEditor = null;
      Store.update(function () { modeloRef.plano = finalSrc; });
    });

    // ---- load the image, then wire everything up ----
    const img = new Image();
    img.onload = function () {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      originalSnapshot = snapshot();
      paintToolControls();
      updateCanvasCursor();
    };
    img.src = originalSrc;

    return h("div", { class: "modal-overlay" }, [box]);
  }

  window.PlanoEditor = { open: open, renderModal: renderModal };
})();
