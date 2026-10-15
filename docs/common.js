firebase.initializeApp(window.FIREBASE_CONFIG);
const db = firebase.firestore();
// 会場や学校のネットワークでは、通常の接続が途切れて画面が更新されなくなることがある。自動で別の接続方式に切り替える
try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
const EVENT_TITLE = window.EVENT_TITLE || '整理券';
const SOON_AHEAD = window.SOON_AHEAD != null ? window.SOON_AHEAD : 1;
const CALL_TIMEOUT_SEC = window.CALL_TIMEOUT_SEC || 300;
const DEFAULT_GAP_SEC = window.DEFAULT_GAP_SEC || 180;
const ALERT_MIN = window.ALERT_MIN || 5;

function today() {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // JST
  return d.toISOString().slice(0, 10);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

// 状態: waiting(順番待ち) → called(呼び出し中) → inroom(入室済み・ここで完了) / absent(欠席) / cancelled(取り消し)。guided は旧バージョンの名前で、inroom と同じ扱い。旧データの skipped:true は呼び出し中として扱う
const isActive = t => t.status === 'waiting';                       // 順番待ち
const inLine = t => t.status === 'waiting';                         // 呼び出しの順番に並ぶ組
const inRoom = t => t.status === 'called';                         // 呼び出し中の組（入室したら完了）
const isDone = t => t.status === 'inroom' || t.status === 'guided'; // 入室済み（旧「案内済み」を含む）
const orderKey = t => (t.orderKey != null ? t.orderKey : t.number); // 順番（後ろに回すと大きくなる。番号は変わらない）
const byOrder = (a, b) => orderKey(a) - orderKey(b) || a.number - b.number;
const calledAtOf = t => t.calledAt || t.guidedAt || 0;

// 今日のチケットを購読（スタッフ用）。cbには全チケット配列と、通信が切れているかを渡す
function watchTickets(cb) {
  return db.collection('tickets').where('day', '==', today()).onSnapshot({ includeMetadataChanges: true }, snap => {
    const list = snap.docs.map(d => {
      const t = { id: d.id, ...d.data() };
      if (t.status === 'arrived') t.status = 'inroom'; // 旧バージョンの状態名
      if (t.status === 'skipped') t.status = 'called'; // 旧バージョンの状態名
      return t;
    }).sort((a, b) => a.number - b.number);
    cb(list, !!(snap.metadata && snap.metadata.fromCache));
  });
}

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
    line: list.filter(inLine).sort(byOrder).map(t => t.number),
    waitCount: list.filter(isActive).length,
    roomCount: list.filter(inRoom).length,
    called: list.filter(inRoom).sort((a, b) => calledAtOf(a) - calledAtOf(b)).map(t => t.number), // 呼び出し中の番号（モニター用。呼んだ順）
    avgGapSec: gaps.length >= 2 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null
  };
}
// 現在呼び出し中の組（最後に呼んだ組）
function currentTicket(list) {
  return list.filter(t => t.status === 'called' || t.status === 'inroom' || t.status === 'guided')
    .sort((a, b) => calledAtOf(b) - calledAtOf(a))[0] || null;
}
