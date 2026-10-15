// 画面を閉じていても届く通知を表示する。プッシュには本文がないので、Firestore を読んで文面を決める
self.window = self;
importScripts('firebase-config.js', 'push-store.js');
const PROJECT = self.FIREBASE_CONFIG.projectId, API_KEY = self.FIREBASE_CONFIG.apiKey;
const SOON = self.SOON_AHEAD != null ? self.SOON_AHEAD : 1;
const jstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

async function getDoc(path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${path}?key=${API_KEY}`);
  if (!r.ok) return null;
  const d = await r.json(), f = d.fields || {};
  const val = v => v.stringValue !== undefined ? v.stringValue : v.integerValue !== undefined ? Number(v.integerValue) : v.booleanValue !== undefined ? v.booleanValue : v.arrayValue ? (v.arrayValue.values || []).map(val) : null;
  const out = {}; for (const k in f) out[k] = val(f[k]);
  return out;
}

async function show() {
  let title = '整理券', body = '状況が更新されました。画面を開いて確認してください。', tag = 'seiriken';
  try {
    const id = await idbGet('ticketId');
    const t = id && await getDoc('tickets/' + id);
    if (t && t.status === 'called') { title = '待機室へお越しください'; body = `整理券 ${t.number}番の順番です。`; tag = 'called'; }
    else if (t && t.status === 'waiting') {
      const sum = await getDoc('summary/' + jstDay()), i = ((sum && sum.line) || []).indexOf(t.number);
      if (i >= 0 && i <= SOON) { title = 'まもなく順番です'; body = '会場の近くでお待ちください。'; tag = 'soon'; }
    }
  } catch (e) {}
  // 画面を開いて見ているときは、画面側の音で知らせる
  const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (wins.some(w => w.visibilityState === 'visible')) return;
  await self.registration.showNotification(title, { body, tag, renotify: true, requireInteraction: true, vibrate: [300, 150, 300, 150, 300], icon: 'icon-192.png', badge: 'icon-192.png' });
}
self.addEventListener('push', e => e.waitUntil(show()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => ws.length ? ws[0].focus() : clients.openWindow('./')));
});
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
