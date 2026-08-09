# 実装進捗と指標推移

`IMPLEMENTATION_PLAN.md` の工程ごとに、基準値からの変化を記録する。
基準値そのものは `docs/baseline/` に置き、上書きしない。

| 指標 | 基準（フェーズ0） | フェーズ1後 | フェーズ2後 |
|---|---|---|---|
| `npm run build` | 成功・警告あり | 成功・警告1件 | 成功・警告1件 |
| `npm run lint` | **スクリプト未定義** | 定義済み・警告2件・エラー0 | 警告2件・エラー0 |
| JSバンドル（gzip） | 766.17 kB | 766.36 kB | 767.64 kB |
| ビルドの想定ホスト | `/tsukutan-app/` | **`/`** | `/` |
| アプリ側 `npm test` | 0件のため失敗 | 変化なし | 変化なし（フェーズ9で対応） |
| Functions ユニットテスト | なし | なし | **26件 成功** |
| Rules 許可・拒否テスト | なし | なし | **21件 成功** |
| アプリ依存監査 | 69件 / critical 4 | 変化なし | 変化なし（CRA由来。フェーズ8のVite移行で対応） |
| Functions依存監査 | 22件 / critical 3 | **16件 / critical 0** | 16件 / critical 0 |
| Functions Node.js | 18 | **20** | 20 |
| 追跡中 `functions/node_modules` | 15,318ファイル | 0 | 0 |
| Firestore Rules | **バージョン管理外** | 変化なし | **`firestore.rules` として管理** |

---

## フェーズ0: 作業状態の保全と実装基盤（完了）

コミット: `4cd46b9`, `57813b9`

- 未コミットだった既存作業（20ファイル変更 + 未追跡ソース）を保全コミット
- `functions/node_modules` 15,318ファイルと孤児gitlink `tsukutan-app` の追跡を解除
- `scripts/audit-word-data.js` / `scripts/check-config-consistency.js` を追加
- `docs/baseline/` に変更前レポートを記録

詳細と発見事項は `docs/baseline/README.md` を参照。

## フェーズ1: 公開設定とルーティングの修正（完了）

### 実施内容

| 計画書6.3 | 対応 |
|---|---|
| 1. `homepage` 削除 | 済 |
| 2. `gh-pages` の `predeploy`/`deploy` 置換 | `deploy` を `npm run build && firebase deploy --only hosting` に変更。`predeploy` は削除 |
| 3. `basename="/tsukutan-app"` 廃止 | 済。**加えて、ハードコードされた絶対パス4箇所も修正**（下記） |
| 4. ワイルドカードルート | `<Route path="*" element={<Navigate to="/" replace />} />` |
| 5. 認証判定中のローディング | `.loading-container` を使った共通表示に統一 |
| 6. 失敗時のエラー画面 | `onAuthStateChanged` の成功/失敗コールバック両方を捕捉し、再試行ボタン付き画面を表示 |
| 7. SPA rewrite 維持 | 変更不要（既に `** → /index.html`） |
| 8. `manifest.json` | つくたん用に全項目更新。`start_url` を `/`、テーマ色をアプリのライムグリーンに |
| 9. `index.html` | noscript を日本語化、description/theme-color を追加、**未リンクだった favicon と manifest を追加** |
| 10. Functions Node 20 | `engines.node` を `"20"` へ |
| 11. Functions 依存更新 | `firebase-admin` 12→13、`firebase-functions` 5→6。`protobufjs` を override で 7.6.5 へ |
| 12. 未使用の依存・import 削除 | `onCall`、`node-fetch` の import を削除。`busboy`、`csv-parse` を依存から削除 |

### basename 撤去で壊れるはずだった箇所

`basename` を外すと、コード内の絶対パスが `/tsukutan-app` 付きのまま残り無言で壊れる。
以下を修正済み。

| ファイル | 修正前 | 修正後 |
|---|---|---|
| `src/TestResult.js:201` | `window.location.replace('/tsukutan-app/student-dashboard')` | `'/student-dashboard'` |
| `src/VocabularyCheckTest.js:909` | 同上 | 同上 |
| `src/StudentDashboard.js:1030` | `fetch('/tsukutan-app/words.json')` | `fetch('/words.json')` |
| `src/StudentDashboard.js:1122` | 同上 | 同上 |

前者2件は語彙力チェック完了・中断後のダッシュボード復帰、
後者2件は大阪府公立入試教材の単語読み込みに使われている。

### Functions の依存で判明したこと

- `express` は `require` されているのに **`dependencies` に無かった**。
  `firebase-functions` の推移的依存でたまたま動いていただけなので、明示依存に追加した。
- `node-fetch` も同様に未宣言だったが、そもそも呼び出し箇所が無かったので import ごと削除。
  Node 20 には fetch が標準搭載されている。
- `busboy` と `csv-parse` は宣言されているが `index.js` から一度も使われていない。削除した。
- critical 3件のうち `websocket-driver` 系は `firebase-admin` の更新で解消。
  残った `protobufjs`（`google-gax` 経由）は npm `overrides` で 7.6.5 へ引き上げて解消した。

### 受け入れテスト（計画書6.4）

Firebase Hosting エミュレータ（`firebase emulators:start --only hosting`、ポート5055）で確認。
ポート5000は macOS の AirPlay 受信機が占有するため、`firebase.json` に
`emulators.hosting.port: 5055` を追加した。

| 操作 | 期待 | 結果 |
|---|---|---|
| `/` を未ログインで開く | `/login` | `/login` |
| `/login` を再読み込み | ログイン画面 | ログイン画面が表示 |
| `/student-dashboard` を未ログインで開く | `/login` | `/login` |
| `/admin-dashboard` を未ログインで開く | `/login` | `/login` |
| 不明URL `/nope` | 安全なトップ遷移 | `/login` |
| SPA rewrite | 不明URLでも index.html | `<title>つくたん</title>` を返す |
| CSS/JS/manifest/favicon/words.json | HTTP 200 | すべて200 |
| コンソールエラー | なし | なし |

ビルド出力の参照パスは `/static/...`、`/manifest.json` などルート基準になり、
`/tsukutan-app` は残っていない。

### 積み残し

- **アイコンが Create React App の既定のまま**（`favicon.ico` / `logo192.png` / `logo512.png`）。
  `manifest.json` の参照は整えたが、画像そのものはつくたんのデザインに差し替えが必要。
- ログインカードがPC幅で横に伸びる。計画書13.1（フェーズ8）で対応する。
- 実際の Firebase Hosting へのデプロイは未実施。リリースゲート（計画書4.3）を通してから行う。

## フェーズ2: CSVインポートとデータ保全（実装完了 / 未デプロイ）

### 本番 Firestore Rules の実態

計画書に無い前提だったため、まず現行ルールを Rules API から吸い出した。
保存先: `docs/baseline/firestore.rules.production-2026-08-09`

```
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

**認証さえ通れば誰でも全ドキュメントを読み書きできる状態だった。**
生徒Aが生徒Bの学習データを読むことも、書き換えることも、`goalsMaster` を壊すこともできる。
ルール内のコメント自身が「開発用の設定です。本番リリース前には変更してください」と書いていた。

### 旧 importUsers の何が危なかったか

処理順が「**全削除 → CSV解析**」だった。

1. `users` コレクションの全文書を削除（サブコレクションは孤児として残る）
2. Auth ユーザーを全削除
3. その**後で**CSVを解析
4. CSVが壊れていても、この時点では既に全生徒が消えている

加えて、削除バッチが500件上限を考慮しておらず、既存生徒のパスワードを
毎回初期値へ戻していた。

### 新しい実装

`functions/lib/studentImport.js`（Firebase非依存の純粋関数）と、
`functions/index.js` のHTTP層に分けた。前者はそのままユニットテストできる。

処理順を逆にした。**全行の検証が通るまで1件も書き込まない。**

```
CSV → 復号 → 解析 → 全行検証 → (エラーがあれば 400 を返して終了。書き込みゼロ)
                              ↓
                        既存生徒を取得 → 差分計算
                              ↓
     dryRun=true : 差分を返すだけ。importOperations に確認記録を作る
     dryRun=false: operationId とCSVのSHA-256が確認時と一致することを検証してから実行
```

| 旧 | 新 |
|---|---|
| CSV解析前に全削除 | 削除しない。`upsert` が既定 |
| 既存パスワードを毎回再設定 | 新規作成時のみ。既存には触れない |
| バッチ500件上限を無視 | 400件ずつ分割して commit |
| ヘッダー無しCSVを先頭3行スキップで推測 | `ID` / `氏名` / `学年` のヘッダーを必須にし、無ければ明示エラー |
| エラーが文字列の配列 | 行番号つきの構造化エラー |
| 二重送信の防止なし | `importOperations` の状態遷移をトランザクションで排他 |
| CSVにいない生徒 | `upsert` は何もしない。`replace` でも削除せず `disabledAt` を付けて Auth を無効化するだけ |

新規作成で Firestore 書き込みが失敗した場合、そのリクエストで作った Auth ユーザーだけを
削除して巻き戻す。既存の Auth ユーザーには触れない。

パスワードはレスポンスにもログにも出さない。

### 管理画面

「内容を確認」と「実行」の2ボタンに分けた。確認だけでは1件も変わらない。

- 追加 / 更新 / 変更なし / 無効化候補の件数をカード表示
- 更新される生徒は「どの項目が何から何に変わるか」を行番号つきで一覧表示
- `replace` で無効化対象がいる場合、`無効化する` とタイプしないと実行ボタンが有効にならない
- 実行中・確認中はボタンを無効化して二重送信を防ぐ
- ファイルやモードを変えると確認結果を破棄して取り直させる
- 実行後に生徒一覧を再取得

### 新しい Firestore Rules

`firestore.rules` として追加し、`firebase.json` に `firestore` セクションを追加した。

- 生徒は自分の文書とサブコレクションだけ読み書きできる
- 生徒は他の生徒のデータを読めない。`users` の一覧取得もできない
- `users` の list は管理者のみ
- 生徒は自分の `studentId` / `disabledAt` を書き換えられない
- `goalsMaster` と `textbooks/*/words` は認証済みなら読めるが、
  クライアントからは管理者でも書けない（投入は Admin SDK スクリプト経由）
- `importOperations` はクライアントから一切触れない
- 定義外のパスはすべて拒否

管理者判定はメールアドレス。**これで `src/App.js`、`functions/index.js`、
`firestore.rules` の3箇所にハードコードされたことになる。** 変更時は3箇所とも直すこと。

### テスト

| 種別 | コマンド | 件数 |
|---|---|---|
| CSV解析・学年正規化・差分計算 | `npm --prefix functions test` | 26件 成功 |
| Rules 許可・拒否 | `npm --prefix functions run test:rules` | 21件 成功 |

Rules テストは Firestore エミュレータ上で実行する。macOS で Java が PATH に無い場合は
`export JAVA_HOME=/opt/homebrew/opt/openjdk@21` が必要。

エミュレータのポートは `firebase.json` に固定した。5000はAirPlay、
9099は別プロジェクトのエミュレータと衝突するため、hosting 5055 / firestore 8085 / auth 9098 にしてある。

### 未完了

- **新しい Rules を本番へデプロイしていない。** 本番は今も「認証済みなら全部読み書き可」のまま。
  デプロイは `firebase deploy --only firestore:rules`。実行前に確認が必要。
- **Functions も未デプロイ。** 本番の `importUsers` は今も全削除する旧実装。
- **管理画面の取り込みUIを実画面で操作確認していない。** 管理者としてログインする必要があり、
  認証情報を持っていないため。Auth エミュレータを使った統合テスト（計画書14.3）で対応する。
- importUsers のHTTP層そのものの統合テスト（エミュレータ上で実際にCSVを投げる）は未作成。
  現状は純粋ロジックのユニットテストと、削除系呼び出しが残っていないことの確認まで。
