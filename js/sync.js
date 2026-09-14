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

  // Runs `worker` over `items` with at most `limit` in flight at once —
  // strict one-at-a-time (this used to be) is gentle on Supabase but its
  // wall-clock time is the sum of every request's latency; a big shared
  // library made "open the app" itself take well over a minute. A small
  // bounded pool overlaps that latency (a handful of small requests at
  // once, never all of them) without going back to the unbounded
  // Promise.all that caused real timeouts before any of this existed.
  // One item failing resolves that slot with `undefined` instead of
  // rejecting the whole run — same "a bad row can't sink the rest"
  // guarantee the old sequential version had.
  function runWithLimit(items, limit, worker) {
    return new Promise(function (resolve) {
      const results = new Array(items.length);
      if (!items.length) { resolve(results); return; }
      let nextIndex = 0;
      let completedCount = 0;
      function startNext() {
        if (nextIndex >= items.length) return;
        const i = nextIndex++;
        worker(items[i], i).then(function (r) { results[i] = r; }, function () { results[i] = undefined; }).then(function () {
          completedCount++;
          if (completedCount === items.length) resolve(results);
          else startNext();
        });
      }
      for (let k = 0; k < Math.min(limit, items.length); k++) startNext();
    });
  }

  // Fetching every row's full `ficha` (images and all) in one query can
  // add up to tens of MB combined once the library has several pages —
  // Supabase's statement timeout then cancels the whole query, and the
  // library looks empty even though nothing was lost. Two-step instead:
  // grab the lightweight id/saved_at list first (always fast), then pull
  // each full row with bounded concurrency (see runWithLimit) — a legacy
  // page's ficha can still be large (pre-extraction inline images), so
  // this stays request-per-row rather than one combined query for all of
  // them, just no longer strictly one at a time.
  function loadLibraryRemote() {
    return client.from("library_pages").select("id, saved_at, name").order("saved_at", { ascending: true }).then(function (res) {
      if (res.error) throw res.error;
      const rows = res.data || [];
      // 3, not higher — each of these workers can itself fire off a few
      // more requests for that page's own assets (see loadOrderedRows),
      // so the real number of requests in flight at once is already a
      // multiple of this.
      return runWithLimit(rows, 3, function (row) {
        return client.from("library_pages").select("ficha").eq("id", row.id).maybeSingle().then(function (full) {
          if (full.error || !full.data) return null;
          const shellFicha = full.data.ficha || {};
          // __assetIds is missing on a page saved before this fix — its
          // ficha never had its images pulled out to begin with, so
          // reinsertAssets below (nothing to look up) just hands the
          // same object back unchanged.
          const assetIds = shellFicha.__assetIds || [];
          return loadOrderedRows("library_page_assets", "data", "page_id", row.id, assetIds).then(function (assetMap) {
            const ficha = reinsertAssets(Object.assign({}, shellFicha), assetMap);
            delete ficha.__assetIds;
            return { id: row.id, savedAt: row.saved_at, name: row.name || "", ficha: ficha };
          });
        }).catch(function () { return null; });
      }).then(function (results) { return results.filter(Boolean); });
    });
  }

  // Same statement-timeout failure as saved_documents (see below) hits a
  // single library page too — one ficha's own gallery + per-modelo planos
  // can already be too big for one write. Same fix: every image goes into
  // its own library_page_assets row, and the ficha keeps only a small
  // {__assetRef} placeholder plus the list of ids to fetch back.
  function addLibraryEntryRemote(entry) {
    const assets = [];
    const shellFicha = extractAssets(entry.ficha || {}, assets);
    shellFicha.__assetIds = assets.map(function (a) { return a.id; });
    return client.from("library_pages").insert({ id: entry.id, saved_at: entry.savedAt, name: entry.name || null, ficha: shellFicha }).then(function (res) {
      if (res.error) throw res.error;
      return writeOrderedRows("library_page_assets", "data", "page_id", entry.id, assets);
    });
  }

  function removeLibraryEntryRemote(id) {
    return client.from("library_pages").delete().eq("id", id).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  // A library page's own display name — independent from ficha.desarrollo
  // (the title that actually prints on the document), so relabeling a
  // page for your own organization (e.g. "AUKENA DEPAS" vs "AUKENA CASAS")
  // never touches what a client sees.
  function renameLibraryEntryRemote(id, name) {
    return client.from("library_pages").update({ name: name }).eq("id", id).then(function (res) {
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

  // saved_documents / saved_document_fichas / saved_document_mapas /
  // saved_document_assets: a whole DOCUMENT (client name, every ficha,
  // mapas, the lot) saved under a name — e.g. "ALONSO" — so a set of
  // properties already sent to one client can be reopened and added to
  // later instead of rebuilding it from scratch. The library above saves
  // single pages; this is the same idea one level up, for the whole thing
  // you'd actually hand someone.
  //
  // This went through three shapes before landing here, each one found
  // wanting by an actual real-world save, not by guessing:
  //   1. The whole document as one jsonb blob — timed out on the write.
  //   2. Fichas split into one row each — still timed out, because mapas
  //      (a map screenshot is easily as big as a ficha's gallery) were
  //      still bundled into the "meta" row.
  //   3. Mapas split out too — STILL timed out, on a real 5-ficha
  //      document, because a single ficha with several gallery photos and
  //      a plano per modelo is, by itself, already too big for one write.
  // So this goes all the way down: every individual IMAGE (any
  // data:image/... string anywhere in the document) is pulled out into
  // its own saved_document_assets row, and everything else keeps only a
  // small {__assetRef:"..."} placeholder in its place. No single write
  // this makes is ever bigger than one photo, however many fichas or
  // mapas or photos-per-ficha the document has.
  //
  // Every read/write below still goes one row at a time, not
  // Promise.all — concurrent large requests are exactly what made the
  // library's own read timeout worse in the first place (see
  // loadLibraryRemote above), and that's just as true for a document that
  // can now easily be 20-30+ asset rows.

  // Walks `value` and replaces every embedded image with a small
  // {__assetRef:id} placeholder, collecting the real data into `assets`
  // (an array `push`ed onto: {id, data}) as it goes.
  function extractAssets(value, assets) {
    if (Array.isArray(value)) return value.map(function (v) { return extractAssets(v, assets); });
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).forEach(function (k) { out[k] = extractAssets(value[k], assets); });
      return out;
    }
    if (typeof value === "string" && value.indexOf("data:image/") === 0) {
      const id = "a" + assets.length + Math.random().toString(36).slice(2, 8);
      assets.push({ id: id, data: value });
      return { __assetRef: id };
    }
    return value;
  }
  // The inverse: swaps every {__assetRef:id} placeholder back for the
  // real image data, looked up from `assetMap` (id -> data).
  function reinsertAssets(value, assetMap) {
    if (Array.isArray(value)) return value.map(function (v) { return reinsertAssets(v, assetMap); });
    if (value && typeof value === "object") {
      if (typeof value.__assetRef === "string") return assetMap[value.__assetRef] || null;
      const out = {};
      Object.keys(value).forEach(function (k) { out[k] = reinsertAssets(value[k], assetMap); });
      return out;
    }
    return value;
  }

  function listSavedDocumentsRemote() {
    return client.from("saved_documents").select("id, name, saved_at, updated_at").order("updated_at", { ascending: false }).then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(function (row) {
        return { id: row.id, name: row.name, savedAt: row.saved_at, updatedAt: row.updated_at };
      });
    });
  }

  // Reads every row of `table` matching `fkColumn = ownerId` whose id is
  // in `order`, one request at a time, and returns them as an {id: value}
  // map — NOT an array positionally matching `order`, since a single
  // missing/bad row (caught below, so it can't sink the rest) would
  // otherwise silently shift every entry after it out of alignment with
  // whatever the caller zips the result back up against. Shared by the
  // saved-document ficha/mapa/asset read paths and the library-page asset
  // read path below since they're otherwise identical.
  //
  // Kept sequential and one-request-per-row on purpose — a single asset
  // row is a whole compressed image (1-4MB), so both bundling several
  // into one query AND firing several at once turned out to reintroduce
  // slow/stuck requests in practice. Real fix for "biblioteca is slow to
  // open" is one level up, in loadLibraryRemote: the 20+ PAGES is what
  // was actually serialized before, not any one page's own handful of
  // photos — this inner loop was never the bottleneck.
  function loadOrderedRows(table, column, fkColumn, ownerId, order) {
    let chain = Promise.resolve();
    const out = {};
    order.forEach(function (itemId) {
      chain = chain.then(function () {
        // Scoped to THIS owner (document or library page), not just the
        // item's own id — two different owners can each hold their own
        // copy of a ficha/mapa/asset that was never modified since, so the
        // id alone isn't unique across every owner, only within one.
        return client.from(table).select(column).eq(fkColumn, ownerId).eq("id", itemId).maybeSingle().then(function (r) {
          if (r.error || !r.data) return; // one missing/bad row shouldn't sink the rest
          out[itemId] = r.data[column];
        }).catch(function () {});
      });
    });
    return chain.then(function () { return out; });
  }

  function loadSavedDocumentRemote(id) {
    return client.from("saved_documents").select("meta").eq("id", id).maybeSingle().then(function (res) {
      if (res.error) throw res.error;
      if (!res.data) return null;
      const shellMeta = res.data.meta || {};
      const fichaOrder = shellMeta.fichaOrder || [];
      const mapaOrder = shellMeta.mapaOrder || [];
      const assetIds = shellMeta.assetIds || [];
      return Promise.all([
        loadOrderedRows("saved_document_fichas", "ficha", "saved_document_id", id, fichaOrder),
        loadOrderedRows("saved_document_mapas", "mapa", "saved_document_id", id, mapaOrder),
        loadOrderedRows("saved_document_assets", "data", "saved_document_id", id, assetIds),
      ]).then(function (results) {
        const fichaMap = results[0], mapaMap = results[1], assetMap = results[2];
        const doc = reinsertAssets(Object.assign({}, shellMeta), assetMap);
        delete doc.fichaOrder;
        delete doc.mapaOrder;
        delete doc.assetIds;
        // Filter(Boolean) drops any ficha/mapa whose row genuinely
        // couldn't be read, instead of leaving a hole in the array.
        doc.fichas = fichaOrder.map(function (fid) { return fichaMap[fid]; }).filter(Boolean).map(function (f) { return reinsertAssets(f, assetMap); });
        doc.mapas = mapaOrder.map(function (mid) { return mapaMap[mid]; }).filter(Boolean).map(function (m) { return reinsertAssets(m, assetMap); });
        return doc;
      });
    });
  }

  // Replaces every row of `table` for this owner with the current set —
  // simplest correct way to reconcile "some fichas/mapas/assets got
  // removed since the last save" without diffing old vs new — writing
  // them one at a time. Shared by the saved-document ficha/mapa/asset
  // write paths and the library-page asset write path below.
  function writeOrderedRows(table, column, fkColumn, ownerId, items) {
    return client.from(table).delete().eq(fkColumn, ownerId).then(function (res) {
      if (res.error) throw res.error;
      let chain = Promise.resolve();
      items.forEach(function (item) {
        chain = chain.then(function () {
          const row = { id: item.id };
          row[fkColumn] = ownerId;
          row[column] = item[column] !== undefined ? item[column] : item;
          return client.from(table).insert(row).then(function (r) {
            if (r.error) throw r.error;
          });
        });
      });
      return chain;
    });
  }

  function saveSavedDocumentRemote(entry) {
    const assets = [];
    // Pulls every image (in meta, every ficha, every mapa — anywhere) out
    // into `assets` up front, so nothing written below ever carries a
    // real image; each is its own row from here on.
    const shellDoc = extractAssets(entry.document || {}, assets);
    const fichas = shellDoc.fichas || [];
    const mapas = shellDoc.mapas || [];
    const meta = Object.assign({}, shellDoc);
    delete meta.fichas;
    delete meta.mapas;
    meta.fichaOrder = fichas.map(function (f) { return f.id; });
    meta.mapaOrder = mapas.map(function (m) { return m.id; });
    meta.assetIds = assets.map(function (a) { return a.id; });
    return client.from("saved_documents").upsert({
      id: entry.id, name: entry.name, saved_at: entry.savedAt, updated_at: entry.updatedAt, meta: meta,
    }).then(function (res) {
      if (res.error) throw res.error;
      return writeOrderedRows("saved_document_fichas", "ficha", "saved_document_id", entry.id, fichas);
    }).then(function () {
      return writeOrderedRows("saved_document_mapas", "mapa", "saved_document_id", entry.id, mapas);
    }).then(function () {
      return writeOrderedRows("saved_document_assets", "data", "saved_document_id", entry.id, assets);
    });
  }

  function deleteSavedDocumentRemote(id) {
    // saved_document_fichas/saved_document_mapas/saved_document_assets
    // rows cascade-delete via the foreign key.
    return client.from("saved_documents").delete().eq("id", id).then(function (res) {
      if (res.error) throw res.error;
    });
  }

  window.Sync = {
    loadLibraryRemote: loadLibraryRemote,
    addLibraryEntryRemote: addLibraryEntryRemote,
    removeLibraryEntryRemote: removeLibraryEntryRemote,
    renameLibraryEntryRemote: renameLibraryEntryRemote,
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
