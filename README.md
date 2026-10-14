# 整理券システム（WEB版・無料枠）

- `public/index.html` お客さん用（QRの行き先）
- `public/admin.html` スタッフ用（ログイン必須）
- `public/board.html` 掲示モニター用

## セットアップ（Firebase 無料のSparkプラン）
1. https://console.firebase.google.com でプロジェクト作成
2. 「Firestore Database」を作成（本番モード）
3. 「Authentication」→ メール/パスワードを有効化し、スタッフ用ユーザーを1つ追加
4. プロジェクト設定 →「ウェブアプリを追加」で表示される設定値を `public/firebase-config.js` に貼る
5. `npm i -g firebase-tools && firebase login && firebase deploy`
6. 公開URL（`https://<project>.web.app/`）をQRコード化して掲示する

## 運用
- 番号は日付(日本時間)ごとにリセットされます（24日・25日で自動的に1から）。
- 「あと5組」で「お越しください」、順番が来て未到着なら再通知（スタッフの「再通知」ボタンでも可）。
- 「来ました」「飛ばす」「欠席」は管理画面から。
