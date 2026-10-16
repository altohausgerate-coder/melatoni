/* Storage access is best-effort so private browsing and disabled storage never break the storefront. */
(() => {
  const storageFor = area => {
    try { return area === 'session' ? window.sessionStorage : window.localStorage; }
    catch (_) { return null; }
  };
  window.MelatoniStorage = {
    get(key, fallback = null, area = 'local') {
      try { return storageFor(area)?.getItem(key) ?? fallback; } catch (_) { return fallback; }
    },
    set(key, value, area = 'local') {
      try { storageFor(area)?.setItem(key, String(value)); return true; } catch (_) { return false; }
    },
    remove(key, area = 'local') {
      try { storageFor(area)?.removeItem(key); return true; } catch (_) { return false; }
    },
    supabaseAdapter: {
      getItem(key) { try { return storageFor('local')?.getItem(key) ?? null; } catch (_) { return null; } },
      setItem(key, value) { try { storageFor('local')?.setItem(key, String(value)); } catch (_) {} },
      removeItem(key) { try { storageFor('local')?.removeItem(key); } catch (_) {} }
    }
  };
})();
