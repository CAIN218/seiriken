# 整理券システム（WEB版・無料）

- `docs/index.html` お客さん用（QRの行き先）
- `docs/admin.html` スタッフ用（ログイン必須）
- `docs/board.html` 掲示モニター用
- `firestore.rules` データベースのルール（Firebaseコンソールに貼る）

## 構成
画面はGitHub Pagesで公開し、データはFirebase(Firestore, 無料のSpark)に保存します。

## セットアップ
1. Firebase: Firestore作成、Authentication(メール/パスワード)でスタッフユーザー追加、ウェブアプリ登録（済）
2. Firestoreの「ルール」タブに `firestore.rules` の中身を貼って公開
3. Authentication → 設定 → 承認済みドメイン に `cain218.github.io` を追加
4. GitHubの Settings → Pages → Branch: `main` / フォルダ: `/docs` → Save
5. 公開URL `https://cain218.github.io/seiriken/` をQRコード化して掲示

## 運用
- 番号は日付(日本時間)ごとに1から自動リセット。
- 「あと5組」で「お越しください」、先頭で未到着なら再通知（スタッフの「再通知」ボタンでも可）。
- 「来ました」「飛ばす」「欠席」は管理画面から。
