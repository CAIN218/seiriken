// 通知で使う「この端末の整理券ID」を保存する（画面と sw.js の両方から使う）
function pushStoreOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('seiriken-push', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) { const d = await pushStoreOpen(); return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function idbSet(k, v) { const d = await pushStoreOpen(); return new Promise((res, rej) => { const q = d.transaction('kv', 'readwrite').objectStore('kv').put(v, k); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); }
