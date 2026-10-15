# 整理券システム（WEB版・無料）

- `docs/index.html` お客さん用（QRの行き先）
- `docs/admin.html` スタッフ用（ログイン必須）
- `docs/board.html` 掲示モニター用
- `firestore.rules` データベースのルール（変更したらFirebaseコンソールに貼り直す）

## 構成
画面はGitHub Pagesで公開し、データはFirebase(Firestore, 無料のSpark)に保存します。

## セットアップ
1. Firebase: Firestore作成、Authentication(メール/パスワード)でスタッフユーザー追加、ウェブアプリ登録（済）
2. Firestoreの「ルール」タブに `firestore.rules` の中身を貼って公開
3. Authentication → 設定 → 承認済みドメイン に `cain218.github.io` を追加
4. GitHubの Settings → Pages → Branch: `main` / フォルダ: `/docs` → Save
5. 公開URL `https://cain218.github.io/seiriken/` をQRコード化して掲示

## 画面のURL
- お客さん: `https://cain218.github.io/seiriken/`（テスト用: 末尾に `?test=1`。管理メニューの「テスト券を削除」で消せます）
- スタッフ: `.../admin.html`（スマホ・タブレット向け。開いたままにしておくと全体の状況を更新します）
- 掲示モニター: `.../board.html`

## 運用
- 番号は日付(日本時間)ごとに1から自動リセット。
- 流れ: 順番待ち → 呼び出し → 入室済み（お客さんが半券をもぎる、またはスタッフが「入室済みにする」）で完了。呼び出し中は5組まで。
- あと2組で「まもなく順番です」、呼び出し時に通知。未到着はスタッフの「再通知」で再通知。
- 「飛ばす」は、呼び出したまま順番を後ろにする（スタッフ画面の「飛ばし中」欄）。来たら「入室済みにする」、戻すときは「呼び出し中に戻す」。「欠席」「発券停止」は管理画面から。
- 管理画面の📋で、今日の整理券がどうなったか（入室・キャンセル・欠席、待った時間、時刻）を一覧で見られます。
