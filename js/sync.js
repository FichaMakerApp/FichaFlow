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

  // saved_documents / saved_document_fichas: a whole DOCUMENT (client name,
  // every ficha, mapas, the lot) saved under a name — e.g. "ALONSO" — so a
  // set of properties already sent to one client can be reopened and added
  // to later instead of rebuilding it from scratch. The library above
  // saves single pages; this is the same idea one level up, for the whole
  // thing you'd actually hand someone.
  //
  // Split across two tables, each ficha its own row, for the exact same
  // reason the library moved off one big query per page — writing (or
  // reading) several fichas' worth of embedded images as ONE jsonb blob is
  // easily large enough to hit Supabase's own statement timeout by itself;
  // that's confirmed, not theoretical (it happened in testing with just 4
  // real fichas). `saved_documents.meta` holds everything that ISN'T a
  // ficha (client name, mapas, styles, and the fichas' order); each ficha
  // lives in its own saved_document_fichas row, written and read ONE AT A
  // TIME — not all at once, since concurrent large writes are exactly what
  // made the library's own read timeout worse in the first place (see
  // loadLibraryRemote above).
  function listSavedDocumentsRemote() {
    return client.from("saved_documents").select("id, name, saved_at, updated_at").order("updated_at", { ascending: false }).then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(function (row) {
        return { id: row.id, name: row.name, savedAt: row.saved_at, updatedAt: row.updated_at };
      });
    });
  }

  function loadSavedDocumentRemote(id) {
    return client.from("saved_documents").select("meta").eq("id", id).maybeSingle().then(function (res) {
      if (res.error) throw res.error;
      if (!res.data) return null;
      const meta = res.data.meta || {};
      const order = meta.fichaOrder || [];
      let chain = Promise.resolve();
      const fichas = [];
      order.forEach(function (fichaId) {
        chain = chain.then(function () {
          // Scoped to THIS document, not just the ficha id — two different
          // saved documents can each hold their own copy of a ficha that
          // was never modified since (duplicated, or the same library page
          // added to both), so the ficha id alone isn't unique across every
          // saved document, only within one.
          return client.from("saved_document_fichas").select("ficha").eq("saved_document_id", id).eq("id", fichaId).maybeSingle().then(function (r) {
            if (r.error || !r.data) return; // one missing/bad ficha row shouldn't sink the rest
            fichas.push(r.data.ficha);
          }).catch(function () {});
        });
      });
      return chain.then(function () {
        const doc = Object.assign({}, meta);
        delete doc.fichaOrder;
        doc.fichas = fichas;
        return doc;
      });
    });
  }

  function saveSavedDocumentRemote(entry) {
    const fichas = (entry.document && entry.document.fichas) || [];
    const meta = Object.assign({}, entry.document);
    delete meta.fichas;
    meta.fichaOrder = fichas.map(function (f) { return f.id; });
    return client.from("saved_documents").upsert({
      id: entry.id, name: entry.name, saved_at: entry.savedAt, updated_at: entry.updatedAt, meta: meta,
    }).then(function (res) {
      if (res.error) throw res.error;
      // Clear out fichas from a previous save of this same document that
      // no longer exist (removed since) — simplest correct way to
      // reconcile the set without diffing old vs new.
      return client.from("saved_document_fichas").delete().eq("saved_document_id", entry.id);
    }).then(function (res) {
      if (res.error) throw res.error;
      let chain = Promise.resolve();
      fichas.forEach(function (f) {
        chain = chain.then(function () {
          return client.from("saved_document_fichas").insert({ id: f.id, saved_document_id: entry.id, ficha: f }).then(function (r) {
            if (r.error) throw r.error;
          });
        });
      });
      return chain;
    });
  }

  function deleteSavedDocumentRemote(id) {
    // saved_document_fichas rows cascade-delete via the foreign key.
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
