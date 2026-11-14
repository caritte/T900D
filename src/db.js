// Séances réalisées, stockées dans IndexedDB (les courbes dépassent vite le quota de localStorage).
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('t900d', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('sessions', { keyPath: 'id' });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('sessions', mode), rq = fn(t.objectStore('sessions'));
    t.oncomplete = () => res(rq.result); t.onerror = () => rej(t.error);
  });
};
export const putSession = (s) => tx('readwrite', (st) => st.put(s));
export const allSessions = () => tx('readonly', (st) => st.getAll());
export const delSession = (id) => tx('readwrite', (st) => st.delete(id));
