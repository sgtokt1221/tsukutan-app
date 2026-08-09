# 実装進捗と指標推移

`IMPLEMENTATION_PLAN.md` の工程ごとに、基準値からの変化を記録する。
基準値そのものは `docs/baseline/` に置き、上書きしない。

| 指標 | 基準（フェーズ0） | フェーズ1後 |
|---|---|---|
| `npm run build` | 成功・警告あり | 成功・警告1件（変化なし） |
| `npm run lint` | **スクリプト未定義** | 定義済み・警告2件・エラー0 |
| JSバンドル（gzip） | 766.17 kB | 766.36 kB |
| ビルドの想定ホスト | `/tsukutan-app/` | **`/`** |
| `npm test` | 0件のため失敗 | 変化なし（フェーズ9で対応） |
| アプリ依存監査 | 69件 / critical 4 | 変化なし（CRA由来。フェーズ8のVite移行で対応） |
| Functions依存監査 | 22件 / critical 3 | **16件 / critical 0** |
| Functions Node.js | 18 | **20** |
| 追跡中 `functions/node_modules` | 15,318ファイル | 0 |

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
