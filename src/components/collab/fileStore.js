// File blobs live in IndexedDB (metadata stays in the app store). Keys are version ids.

const DB = 'alumnizone-files';
const STORE = 'blobs';
let dbp;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = undefined; reject(req.error); };
  });
  return dbp;
}

function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    // Quota errors abort the transaction (sometimes without an error event) — always settle.
    t.onabort = () => reject(t.error ?? new DOMException('The storage transaction was aborted.', 'AbortError'));
  }));
}

export const putBlob = (key, blob) => tx('readwrite', (s) => s.put(blob, key));
export const getBlob = (key) => tx('readonly', (s) => s.get(key));
export const deleteBlob = (key) => tx('readwrite', (s) => s.delete(key));

export function fmtSize(n = 0) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
