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

  function loadLibraryRemote() {
    return client.from("library_pages").select("*").order("saved_at", { ascending: true }).then(function (res) {
      if (res.error) throw res.error;
      return (res.data || []).map(function (row) {
        return { id: row.id, savedAt: row.saved_at, ficha: row.ficha };
      });
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
  };
})();
