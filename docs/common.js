firebase.initializeApp(window.FIREBASE_CONFIG);
const db = firebase.firestore();
const WAITING_ROOM = window.WAITING_ROOM;

function today() {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // JST
  return d.toISOString().slice(0, 10);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// 今日のチケットを番号順で購読。cbには全チケット配列を渡す
function watchTickets(cb) {
  return db.collection('tickets').where('day', '==', today()).onSnapshot(snap => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.number - b.number);
    cb(list);
  });
}
const isActive = t => t.status === 'waiting' || t.status === 'arrived';
// 案内の順番に並ぶ組（飛ばし中を除く）
const inLine = t => isActive(t) && !t.skipped;
// これから案内する番号（先頭からn組）
function upcoming(list, n) { return list.filter(inLine).slice(0, n); }

// 現在案内中の番号（最後に案内した組）
function currentNumber(list) {
  const g = list.filter(t => t.status === 'guided').sort((a, b) => b.guidedAt - a.guidedAt)[0];
  return g ? g.number : null;
}
// 自分より前の有効な組数
function aheadOf(list, t) {
  return list.filter(x => inLine(x) && x.number < t.number).length;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach(delay => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.2;
      o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.18);
    });
  } catch (e) {}
}
function notify(title, body) {
  beep();
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch (e) {}
  }
}
