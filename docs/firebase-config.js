// Firebaseのウェブアプリ設定値（公開されても問題ない値。守るのはFirestoreのルール）
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCVDvzuuHMzRoVd87GVPE_Vglqe9adgClY",
  authDomain: "seiriken-fcb62.firebaseapp.com",
  projectId: "seiriken-fcb62",
  appId: "1:130815459081:web:014c9f08c7f28166629dd8"
};
// 自分の前に何組いたら「まもなく順番です」を出すか（1 = 「あと2組」から）
window.SOON_AHEAD = 1;
window.CALL_TIMEOUT_SEC = 300;
// 平均案内間隔がまだ分からないときの仮の値（秒）
window.DEFAULT_GAP_SEC = 180;
// スタッフ画面で、呼び出し・入室から何分たったら赤くするか
window.ALERT_MIN = 5;
// 整理券の上に出す名前
window.EVENT_TITLE = 'ジュラシックス・パーク';
// 画面を閉じていても届く通知を送るサーバー（Cloudflare Workers）のURL。未設定（空）のあいだは、この機能は画面に出ません。
// 設定の手順は、リポジトリの push-worker/SETUP.md を見てください。例：'https://seiriken-push.あなたの名前.workers.dev'
window.PUSH_WORKER_URL = '';
