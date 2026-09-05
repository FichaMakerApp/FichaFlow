/* =========================================================
   FichaFlow — PDF export
   Renders each ficha with the exact same function used for the
   live preview, captures it with html2canvas, and gives every
   page its own height (no dead space, no cut-off content).
   ========================================================= */
(function () {
  "use strict";

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Waits for every web font actually in use (Newsreader/Archivo/
  // Montserrat/etc., loaded from Google Fonts) to finish downloading.
  // A fixed short delay isn't enough on a slow connection — if a page
  // gets captured while still showing a fallback font, its baked-in
  // image uses one set of line heights/wrapping while the link
  // annotations (measured right after, once the real font has swapped
  // in) end up positioned for a DIFFERENT layout — a real, sometimes
  // large mismatch between the button in the image and where its link
  // actually sits, worse the further down the page it is. document.
  // fonts.ready resolves once loading has actually settled either way,
  // so this never blocks indefinitely even if a font request fails.
  function waitForFonts() {
    if (!document.fonts || !document.fonts.ready) return Promise.resolve();
    return document.fonts.ready.catch(function () {});
  }

  // html2canvas flattens the whole page to pixels, so the <a href> buttons
  // (BROCHURE, RENDERS, UBICACIÓN, SHOWROOM) still *look* clickable in the
  // embedded image but have no real link behind them. This measures each
  // link's on-screen position in the exact DOM html2canvas just captured
  // and adds a real PDF link annotation over that same spot.
  //
  // `scale` here MUST be the same value used to size the page itself
  // (pageWidthPt / pageRect.width, both measured straight from the live
  // DOM) — never one re-derived from the captured canvas's own pixel
  // dimensions. A phone under memory pressure can have html2canvas
  // silently produce a canvas at a different effective resolution than
  // `scale:3` asks for (mobile Safari has real canvas-size ceilings, and
  // a tall multi-modelo ficha at 3x can approach them); if the image is
  // then sized from THAT canvas while links are positioned from the DOM
  // rect, the two stop agreeing and every link ends up shifted from its
  // visible button by the same proportion, however far down the page it
  // is — which is exactly the "reacts lower than the button, same gap
  // everywhere" a real device reported. Deriving everything from one
  // single DOM measurement removes that whole class of mismatch.
  function addLinkAnnotations(pdf, pageEl, scale, pageRect) {
    const links = pageEl.querySelectorAll("a[href]");
    links.forEach(function (a) {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const r = a.getBoundingClientRect();
      const x = (r.left - pageRect.left) * scale;
      const y = (r.top - pageRect.top) * scale;
      const w = r.width * scale;
      const h = r.height * scale;
      // jsPDF 2.5.1's link() writes the annotation's /Rect as
      // [x1, flip(y), x2, flip(y+h)] without normalizing which of the two
      // Y values ends up smaller — since flip() is a page-height flip (a
      // decreasing function), y1 always comes out BIGGER than y2 whenever
      // a normal (positive) height is passed in. Lenient PDF renderers
      // (Chrome's pdf.js, most desktop viewers) silently swap them back;
      // this was the actual root cause of every "the PDF's buttons don't
      // work on iPhone" report — the file always had a real, correctly
      // placed link, but a Y-inverted Rect that at least Apple's own PDF
      // renderer would not treat as a valid clickable area, no matter
      // which app or delivery method opened it. Passing the BOTTOM edge
      // as y and a NEGATIVE height flips jsPDF's own (buggy) math back
      // the right way round, so the /Rect it writes ends up with y1 < y2
      // like every other tool expects — verified byte-for-byte before
      // this was wired in.
      pdf.link(x, y + h, w, -h, { url: href });
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
      // The short fixed wait gives the browser a tick to notice the newly
      // inserted text and kick off any font requests it needs; waiting on
      // fonts.ready after that is what actually guarantees those requests
      // (not just a fixed amount of time) have settled before capture.
      return wait(60).then(function () {
        return waitForFonts();
      }).then(function () {
        // Measured BEFORE capture, straight from the live DOM — this is
        // the one source of truth for the page's real proportions. The
        // captured canvas's own pixel dimensions are used only to draw
        // the image, never to work out where anything sits on the page.
        const pageWidthPt = 612; // US letter width
        const pageRect = pages[i].getBoundingClientRect();
        const scale = pageWidthPt / pageRect.width;
        const pageHeightPt = pageRect.height * scale;
        return window.html2canvas(pages[i], { scale: 3, useCORS: true, backgroundColor: "#ffffff" }).then(function (canvas) {
          const imgData = canvas.toDataURL("image/jpeg", 0.98);
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
          addLinkAnnotations(pdf, pages[i], scale, pageRect);
          return processPage(i + 1);
        });
      });
    }

    return processPage(0).then(function () {
      document.body.removeChild(host);
      if (!pdf) throw new Error("No hay fichas para exportar.");
      const name = (doc.clientName || "fichaflow").trim().replace(/\s+/g, "_") + ".pdf";
      if (navigateCurrentTab) {
        // Verified (with pdf.js, a real independent parser — not just a
        // byte grep) that the generated file itself is correct: valid
        // link annotations, right URLs, sane hit-test rectangles. The
        // buttons still didn't work after two different delivery
        // attempts (a pre-opened tab, then a same-tab navigation) because
        // the problem was never the file — it's that however iOS Safari
        // ends up presenting a downloaded/navigated-to PDF, it can land
        // in "Quick Look", which does not support link annotations at
        // all, no matter how correct the file is.
        //
        // The Web Share API sidesteps that entirely: it hands the actual
        // File to iOS's native share sheet, where you explicitly choose
        // where it goes (Files, Books, Mail, Messages, AirDrop, a real
        // PDF viewer) — every one of those opens a real, fully-featured
        // PDF view where links work, instead of letting Safari guess.
        const file = new File([pdf.output("blob")], name, { type: "application/pdf" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: name }).catch(function (err) {
            if (err && err.name === "AbortError") return; // user closed the share sheet — not a failure
            // Any other failure (share API acting up) falls back to the
            // same-tab navigation rather than leaving the user stuck.
            window.location.href = pdf.output("bloburl");
          });
        }
        // No Web Share support at all (older iOS) — same-tab navigation
        // is still strictly better than the old forced pdf.save().
        window.location.href = pdf.output("bloburl");
      } else {
        pdf.save(name);
      }
      return pages.length;
    }).catch(function (err) {
      if (host.parentNode) document.body.removeChild(host);
      throw err;
    });
  }

  window.PdfExport = { exportPdf: exportPdf };
})();
