/* =========================================================
   FichaFlow — shared sync (Supabase)
   The library of saved pages and the default design are shared
   across every device and every person using the app — unlike the
   document itself, which stays local to each browser on purpose.

   No accounts: this uses Supabase's public "anon" key (safe to embed
   in client code by design — Row Level Security is what actually
   controls access, not secrecy of this key) with row-level policies
   that allow full read/write. It's a private, low-stakes tool shared
   between a couple of people, not a public product, so a login
   screen would be more friction than protection here.

   library_pages: one row per saved page — concurrent additions from
   different devices insert separate rows instead of racing to
   overwrite one shared array.
   default_design: a single shared row (id=1) — last write wins,
   matching how "Guardar como diseño predeterminado" already behaved
   before this was shared.
   ========================================================= */
(function () {
  "use strict";

  const SUPABASE_URL = "https://nmsojsniefxjcuwcjner.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tc29qc25pZWZ4amN1d2NqbmVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MDY2MzcsImV4cCI6MjEwMzI4MjYzN30.C6fPikSBjG56-z4BcvMLzi59zgxA-SbKCgf712nptis";

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Fetching every row's full `ficha` (images and all) in one query can
  // add up to tens of MB combined once the library has several pages —
  // Supabase's statement timeout then cancels the whole query, and the
  // library looks empty even though nothing was lost. Two-step instead:
  // grab the lightweight id/saved_at list first (always fast), then pull
  // each full row on its own. One oversized or slow row can no longer
  // sink every other page — its failure is caught and skipped, and
  // whatever did load still renders.
  function loadLibraryRemote() {
    return client.from("library_pages").select("id, saved_at").order("saved_at", { ascending: true }).then(function (res) {
      if (res.error) throw res.error;
      const rows = res.data || [];
      // One at a time, not Promise.all — firing every row's fetch at once
      // was itself enough concurrent load to make some of them time out
      // too (the exact failure this is supposed to avoid). Sequential is
      // slower but each request lands cleanly on its own.
      let chain = Promise.resolve();
      const out = [];
      rows.forEach(function (row) {
        chain = chain.then(function () {
          return client.from("library_pages").select("ficha").eq("id", row.id).maybeSingle().then(function (full) {
            if (full.error || !full.data) return;
            out.push({ id: row.id, savedAt: row.saved_at, ficha: full.data.ficha });
          }).catch(function () {});
        });
      });
      return chain.then(function () { return out; });
    });
  }

  function addLibraryEntryRemote(entry) {
    return client.from("library_pages").insert({ id: entry.id, saved_at: entry.savedAt, ficha: entry.ficha }).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function removeLibraryEntryRemote(id) {
    return client.from("library_pages").delete().eq("id", id).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function loadDefaultDesignRemote() {
    return client.from("default_design").select("value").eq("id", 1).maybeSingle().then(function (res) {
      if (res.error) throw res.error;
      return res.data ? res.data.value : null;
    });
  }

  function saveDefaultDesignRemote(value) {
    return client.from("default_design").upsert({ id: 1, value: value, updated_at: new Date().toISOString() }).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function resetDefaultDesignRemote() {
    return client.from("default_design").delete().eq("id", 1).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  // design_presets: named, savable "snapshots" of a design (colors, fonts,
  // sizes) — one row per preset, same shared-across-everyone model as
  // library_pages, so you can flip between named looks (e.g. "FINAL")
  // without manually re-adjusting every field.
  function listDesignPresetsRemote() {
    return client.from("design_presets").select("*").order("saved_at", { ascending: true }).then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(function (row) {
        return { id: row.id, name: row.name, savedAt: row.saved_at, value: row.value };
      });
    });
  }

  function saveDesignPresetRemote(preset) {
    return client.from("design_presets").upsert({ id: preset.id, name: preset.name, saved_at: preset.savedAt, value: preset.value }).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  function deleteDesignPresetRemote(id) {
    return client.from("design_presets").delete().eq("id", id).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  // saved_documents / saved_document_fichas / saved_document_mapas: a whole
  // DOCUMENT (client name, every ficha, mapas, the lot) saved under a name
  // — e.g. "ALONSO" — so a set of properties already sent to one client
  // can be reopened and added to later instead of rebuilding it from
  // scratch. The library above saves single pages; this is the same idea
  // one level up, for the whole thing you'd actually hand someone.
  //
  // Split across three tables, each ficha AND each mapa its own row, for
  // the exact same reason the library moved off one big query per page —
  // writing (or reading) several fichas'/mapas' worth of embedded images
  // as ONE jsonb blob is easily large enough to hit Supabase's own
  // statement timeout by itself; that's confirmed, not theoretical (it
  // happened twice in real use — first with fichas bundled into meta,
  // then again with just the mapas still bundled in after fichas were
  // split out, since a mapa's own image can be just as large as a ficha's
  // gallery). `saved_documents.meta` holds only what's left once both are
  // taken out (client name, styles, exchange rate, and the fichas'/mapas'
  // order); each ficha and each mapa lives in its own row, written and
  // read ONE AT A TIME — not all at once, since concurrent large writes
  // are exactly what made the library's own read timeout worse in the
  // first place (see loadLibraryRemote above).
  function listSavedDocumentsRemote() {
    return client.from("saved_documents").select("id, name, saved_at, updated_at").order("updated_at", { ascending: false }).then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(function (row) {
        return { id: row.id, name: row.name, savedAt: row.saved_at, updatedAt: row.updated_at };
      });
    });
  }

  // Reads every row of `table` matching `saved_document_id` whose id is in
  // `order`, one request at a time (see the note above on why), and
  // returns them re-assembled in that same order. Shared by the ficha and
  // mapa read paths below since they're otherwise identical.
  function loadOrderedRows(table, column, documentId, order) {
    let chain = Promise.resolve();
    const out = [];
    order.forEach(function (itemId) {
      chain = chain.then(function () {
        // Scoped to THIS document, not just the item's own id — two
        // different saved documents can each hold their own copy of a
        // ficha/mapa that was never modified since, so the id alone isn't
        // unique across every saved document, only within one.
        return client.from(table).select(column).eq("saved_document_id", documentId).eq("id", itemId).maybeSingle().then(function (r) {
          if (r.error || !r.data) return; // one missing/bad row shouldn't sink the rest
          out.push(r.data[column]);
        }).catch(function () {});
      });
    });
    return chain.then(function () { return out; });
  }

  function loadSavedDocumentRemote(id) {
    return client.from("saved_documents").select("meta").eq("id", id).maybeSingle().then(function (res) {
      if (res.error) throw res.error;
      if (!res.data) return null;
      const meta = res.data.meta || {};
      return Promise.all([
        loadOrderedRows("saved_document_fichas", "ficha", id, meta.fichaOrder || []),
        loadOrderedRows("saved_document_mapas", "mapa", id, meta.mapaOrder || []),
      ]).then(function (results) {
        const doc = Object.assign({}, meta);
        delete doc.fichaOrder;
        delete doc.mapaOrder;
        doc.fichas = results[0];
        doc.mapas = results[1];
        return doc;
      });
    });
  }

  // Replaces every row of `table` for this document with the current set
  // — simplest correct way to reconcile "some fichas/mapas got removed
  // since the last save" without diffing old vs new — writing them one at
  // a time. Shared by the ficha and mapa write paths below.
  function writeOrderedRows(table, column, documentId, items) {
    return client.from(table).delete().eq("saved_document_id", documentId).then(function (res) {
      if (res.error) throw res.error;
      let chain = Promise.resolve();
      items.forEach(function (item) {
        chain = chain.then(function () {
          const row = { id: item.id, saved_document_id: documentId };
          row[column] = item;
          return client.from(table).insert(row).then(function (r) {
            if (r.error) throw r.error;
          });
        });
      });
      return chain;
    });
  }

  function saveSavedDocumentRemote(entry) {
    const fichas = (entry.document && entry.document.fichas) || [];
    const mapas = (entry.document && entry.document.mapas) || [];
    const meta = Object.assign({}, entry.document);
    delete meta.fichas;
    delete meta.mapas;
    meta.fichaOrder = fichas.map(function (f) { return f.id; });
    meta.mapaOrder = mapas.map(function (m) { return m.id; });
    return client.from("saved_documents").upsert({
      id: entry.id, name: entry.name, saved_at: entry.savedAt, updated_at: entry.updatedAt, meta: meta,
    }).then(function (res) {
      if (res.error) throw res.error;
      return writeOrderedRows("saved_document_fichas", "ficha", entry.id, fichas);
    }).then(function () {
      return writeOrderedRows("saved_document_mapas", "mapa", entry.id, mapas);
    });
  }

  function deleteSavedDocumentRemote(id) {
    // saved_document_fichas/saved_document_mapas rows cascade-delete via
    // the foreign key.
    return client.from("saved_documents").delete().eq("id", id).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  window.Sync = {
    loadLibraryRemote: loadLibraryRemote,
    addLibraryEntryRemote: addLibraryEntryRemote,
    removeLibraryEntryRemote: removeLibraryEntryRemote,
    loadDefaultDesignRemote: loadDefaultDesignRemote,
    saveDefaultDesignRemote: saveDefaultDesignRemote,
    resetDefaultDesignRemote: resetDefaultDesignRemote,
    listDesignPresetsRemote: listDesignPresetsRemote,
    saveDesignPresetRemote: saveDesignPresetRemote,
    deleteDesignPresetRemote: deleteDesignPresetRemote,
    listSavedDocumentsRemote: listSavedDocumentsRemote,
    loadSavedDocumentRemote: loadSavedDocumentRemote,
    saveSavedDocumentRemote: saveSavedDocumentRemote,
    deleteSavedDocumentRemote: deleteSavedDocumentRemote,
  };
})();
