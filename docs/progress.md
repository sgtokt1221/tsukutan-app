# 実装進捗と指標推移

`IMPLEMENTATION_PLAN.md` の工程ごとに、基準値からの変化を記録する。
基準値そのものは `docs/baseline/` に置き、上書きしない。

| 指標 | 基準（フェーズ0） | フェーズ1後 | フェーズ2後 | フェーズ3後 | フェーズ4後 | フェーズ5後 |
|---|---|---|---|---|---|---|
| `npm run build` | 成功・警告あり | 成功・警告1件 | 成功・警告1件 | 成功・警告1件 | 成功・警告1件 | 成功・警告1件 |
| `npm run lint` | **スクリプト未定義** | 定義済み・警告2件・エラー0 | 警告2件・エラー0 | 警告1件・エラー0 | 警告1件・エラー0 | 警告1件・エラー0 |
| JSバンドル（gzip） | 766.17 kB | 766.36 kB | 767.64 kB | 768.54 kB | 822.1 kB（IDを付けた分。フェーズ8で除去） | 822.93 kB |
| ビルドの想定ホスト | `/tsukutan-app/` | **`/`** | `/` | `/` | `/` | `/` |
| アプリ側 `npm test` | 0件のため失敗 | 変化なし | 変化なし（フェーズ9で対応） | **48件 成功** | 48件 成功 | **71件 成功** |
| Functions ユニットテスト | なし | なし | **26件 成功** | 26件 成功 | 26件 成功 | 26件 成功 |
| Rules 許可・拒否テスト | なし | なし | **21件 成功** | 21件 成功 | 21件 成功 | 21件 成功 |
| アプリ依存監査 | 69件 / critical 4 | 変化なし | 変化なし（CRA由来。フェーズ8のVite移行で対応） | 変化なし | 変化なし | 変化なし |
| Functions依存監査 | 22件 / critical 3 | **16件 / critical 0** | 16件 / critical 0 | 16件 / critical 0 | 16件 / critical 0 | 16件 / critical 0 |
| Functions Node.js | 18 | **20** | 20 | 20 | 20 | 20 |
| 追跡中 `functions/node_modules` | 15,318ファイル | 0 | 0 | 0 | 0 | 0 |
| Firestore Rules | **バージョン管理外** | 変化なし | **`firestore.rules` として管理** | 管理下 | 管理下 | 管理下 |
| 設定の不整合（`check-config-consistency`） | 目標ID 8種の不整合 | 変化なし | 変化なし | **不整合なし** | 不整合なし | 不整合なし |
| `MOTIVATION_LEVELS` の定義箇所 | 3ファイルに重複 | 3ファイル | 3ファイル | **1ファイル** | 1ファイル | 1ファイル |
| `src/App.js` | 370行 | 372行 | 372行 | **153行** | 153行 | 153行 |
| 単語の永続ID | なし（配列index） | なし | なし | なし | **6,736件すべてに付与** | 6,736件 |
| スクリプトのテスト | なし | なし | なし | なし | **13件 成功** | 13件 成功 |
| やる気レベルが日次計画に反映される | **されない** | されない | されない | されない | されない | **される** |
| 隣接レベル語の出題 | **常に0件（沈黙失敗）** | 同左 | 同左 | 同左 | 同左 | **動作** |

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

## フェーズ3: 目標・やる気・日付処理の統一（完了）

### 追加した正本

| ファイル | 内容 |
|---|---|
| `src/config/goals.json` | 目標14件。id / category / displayName / requiredVocabulary / targetLevel / description / recommendedTextbooks |
| `src/config/motivation.json` | やる気3段階。表示名・説明・新規語数・復習数・隣接語数・習得判定回数・間隔係数・推定時間 |
| `src/config/index.js` | 上記を読む導出関数（getGoal / getRequiredVocabulary / getTargetLevel / getRecommendedTextbooks など） |
| `src/logic/dateKeys.js` | 日本時間の日付キー |
| `functions/lib/dateKeys.js` | 同じ仕様のFunctions版 |

### 消した重複

- `MOTIVATION_LEVELS` が `GoalSetter.js` / `logic/learningPlanner.js` / `logic/reviewLogic.js` の
  **3箇所に同一内容でコピーされていた**。`src/config` の1箇所に集約した。
- `App.js` の `/set-goal` ルートに目標画面がインラインで**丸ごと書かれていた**（370行中の約240行）。
  `GoalSetter.js` は同じ画面を持ちながらどこからも import されていないデッドコードだった。
  App.js のインライン版を削除し、`GoalSetter` を実際に使うようにした。**App.js は370行→153行。**
- `setupMasterData.js` の目標一覧も `goals.json` を読むようにした。

### 旧目標ID `hs1`〜`hs5` / `uni1`〜`uni3` の撤去

`AdminDashboard.js` の3箇所（表示名・目標レベル・必要語彙数）と
`StudentDashboard.js` の1箇所（大阪府教材の推奨判定）にあった手書きマッピングを、
すべて共通定義からの導出に置き換えた。

判明していた実害:

- **`StudentDashboard.js:270` の大阪府教材の推奨が `['hs1','hs2']` を見ていた。**
  現行の目標設定画面は `hs_45` などの新IDしか作らないので、
  **高校入試を目標にしても大阪府教材が推奨されていなかった。**
- `AdminDashboard.js` の必要語彙数マップは `eiken_pre1: 6000` としていたが、
  `goalsMaster` と `goals.json` は 8000。管理画面の進捗率が実際とずれていた。

### 日本時間への移行

`new Date().toISOString().slice(0, 10)` は UTC を返すため、
**日本の午前0時〜9時に学習すると前日のキーへ記録されていた。**

```
2026-08-08T23:00Z（= 8月9日 08:00 JST）
  旧: 2026-08-08   ← 前日
  新: 2026-08-09
```

置換した箇所: `AdminDashboard` 1、`StudentDashboard` 6、`reviewLogic` 2、
`GoalSetter` 1、`App.js` 1、`functions/index.js` 1（ストーリーの月次キー）。

**移行時の注意**: 切り替え当日の午前0時〜9時に学習済みの生徒は、
旧キー（前日）に完了が記録されているため、その日は「未完了」に見える。
翌日以降は自然に解消する。過去の記録は旧キーのまま残るので消えはしない。

### 目標画面（計画書8.3）

- 目標が0件、達成日が空、達成日が過去のいずれかなら保存ボタンを無効化
- 保存中は二重送信できない
- 保存後に `updateProgressPercentage` を呼んで進捗率を更新
- **やる気レベル選択時の `alert()` を廃止**（旧App.js版は選ぶたびにブロッキングダイアログが出ていた）
- 目標チップとやる気レベルに `aria-pressed` を付与
- 失敗時は `alert` ではなく画面内にエラーを表示し、完了扱いにしない

### やる気レベルの推定時間

旧App.js版は 17 / 22 / 32 分とハードコードされていたが、
GoalSetter 側の計算式（新規×60秒 + 復習×15秒）では 17 / 23 / 35 分になる。
**両者が食い違っていた。** 計算式側の値を `motivation.json` に明示値として持たせたので、
表示は 17 / 23 / 35 分に変わる。

### targetLevel は新規に決めた値

`goals.json` の `targetLevel`（到達すべき単語レベル1〜7）は既存コードに正本が無かったため、
必要語彙数を英検級の帯に対応させて割り当てた。計画書8.2の例（`hs_45` → 3）に合わせてある。
**学習内容に影響するので、値の妥当性は確認してほしい。**

| 目標 | 必要語彙数 | targetLevel |
|---|---:|---:|
| eiken_5 / eiken_4 / eiken_3 | 600 / 1300 / 2100 | 1 / 2 / 3 |
| eiken_pre2 / eiken_2 | 3600 / 5100 | 4 / 5 |
| eiken_pre1 / eiken_1 | 8000 / 12000 | 6 / 7 |
| hs_45 / hs_50 / hs_60 / hs_top | 1500 / 2000 / 3000 / 4000 | 3 / 3 / 4 / 4 |
| uni_50 / uni_60 / uni_top | 4000 / 5500 / 7000 | 4 / 5 / 6 |

### テスト

`npm test` が**初めて成功する状態**になった。

| ファイル | 件数 | 内容 |
|---|---:|---|
| `src/config/config.test.js` | 20 | 目標定義の整合性、導出関数、旧IDが存在しないこと |
| `src/logic/dateKeys.test.js` | 12 | 日本時間の日付・月キー、日数差 |
| `src/GoalSetter.test.js` | 16 | 保存条件、aria-pressed、二重送信防止、保存失敗時の扱い |

CRA雛形の `src/App.test.js` はテストを1件も含まずスイート全体を失敗させていたので削除した。
そのためだけにあった `package.json` の `jest.moduleNameMapper` も外した。
（`src/__mocks__/react-router-dom.js` は参照されなくなったが、元からあるので残してある。）

### 積み残し

- 目標設定画面を実ブラウザで操作確認していない。生徒アカウントでのログインが必要なため。
  コンポーネントテストで保存条件・選択状態・二重送信・失敗時の挙動は検証済み。
- `newWordsQuota` を実際の日次計画で使う件（計画書10.2.2）はフェーズ5。

## フェーズ4: 単語マスターと永続ID（データ生成・移行ツールまで完了 / 本番移行は未実行）

### 9.2 正本の確定

`scripts/compare-word-sources.js` で4ファイルを照合した。

| ファイル | 件数 | レベル | 判定 |
|---|---:|---|---|
| `words.json` | 7,205 | 1〜7 | **正本** |
| `src/wordsData.json` | 7,205 | 1〜7 | `words.json` とバイト単位で同一の複製 |
| `highschool.json` | 5,307 | 5〜7 | 素材。**全件が `words.json` に含まれる** |
| `public/words.json` | 1,969 | **1〜9** | 大阪府公立入試の収録範囲。旧レベル体系 |

判明したこと:

- `public/words.json` の 97.5% は `words.json` に含まれるが、**49件は含まれない**。
  `home` / `favorite` / `give up` / `in front of` など基本語が抜けていた。
- **219件でレベルが食い違う。** 187件は `public` が +1（words=6 → public=7 など）だが、
  残り32件は −4〜+3 とばらばらで、systematicな換算では埋まらない。
  `words.json` は再分類スクリプトを通った後の値なのでこちらを採用した。

### 9.3 永続ID

これまで単語IDは**配列のインデックス**だった。

```
id: `word_${index}`             語彙力チェック
id: `osaka_word_${index}`       大阪府公立入試
id: `highschool_word_${index}`  高校英語
id: `eiken_wordsdata_${index}`  英検（wordsData由来）
id: `eiken_words_${index}`      英検（words.json由来）
```

同じ単語でも読み込み経路が違えば別ID、JSONの並びが変われば全部ずれる。
Firestore の `textbooks/*/words` は `.add()` のランダム自動IDで、これとも無関係。

`scripts/build-word-master.js` で `w_` + SHA-256(出どころ|語|品詞|意味|レベル) の
先頭16桁を付けた。

- **並び順を変えてもIDは変わらない**（`words.json` を逆順にして生成し、6,736件すべて同一IDを確認）
- 既に `words-master.json` にあるIDは、意味やレベルを直しても維持する（2回目の実行で6,736件を引き継ぎ）
- `close`（動/形/副）のような意味違いの同綴語は別IDになる

### 生成結果

| 項目 | 値 |
|---|---:|
| 完全同一の重複を統合 | 518件（うち例文が違ったもの418件はレポートに全件記録） |
| `public/words.json` から取り込み | 49件（レベルは上限7へ丸め） |
| マスター件数 | **6,736件** |
| 大阪府公立入試 | 1,969件 |
| 高校英語 | 4,789件 |

出力:

```
public/data/manifest.json           版・件数・SHA-256
public/data/words-master.json       6,736件
public/data/words-osaka.json        1,969件
public/data/words-highschool.json   4,789件
src/wordsData.json                  マスターと同内容（画面が import している分）
```

`npm run build:words` で再生成、`node scripts/build-word-master.js --check` で
生成物が最新かを確認できる。

### 消えていた777語

`StudentDashboard.js` の語彙力チェック準備に

```js
Array.from(new Map(combinedWords.map(w => [w.word, w])).values())
```

があり、**表面語をキーにしていたため意味違いの同綴語が消えていた**（7,205 → 6,267）。
`close` の動詞・形容詞・副詞、`first` の名詞・形容詞・副詞などが1つに潰れていた。
永続IDをキーに変更。教材別の重複除去（1,165行付近）も同じ問題があったので直した。

### 9.5 復習データの移行

`scripts/lib/reviewWordMapping.js`（純粋関数）と `scripts/migrate-review-words.js`。

`reviewWords` の文書は `{...word}` を展開して保存しているので、語・品詞・意味・レベルが
残っている。これを使って新IDへ対応づける。

1. 語+品詞+意味+レベル が一致（最も確か）
2. 語+品詞+意味 が一致（レベルが再分類された場合）
3. 語だけ一致し、候補が1件ならそれ。複数なら**曖昧として保留し書き込まない**

同じ新IDへ複数の旧文書が集まる場合の統合は計画書9.5の規則どおり
（lastReviewed は最新 / nextReviewDate は最早 / repetitions は最大 /
easeFactor と interval は最新履歴 / 移行元IDを `migratedFrom` に記録）。

テスト13件（`npm run test:scripts`）。マスター6,736件すべてが自分自身へ
一意に対応づくことも検証済み。

**移行はまだ実行していない。** スクリプトの既定はドライランで、`--execute` を
明示しない限り1件も書き込まない。旧文書は本実行後も削除せず `migratedTo` を付けるだけ。

### 未完了

- **本番の `reviewWords` 移行は未実行。** `node scripts/migrate-review-words.js` で
  ドライランして件数を確認してから `--execute` が必要。`serviceAccountKey.json` を使う。
- **Firestore の `textbooks/*/words` は手つかず。** ランダム自動IDのまま。
  学習画面の一部（その他教材）はまだここを読む。永続IDへの入れ替えが要る。
- **バンドルからの単語JSON除去は未実施。** 計画書13.5（フェーズ8）の担当。
  IDを足した分だけバンドルが 768.54 kB → 822.1 kB に増えている。
  `public/data/` の遅延読み込みへ移せば丸ごと落とせる。
- 取り込んだ49件のレベルは `min(publicのレベル, 7)` で機械的に決めた。
  `docs/baseline/word-master-build-report.json` に全件あるので確認してほしい。

## フェーズ5: 日次計画と復習ロジック（完了）

### 見つかった沈黙失敗

**1. やる気レベルの新規語数が日次計画に一度も使われていなかった。**

```js
const finalNewWordsQuota = deadlineBasedNewWordQuota;  // 期限由来のみ
```

`motivation.newWordsQuota`（15 / 20 / 30語）は目標設定画面の表示にしか使われず、
実際の計画は「残り語数 ÷ 残り日数」だけで決まっていた。
**画面が「新規20語/日」と表示していても、生成される語数は別物だった。**
計画書10.4の完了条件そのもの。

**2. 隣接レベルの単語が一度も出ていなかった。**

```js
const masterGoal = goalsMasterData.find(g => g.id === target.goalId);
if (masterGoal && masterGoal.level > maxGoalLevel) { ... }
if (maxGoalLevel <= 1) return [];
```

`goalsMaster` に `level` フィールドは存在しない（displayName / requiredVocabulary /
description のみ）。したがって `maxGoalLevel` は常に 0 で、必ず早期 return していた。
エラーも出ないので気づけない。共通定義の `targetLevel` を見るように変更した。

**3. 存在しない教材へ毎回7本の空クエリを投げていた。**

`textbooks` 定数に `eiken-5` 〜 `eiken-1` が並んでいたが、Firestore に
`textbooks/{id}/words` があるのは `osaka-koukou-nyuushi` と `highschool-english` の2つだけ。
残り7つは空スナップショットを返すだけの無駄な往復だった。
さらに、目標に紐づく教材だけを引くようにした。

**4. Firestore の取得失敗を空配列で握りつぶしていた。**

`getNewWords` / `getReviewWords` / `getAdjacentLevelWords` がすべて
`catch → return []` だった。通信に失敗しても画面には「学習する単語がありません」と出る。
例外を投げるようにし、`StudentDashboard` に再試行ボタン付きのエラー画面を追加した。

**5. 学習中の書き込みが投げっぱなしだった。**

| 箇所 | 内容 |
|---|---|
| `StudentDashboard.js` | `incorrectWords.forEach(word => addWordToReview(...))` を await していない |
| `LearningFlashcard.js` | `updateUserWordProgress` を await せずに `onBack()` |
| `ReviewFlashcard.js` | 同上 |

最後の1問を答えた直後に画面が閉じるので、進行中の Firestore 書き込みが取りこぼされる。
`StudentDashboard` は `Promise.all` で await に、フラッシュカードは
進行中の書き込みを ref に貯めてセッションを閉じる前に `Promise.allSettled` で待つようにした。
カードの送りは待たないので操作感は変わらない。

### 新規語数の決め方（計画書8.4 / 10.2.3）

```
期限達成に必要な語数 = ceil(残り語数 / 残り日数)
希望語数             = やる気レベルの設定値
実際の提案値         = min(max(必要語数, 希望語数), 60)
```

上限は60語/日。最もやる気が高い設定（30語/日）の倍にしてある。
上限を超える必要がある場合は `isFeasible: false` を返し、画面に
「今の期限だと1日◯語が必要で、達成が難しい設定です」と出す。
希望より多く出すときも、その旨を画面に出すようにした。

計画結果に返すメタ情報（計画書10.2.4）:

```json
{
  "preferredNewWords": 20,
  "requiredNewWords": 24,
  "plannedNewWords": 24,
  "isFeasible": true,
  "remainingDays": 90,
  "remainingWords": 2100
}
```

`dailyTarget` は実際に生成した語数（`newWords.length`）にした。
表示値と実データが必ず一致する。

### そのほか

- 期日を過ぎた復習語を必ず先頭に置く（以前は忘却スコア順に混ざっていた）
- 復習 > 習得済み > 隣接 > 新規 > おかわり の優先度で重複排除。
  同じ単語IDが複数のバケツに入らない
- 復習語が多い場合は30語ずつのセッションに分割して `reviewSessions` で返す
- 日付は日本時間で計算（`parseLocalDate` / `getTodayKey`）
- 永続IDへ移行済みの旧 `reviewWords` 文書（`migratedTo` あり）は二重に出さない

### テスト

`src/logic/dailyPlanMath.js` に算数だけを切り出して23件。
計画書10.3のケースを網羅している。

| ケース | 確認内容 |
|---|---|
| 期限が1年後 | 希望語数を採る |
| 期限が30日以内 | 必要語数を採る |
| 達成困難 | 上限で頭打ち、`isFeasible: false` |
| 現在語彙数が目標以上 | 希望語数で継続 |
| 期限が過去 | 残り日数を最低1日に丸める |
| 目標未設定・期限未設定 | 空の計画を返す |
| やる気 low/normal/high | 15 / 20 / 30 語 |
| 重複投入 | バケツ間で同一IDが出ない |
| 大量の復習語 | 30語ずつに分割 |
| 期限超過の優先 | 必ず先頭 |

アプリ側のテストは合計 **71件**。

### 未確認

- 実ブラウザでの日次計画表示は未確認（生徒ログインが必要）。
  算数はユニットテスト、Firestore 連携部分は型と経路の確認まで。
- `textbooks/*/words` の単語IDはランダム自動IDのままなので、
  新規語・隣接語は永続IDになっていない。フェーズ4の積み残しと同じ。
