firebase.initializeApp(window.FIREBASE_CONFIG);
const db = firebase.firestore();
const WAITING_ROOM = window.WAITING_ROOM;

function today() {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // JST
  return d.toISOString().slice(0, 10);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// 今日のチケットを番号順で購読。cbには全チケット配列を渡す
// 状態: waiting(順番待ち) → called(待機室へ呼び出し中) → inroom(待機室に入室) → guided(アトラクションへ案内済み) / absent
function watchTickets(cb) {
  return db.collection('tickets').where('day', '==', today()).onSnapshot(snap => {
    const list = snap.docs.map(d => {
      const t = { id: d.id, ...d.data() };
      if (t.status === 'arrived') t.status = 'inroom'; // 旧バージョンの状態名
      return t;
    }).sort((a, b) => a.number - b.number);
    cb(list);
  });
}
const isActive = t => t.status === 'waiting';                 // 順番待ち
const inLine = t => t.status === 'waiting' && !t.skipped;      // 呼び出しの順番に並ぶ組（飛ばし中を除く）
const inRoom = t => t.status === 'called' || t.status === 'inroom'; // 待機室の枠を使っている組
const calledAtOf = t => t.calledAt || t.guidedAt || 0;
// お客さん・モニター向けの集計（スタッフ画面が書き込む。読み取り回数を減らすため）
const summaryRef = () => db.collection('summary').doc(today());
function buildSummary(list) {
  const ct = currentTicket(list);
  // 呼び出し間隔（直近6回、20分以上空いた間隔は休憩とみなして除外）
  const calls = list.map(t => t.calledAt || 0).filter(x => x > 0).sort((a, b) => a - b);
  const gaps = [];
  for (let i = Math.max(1, calls.length - 6); i < calls.length; i++) {
    const g = (calls[i] - calls[i - 1]) / 1000;
    if (g > 0 && g < 1200) gaps.push(g);
  }
  return {
    current: ct ? ct.number : null,
    line: list.filter(inLine).map(t => t.number),
    waitCount: list.filter(isActive).length,
    roomCount: list.filter(inRoom).length,
    avgGapSec: gaps.length >= 2 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null
  };
}
// これから呼ぶ番号（先頭からn組）
function upcoming(list, n) { return list.filter(inLine).slice(0, n); }
// 現在呼び出し中の組（最後に呼んだ組）
function currentTicket(list) {
  return list.filter(t => t.status === 'called' || t.status === 'inroom' || t.status === 'guided')
    .sort((a, b) => calledAtOf(b) - calledAtOf(a))[0] || null;
}
function currentNumber(list) { const t = currentTicket(list); return t ? t.number : null; }
// 自分より前の順番待ちの組数
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
