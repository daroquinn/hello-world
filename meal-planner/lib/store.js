/* Tiny IndexedDB wrapper. Everything is stored in this browser only. */
(function (root) {
  const DB_NAME = 'meal-planner';
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('recipes', { keyPath: 'id' });
        d.createObjectStore('files', { keyPath: 'id' });
        d.createObjectStore('kv', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  const api = {
    all: (store) => tx(store, 'readonly', (s) => s.getAll()),
    get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
    put: (store, val) => tx(store, 'readwrite', (s) => s.put(val)),
    del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
    clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
    async getKV(key, fallback) { const r = await api.get('kv', key); return r ? r.value : fallback; },
    setKV: (key, value) => api.put('kv', { key, value }),
  };
  root.MP_STORE = api;
})(window);
