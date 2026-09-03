/* =========================================================
   FichaFlow — PDF export
   Renders each ficha with the exact same function used for the
   live preview, captures it with html2canvas, and gives every
   page its own height (no dead space, no cut-off content).
   ========================================================= */
(function () {
  "use strict";

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // html2canvas flattens the whole page to pixels, so the <a href> buttons
  // (BROCHURE, RENDERS, UBICACIÓN, SHOWROOM) still *look* clickable in the
  // embedded image but have no real link behind them. This measures each
  // link's on-screen position in the exact DOM html2canvas just captured
  // and adds a real PDF link annotation over that same spot.
  function addLinkAnnotations(pdf, pageEl, pageWidthPt) {
    const pageRect = pageEl.getBoundingClientRect();
    if (!pageRect.width) return;
    const scale = pageWidthPt / pageRect.width;
    const links = pageEl.querySelectorAll("a[href]");
    links.forEach(function (a) {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const r = a.getBoundingClientRect();
      pdf.link(
        (r.left - pageRect.left) * scale,
        (r.top - pageRect.top) * scale,
        r.width * scale,
        r.height * scale,
        { url: href }
      );
    });
  }

  function exportPdf(doc, navigateCurrentTab) {
    if (!window.html2canvas || !window.jspdf) {
      return Promise.reject(new Error("html2canvas/jsPDF no están disponibles (¿sin conexión a internet?)."));
    }
    const jsPDF = window.jspdf.jsPDF;
    const host = document.createElement("div");
    host.className = "off-dom";
    document.body.appendChild(host);

    const pages = doc.fichas.map(function (f, i) { return FichaRender.renderFichaPage(f, doc, i === 0); });
    const hasMap = (doc.mapas || []).some(function (m) { return m.imagen || (m.pines || []).length; });
    if (hasMap) pages.push(FichaRender.renderMapPage(doc));

    let pdf = null;

    function processPage(i) {
      if (i >= pages.length) return Promise.resolve();
      host.innerHTML = "";
      host.appendChild(pages[i]);
      return wait(60).then(function () {
        return window.html2canvas(pages[i], { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
      }).then(function (canvas) {
        const imgData = canvas.toDataURL("image/jpeg", 0.98);
        const pageWidthPt = 612; // US letter width
        const pageHeightPt = canvas.height * (pageWidthPt / canvas.width);
        // Pages shorter than they are wide (the map page) must say so
        // explicitly — jsPDF's addPage()/constructor otherwise assume
        // portrait and silently swap width/height for a [w,h] format
        // array, which clipped the map's right edge in the exported PDF.
        const orientation = pageHeightPt >= pageWidthPt ? "p" : "l";
        if (!pdf) {
          pdf = new jsPDF({ orientation: orientation, unit: "pt", format: [pageWidthPt, pageHeightPt] });
        } else {
          pdf.addPage([pageWidthPt, pageHeightPt], orientation);
        }
        pdf.addImage(imgData, "JPEG", 0, 0, pageWidthPt, pageHeightPt);
        addLinkAnnotations(pdf, pages[i], pageWidthPt);
        return processPage(i + 1);
      });
    }

    return processPage(0).then(function () {
      document.body.removeChild(host);
      if (!pdf) throw new Error("No hay fichas para exportar.");
      if (navigateCurrentTab) {
        // See the comment at the call site (render-app.js) — this avoids
        // both iOS Safari's unreliable forced-download path AND its
        // popup blocker (which defaults to ON and kills a pre-opened
        // window.open tab) by navigating the CURRENT tab to the file
        // instead — Safari's own PDF viewer handles links correctly,
        // and a same-tab location change is never treated as a popup.
        window.location.href = pdf.output("bloburl");
      } else {
        const name = (doc.clientName || "fichaflow").trim().replace(/\s+/g, "_");
        pdf.save(name + ".pdf");
      }
      return pages.length;
    }).catch(function (err) {
      if (host.parentNode) document.body.removeChild(host);
      throw err;
    });
  }

  window.PdfExport = { exportPdf: exportPdf };
})();
