firebase.initializeApp(window.FIREBASE_CONFIG);
const db = firebase.firestore();
// 会場や学校のネットワークでは、通常の接続が途切れて画面が更新されなくなることがある。自動で別の接続方式に切り替える
try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
const EVENT_TITLE = window.EVENT_TITLE || '整理券';
const SOON_AHEAD = window.SOON_AHEAD != null ? window.SOON_AHEAD : 1;
const CALL_TIMEOUT_SEC = window.CALL_TIMEOUT_SEC || 300;
const DEFAULT_GAP_SEC = window.DEFAULT_GAP_SEC || 180;
const ALERT_MIN = window.ALERT_MIN || 5;

// 2人1組で1枚。余りは1人の券（3人 → 2名と1名の2枚）
const splitPeople = n => { const a = []; for (let r = n; r > 0; r -= 2) a.push(Math.min(2, r)); return a; };

// 複数枚の券につける枝番：a, b, … z の次は a に戻る
const grpLetter = g => String.fromCharCode(97 + g % 26);

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
// 発券の停止・待ち時間表示などの設定（counters）も集計に含める。お客さん・モニターは counters を読まずに済み、発券のたびの読み取りが減る
const CFG_KEYS = ['closed', 'closedReason', 'reopenAt', 'showWait', 'waitMode', 'waitMin', 'multiTicket', 'notice', 'noticeAt'];
// 待ち時間の目安：auto（実績から自動）／manual（1組○分の手入力）／off（表示しない）。古い設定（showWait）にも対応
const waitModeOf = c => (c && c.waitMode) || (c && c.showWait === false ? 'off' : 'auto');
const gapSecOf = (c, avg) => waitModeOf(c) === 'manual' && c.waitMin > 0 ? c.waitMin * 60 : (avg || DEFAULT_GAP_SEC);
const pickCfg = c => { const o = {}; CFG_KEYS.forEach(k => { if (c && c[k] !== undefined) o[k] = c[k]; }); return o; };
// 止まっていないことを示す時刻は、お客さんが読む集計とは別のドキュメントに書く（集計に書くと全員が毎分読むことになる）
const heartbeatRef = () => db.collection('summary').doc(today() + '-hb');
function buildSummary(list, cfg) {
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
    avgGapSec: gaps.length >= 2 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    cfg: pickCfg(cfg)
  };
}
// 現在呼び出し中の組（最後に呼んだ組）
function currentTicket(list) {
  return list.filter(t => t.status === 'called' || t.status === 'inroom' || t.status === 'guided')
    .sort((a, b) => calledAtOf(b) - calledAtOf(a))[0] || null;
}

/* ---------- エラーの原因とコード ----------
   失敗したときは「何をしようとして（操作）、なぜ失敗したか（原因）」を画面に出す。
   エラーコードは 操作-原因（例：IS-N1）。一覧は README とトラブル対処ガイドにある */
const WARN_MS = 5 * 60 * 1000; // 通信が切れている・スタッフ側の更新が止まっている、と警告するまでの時間
const OPS = { IS: '整理券を発行できませんでした', TR: '半券をもぎれませんでした', CA: 'キャンセルできませんでした', WT: '最新の状態を取得できませんでした', OP: '操作できませんでした', PP: '紙の券を発券できませんでした', QU: '列の組を追加できませんでした', WK: '人数を記録できませんでした', CF: '設定を変更できませんでした', DL: '削除できませんでした', UN: '元に戻せませんでした', RP: '受付に連絡できませんでした', MS: 'メッセージを送れませんでした', LG: 'ログインできませんでした' };
const CAUSES = {
  N1: ['端末がオフラインです', 'Wi-Fiやモバイル通信を確認してください'],
  N2: ['サーバーから応答がありません（通信が不安定です）', '少し待ってから、もう一度お試しください'],
  P1: ['この操作が許可されていません', '会場のスタッフにお知らせください'],
  A1: ['ログインの有効期限が切れています', '一度ログアウトして、ログインし直してください'],
  Q1: ['サービスの利用上限に達しました', 'スタッフにお知らせください'],
  C1: ['他の端末が先に操作しました', '画面を最新にしました。もう一度ご確認ください'],
  G1: ['対象の整理券が見つかりません', '削除された可能性があります'],
  S1: ['ただいま発券を停止しています', '再開までお待ちください'],
  S3: ['順番の更新が止まっています', '会場のスタッフにお声がけください'],
  B1: ['入力内容に問題があります', '入力を確認してください'],
  X0: ['原因を特定できませんでした', 'もう一度お試しください。続く場合はコードをスタッフにお伝えください']
};
function causeKey(e) {
  const m = (e && e.message) || '', c = (e && e.code) || '';
  if (m === 'closed') return 'S1';
  if (m === 'changed') return 'C1';
  if (m === 'gone') return 'G1';
  if (m === 'timeout' || c === 'deadline-exceeded') return 'N2';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'N1';
  if (c === 'unavailable') return 'N2';
  if (c === 'permission-denied') return 'P1';
  if (c === 'unauthenticated' || /auth\/(network-request-failed)/.test(c)) return c === 'unauthenticated' ? 'A1' : 'N2';
  if (/auth\/(invalid-credential|wrong-password|user-not-found|invalid-email|too-many-requests)/.test(c)) return 'B1';
  if (c === 'resource-exhausted') return 'Q1';
  if (c === 'not-found') return 'G1';
  if (c === 'aborted' || c === 'failed-precondition') return 'C1';
  if (c === 'invalid-argument') return 'B1';
  return 'X0';
}
// 「○○できませんでした。原因：…。対処：…（エラーコード XX-YY）」の文章を作る
// 受付とのダイレクトメッセージ。ticket.dm は { f: 's'（受付）か 'c'（お客さん）, t: 本文, at: 時刻, code?: エラーコード } の並び
const dmList = t => (t && Array.isArray(t.dm) ? t.dm : []);
const dmLastStaff = t => dmList(t).filter(m => m.f === 's').pop();
const dmLastCust = t => dmList(t).filter(m => m.f === 'c').pop();
const dmUnread = t => { const m = dmLastStaff(t); return !!m && !dmList(t).some(x => x.f === 'c' && x.at > m.at); }; // お客さん：受付の最後のメッセージに、まだ返事をしていない
const dmCustUnread = t => { const m = dmLastCust(t); return !!m && m.at > (t.dmReadAt || 0); };                  // スタッフ：お客さんの最後のメッセージを、まだ読んでいない
// 待ち時間の目安（今から○分）。n組ぶん待つとして、10分以上は5分きざみ
const waitMinutes = (n, c, avg) => { const m = n * gapSecOf(c, avg) / 60; return m >= 10 ? Math.round(m / 5) * 5 : Math.max(1, Math.round(m)); };
let lastErr = { code: '', at: 0 }; // 直前の失敗のコード（受付への連絡に添える）
function errText(op, e) {
  const k = causeKey(e), c = CAUSES[k], raw = k === 'X0' && e ? ':' + (e.code || e.message || '').toString().slice(0, 40) : '';
  lastErr = { code: `${op}-${k}`, at: Date.now() };
  return `${OPS[op] || OPS.OP}。原因：${c[0]}。${c[1]}。（エラーコード ${op}-${k}${raw}）`;
}
