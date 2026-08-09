# つくたんアプリ 完成に向けた詳細実装計画

- 作成日: 2026-08-09
- 対象リポジトリ: `tsukutan-app`
- 現在の主要ブランチ: `feat/admin-portal`
- 文書の目的: 現在の作業内容を失わず、公開・データ保全・学習機能・運用品質を順に完成させる

## 1. 目的

つくたんを、次の条件を満たす実運用可能な英単語学習アプリとして完成させる。

1. 生徒が迷わずログインし、目標設定、単語力チェック、日次学習、復習を完了できる。
2. 管理者が生徒データを安全に追加・更新・確認できる。
3. 目標、語彙数、教材、復習履歴、管理画面の表示が同じデータ定義に基づく。
4. CSVの誤りや通信失敗で既存生徒データを失わない。
5. Firebase Hostingの正式URLから安定して利用できる。
6. 自動テストにより主要な学習ロジックの正しさを継続確認できる。

## 2. 今回の制約と対象外

### 2.1 パスワード方式

初期パスワードを `tsukuba + 生徒ID` とする現在の規則は、今回の実装では変更しない。

ただし、次の安全策は実施する。

- 既存生徒をCSV更新するたびにパスワードを再設定しない。
- 初期パスワードをレスポンス、ログ、画面一覧へ不用意に出力しない。
- 生徒が他の生徒データを読めないようFirebase Security Rulesを整備する。
- 管理者権限は画面側だけでなく、FirestoreとFunctions側でも検証する。

### 2.2 既存作業の保全

現在の作業ツリーには多数の変更、単語データ、バックアップ、補助スクリプトがある。実装開始時に既存変更を破棄・上書きしない。

- `git reset --hard` や一括チェックアウトは使用しない。
- 単語バックアップを内容確認なしに削除しない。
- 大きな変更は工程ごとに分離する。
- データ移行は必ずドライラン、件数照合、本実行の順に行う。

## 3. 現状の基準値

実装前の監査で確認した基準値は次のとおり。

| 項目 | 現状 |
|---|---|
| 本番ビルド | 成功。ただし警告あり |
| JavaScriptバンドル | gzip後 約766KB |
| テスト | テスト0件のため失敗 |
| Lint | 警告2件 |
| GitHub Pages | 404 |
| Firebase Hosting | 初期セットアップ画面 |
| ローカル `/` | Router basename不一致で空白 |
| アプリ依存監査 | 合計69件、critical 4件 |
| Functions依存監査 | 合計22件、critical 3件 |
| Functions Node.js | 18。現在は非推奨 |
| `functions/node_modules` | 15,318ファイルがGit管理対象 |
| `src/wordsData.json` | 7,205件、永続IDなし |
| `public/words.json` | 1,969件、永続IDなし |
| `highschool.json` | 5,307件、永続IDなし |

この表は各工程後に更新し、改善が確認できない変更は完了扱いにしない。

## 4. 完成時の基本設計

### 4.1 公開構成

- 正式公開先: Firebase HostingのルートURL
- フロントエンド: 単一ページアプリ
- 認証: Firebase Authentication
- データ: Cloud Firestore
- バックエンド: Cloud Functions for Firebase
- AIストーリー: Cloud FunctionsからVertex AIとTranslation APIを呼び出す
- タイムゾーン: すべての学習日・月次制限を `Asia/Tokyo` 基準にする

### 4.2 データの正本

| データ | 正本 | 利用先 |
|---|---|---|
| 目標定義 | `src/config/goals.json` | 目標画面、生徒画面、管理画面、マスターデータ登録 |
| やる気レベル | `src/config/motivation.json` | 目標画面、日次計画、表示時間 |
| 単語 | 整理後のマスターデータ | 公開用JSON、Firestore、テスト、学習画面 |
| 日付キー | 共通ヘルパー | 日次完了、日次計画、ログ集計、月次ストーリー |
| ストーリー | `generatedStories` | 生徒画面、管理画面、印刷画面 |

同じ定義を複数ファイルへ手書きで複製しない。

### 4.3 リリースゲート

次をすべて満たすまで本番公開しない。

- `npm test -- --watchAll=false` が成功する。
- `npm run lint` が成功する。
- `npm run build` が警告なしで成功する。
- Functionsの構文・テスト・依存監査が成功する。
- Firebase Emulator上でSecurity Rulesの許可・拒否テストが成功する。
- 生徒・管理者の主要導線をPCとスマートフォンで確認する。
- データ移行のドライラン件数と本実行件数が一致する。
- Firebase Hostingの公開URLで直接アクセスと再読み込みが成功する。

---

## 5. フェーズ0: 作業状態の保全と実装基盤

### 5.1 目的

既存変更を失わず、今後の修正を安全に検証できる状態にする。

### 5.2 実装内容

1. 現在の差分、ブランチ、未追跡ファイルを一覧化する。
2. 既存データファイルの件数、ハッシュ、重複数、欠損数を記録する。
3. `.gitignore` の次の誤った行を修正する。

   ```gitignore
   /functions/node_modules  # コメント付きで正しく無視されていない
   ```

   修正後:

   ```gitignore
   /functions/node_modules
   ```

4. `functions/node_modules` をGitの追跡対象から外す。ローカルファイル自体は必要に応じて残す。
5. `.eslintcache`、ビルド成果物、一時データを追跡対象から外す。
6. バックアップJSONは削除せず、用途と生成日時が分かる保管方針を決める。
7. FirebaseプロジェクトID、Functions URL、Hosting設定、Firestore Rulesの現行状態を記録する。
8. 実装用ブランチを作成する場合は `codex/finish-tsukutan` を使用する。

### 5.3 追加する補助スクリプト

- `scripts/audit-word-data.js`
  - JSON形式確認
  - 件数集計
  - 必須フィールド欠損
  - 重複語と意味違いの集計
  - レベル分布
  - 英検級分布
- `scripts/check-config-consistency.js`
  - 目標IDの参照漏れ
  - 教材IDの参照漏れ
  - URLやコレクション名の不一致

### 5.4 完了条件

- 既存ソース変更が保全されている。
- `functions/node_modules` がGit差分へ出ない。
- 単語データの変更前レポートが残っている。
- 以降の工程で比較できる基準テストが実行できる。

---

## 6. フェーズ1: 公開設定とルーティングの修正

### 6.1 目的

Firebase HostingのルートURLでアプリを正常に開けるようにする。

### 6.2 対象ファイル

- `package.json`
- `src/App.js`
- `firebase.json`
- `public/index.html`
- `public/manifest.json`
- `public/robots.txt`
- `functions/package.json`

### 6.3 実装内容

1. `package.json` のGitHub Pages用 `homepage` を削除する。
2. `gh-pages` 用の `predeploy` と `deploy` を削除またはFirebase用へ置き換える。
3. `BrowserRouter basename="/tsukutan-app"` を廃止し、ルート基準で動作させる。
4. 未知のURLをログインまたはNot Found画面へ戻すワイルドカードルートを追加する。
5. 認証判定中は共通ローディング画面を表示する。
6. 認証・Firestore読込失敗時は、空白や無限ローディングではなく再試行可能なエラー画面を表示する。
7. Firebase HostingのrewriteをSPA用に維持する。
8. `manifest.json` の次をつくたん用へ変更する。
   - `short_name`
   - `name`
   - `start_url`
   - `theme_color`
   - `background_color`
   - アイコン
9. `index.html` のnoscript文言を日本語化し、説明メタデータを追加する。
10. FunctionsのNode.jsを18から20へ上げる。
11. Functionsの依存関係を互換バージョンへ更新する。
12. 未使用のFunctions依存・importを削除する。

### 6.4 ルーティングの受け入れテスト

| 操作 | 期待結果 |
|---|---|
| `/` を開く | 未ログインなら `/login` |
| `/login` を再読み込み | ログイン画面が表示される |
| `/student-dashboard` を未ログインで開く | `/login`へ戻る |
| 不明URLを開く | Not Foundまたは安全なトップ遷移 |
| Firebase公開URLを開く | 初期Firebase画面ではなくつくたんが表示される |
| CSS/JS取得 | すべてHTTP 200 |

### 6.5 完了条件

- ローカルとFirebase Hostingの両方で同じURL構造が使える。
- URLに `/tsukutan-app` を付けなくても動作する。
- 直接URLと再読み込みで空白・404にならない。

---

## 7. フェーズ2: CSVインポートとデータ保全

### 7.1 目的

CSVの誤り、通信失敗、途中例外によって既存生徒データが失われないようにする。

### 7.2 現在の問題

- CSV解析より前に全ユーザー文書を削除している。
- Authユーザーも先に削除している。
- Firestoreの親文書削除ではサブコレクションが残る。
- CSVに1行も有効データがなくても削除が先に実行される。
- 500件を超えるバッチを考慮していない。
- 画面に全置換の警告や差分プレビューがない。
- 更新のたびに既存パスワードを初期値へ戻している。

### 7.3 新しいインポートフロー

```text
CSV選択
  ↓
ブラウザ側の形式確認
  ↓
Functionsへ dryRun=true で送信
  ↓
サーバー側で全行解析・正規化・検証
  ↓
追加 / 更新 / 無効化候補 / エラーを返す
  ↓
管理画面で差分確認
  ↓
確認後に operationId を指定して本実行
  ↓
追加・更新を実施
  ↓
件数照合と結果表示
```

### 7.4 API設計

リクエスト例:

```json
{
  "mode": "upsert",
  "dryRun": true,
  "fileName": "students.csv",
  "fileData": "base64..."
}
```

モード:

- `upsert`: 追加と更新のみ。既存生徒は削除しない。既定値。
- `replace`: CSVにいない生徒を即削除せず、無効化候補にする。

ドライラン応答例:

```json
{
  "operationId": "uuid",
  "valid": true,
  "summary": {
    "create": 10,
    "update": 25,
    "unchanged": 120,
    "disableCandidates": 3,
    "errors": 0
  },
  "errors": [],
  "warnings": []
}
```

### 7.5 CSV検証項目

- 必須ヘッダー: `ID`, `氏名`, `学年`
- IDが3〜4桁の数字で、保存時は4桁へ正規化されること
- 同一CSV内でIDが重複していないこと
- 氏名が空でないこと
- 学年が許可された表記へ正規化できること
- 不正な文字コードや破損行がないこと
- CSV全体が空でないこと
- ファイルサイズ上限を超えないこと

### 7.6 書込み戦略

1. 全行検証が成功するまで書き込まない。
2. 新規ユーザー:
   - Authユーザー作成
   - Firestoreユーザー文書作成
   - Firestore失敗時は新規Authユーザーをロールバック
3. 既存ユーザー:
   - 氏名・学年など必要項目だけ更新
   - パスワードは再設定しない
   - 進捗・目標・ログ・ストーリーを保持
4. CSVにいないユーザー:
   - 通常モードでは何もしない
   - replaceモードでは `disabledAt` を付け、Authを無効化
   - 物理削除は別の管理操作に限定
5. 各操作を小さなバッチへ分割する。
6. operationIdと実行結果を管理ログへ保存する。

### 7.7 管理画面

- 「内容を確認」ボタンと「実行」ボタンを分ける。
- 差分件数をカード表示する。
- エラー行を行番号付きで表示する。
- replaceモードでは確認文言入力を要求する。
- 実行中の二重送信を防ぐ。
- 実行後に生徒一覧を再取得する。

### 7.8 Firebase Security Rules

最低限、次を自動テストする。

- 生徒Aは生徒A自身のユーザー文書とサブコレクションを読み書きできる。
- 生徒Aは生徒Bのデータを読めない。
- 一般生徒はユーザー一覧を取得できない。
- 管理者だけが全生徒を参照できる。
- `goalsMaster` と教材マスターは認証済みユーザーが読める。
- クライアントから管理者権限を自己付与できない。

### 7.9 完了条件

- 不正CSVを送っても既存データが1件も変化しない。
- upsertで既存の進捗・復習・ストーリーが保持される。
- replace対象は即削除されず無効化される。
- 権限テストがすべて成功する。

---

## 8. フェーズ3: 目標・やる気・日付処理の統一

### 8.1 目的

目標ID、必要語彙数、目標レベル、表示名を全画面で一致させる。

### 8.2 共通目標定義

`src/config/goals.json` の想定形式:

```json
[
  {
    "id": "hs_45",
    "category": "高校入試",
    "displayName": "高校入試（偏差値45）合格",
    "requiredVocabulary": 1500,
    "targetLevel": 3,
    "recommendedTextbooks": ["osaka-koukou-nyuushi"]
  }
]
```

対象ID:

- 英検: `eiken_5`, `eiken_4`, `eiken_3`, `eiken_pre2`, `eiken_2`, `eiken_pre1`, `eiken_1`
- 高校入試: `hs_45`, `hs_50`, `hs_60`, `hs_top`
- 大学入試: `uni_50`, `uni_60`, `uni_top`

古い `hs1`〜`hs5`、`uni1`〜`uni3` の手書きマッピングを撤去する。

### 8.3 目標画面

1. `App.js` 内の重複した目標画面を削除する。
2. `/set-goal` では `GoalSetter` だけを使用する。
3. 次の条件を満たさない限り保存ボタンを無効化する。
   - 目標が1件以上選択されている
   - 達成日が入力されている
   - 達成日が今日以降
4. 保存中は二重送信を防ぐ。
5. 保存後に目標語彙数と進捗率を更新する。
6. やる気レベル選択時のblocking alertを廃止する。
7. 選択状態を見た目と `aria-pressed` で表す。

### 8.4 やる気レベル

`src/config/motivation.json` へ次を集約する。

- 表示名
- 説明
- 希望新規語数
- 通常復習数
- 隣接語数
- 習得判定回数
- 復習間隔係数
- 表示上の推定時間

日次新規語数:

```text
期限達成に必要な語数 = ceil(残り語数 / 残り日数)
希望語数 = やる気レベルの設定値
実際の提案値 = max(期限達成に必要な語数, 希望語数)
```

ただし、異常に大きな提案を防ぐ上限を設定し、上限を超える場合は「現在の期限では達成困難」と表示する。

### 8.5 日本時間ヘルパー

`src/logic/dateKeys.js` を追加し、次を提供する。

- `getTokyoDateKey(date)` → `YYYY-MM-DD`
- `getTokyoMonthKey(date)` → `YYYY-MM`
- `parseLocalDate(value)`
- `daysBetweenLocalDates(from, to)`

置換対象:

- `new Date().toISOString().slice(0, 10)`
- `new Date().toISOString().split('T')[0]`
- `new Date().toISOString().slice(0, 7)`

Functions側にも同じ仕様のヘルパーを用意する。

### 8.6 完了条件

- 空の目標を保存できない。
- 全目標IDが共通定義に存在する。
- 高校入試目標で大阪府教材が正しく推奨される。
- 生徒画面と管理画面の目標名・必要語彙数が一致する。
- 午前0時〜9時でも日本の日付で日次データが保存される。

---

## 9. フェーズ4: 単語マスターと永続ID

### 9.1 目的

教材や英検級を切り替えても、同じ単語項目が常に同じIDを持つようにする。

### 9.2 データ調査

最初に次を照合し、どのファイルを正本にするか確定する。

- `words.json`
- `src/wordsData.json`
- `public/words.json`
- `highschool.json`
- Firestoreの `textbooks/*/words`

照合項目:

- 件数
- 単語と意味
- レベル
- 英検級
- 品詞
- サブレベル
- 教材所属
- 重複語の意味違い

### 9.3 永続ID設計

各項目へ一度だけIDを付与し、その後は意味やレベルを編集してもIDを維持する。

初回ID生成時には、次の値を使った安定した署名から候補IDを作る。

```text
source + normalizedWord + normalizedMeaning + partOfSpeech + level
```

例:

```json
{
  "id": "word_01J...",
  "word": "age",
  "meaning": "年齢、時代",
  "level": 3
}
```

注意事項:

- `age` の名詞と動詞など、意味が異なる項目は別IDにする。
- 完全同一レコードだけを重複候補にする。
- 表面語だけをキーにした `Map` で意味違いを消さない。
- 配列のindexをIDとして使わない。

### 9.4 公開データ構成

大きなJSONをJavaScriptバンドルへ直接importしない。

想定構成:

```text
public/data/
  manifest.json
  words-master.json
  words-osaka.json
  words-highschool.json
```

`manifest.json` に次を持たせる。

- バージョン
- 生成日時
- 件数
- SHA-256
- 対応レベル

クライアントは必要な教材を選択した時点で読み込み、セッション内でキャッシュする。

### 9.5 既存復習データの移行

移行は次の2段階で行う。

#### ドライラン

- 全ユーザーの `reviewWords` を取得する。
- 保存済みの単語・意味・レベルから新ID候補を特定する。
- 一意に対応できた件数、複数候補、対応不能をレポートする。
- 書込みはしない。

#### 本実行

- 新IDの文書を作成する。
- 元データに `migratedTo` を記録する。
- 新旧件数と内容を照合する。
- 確認後に旧文書を段階的に無効化または削除する。
- 日次計画キャッシュは新IDで再生成する。

同一IDへ複数履歴が集約される場合:

- `lastReviewed`: 最も新しい日時
- `nextReviewDate`: 最も早い日時
- `repetitions`: 最大値
- `easeFactor`: 最も新しい履歴の値
- 移行元ID一覧を監査情報として保存

### 9.6 完了条件

- 全単語にIDがある。
- JSON順序を変えてもIDが変わらない。
- 教材や級を切り替えても復習文書が重複しない。
- 意味違いの同綴語が失われない。
- 移行前後でユーザーごとの復習件数を説明できる。

---

## 10. フェーズ5: 日次計画と復習ロジック

### 10.1 目的

画面に表示される学習量と、実際に生成される日次計画を一致させる。

### 10.2 実装内容

1. `MOTIVATION_LEVELS` の重複定義を共通設定へ置き換える。
2. `newWordsQuota` を実際の日次計画で使用する。
3. 期限由来の必要語数と希望語数を両方返す。
4. 計画結果に次のメタ情報を追加する。

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

5. Firestore教材と公開JSONで単語候補の取得方式が分裂しないよう整理する。
6. 復習期日を過ぎた単語を優先する。
7. 同じ単語IDを新規・復習・隣接語へ重複投入しない。
8. 大量の復習語がある場合はセッション分割する。
9. Firestore取得失敗を空配列として黙殺せず、画面へ再試行可能な状態を返す。
10. 進捗更新とログ保存を必要箇所でawaitする。

### 10.3 テストケース

- 目標未設定
- 期限未設定
- 期限が1年後
- 期限が30日以内
- 期限が過去
- 現在語彙数が目標以上
- 復習0件
- 期限超過復習が多数
- 同一IDが複数教材に存在
- Firestore読込失敗
- やる気レベルlow / normal / high

### 10.4 完了条件

- 表示した新規語数と生成語数が一致する。
- 同一単語が同じ日次計画内で重複しない。
- 達成困難な期限では明確な警告が出る。
- 失敗時に「学習語なし」と誤表示しない。

---

## 11. フェーズ6: 単語力チェックの再構築

### 11.1 目的

途中リセットやレベル混同をなくし、推定結果を自動テスト可能にする。

### 11.2 ロジック分離

`src/logic/placementTestEngine.js` を追加し、React状態から判定ロジックを分離する。

エンジンの状態例:

```js
{
  stage: 1,
  targetLevel: 3,
  stageAnswers: [],
  allAnswers: [],
  completed: false,
  resultLevel: null
}
```

### 11.3 レベル体系

- 出題選択は単語の `level` 1〜7だけを使用する。
- `eikenLevels` は説明・教材フィルター用途に限定する。
- `pre1`、`pre2` を引き算しない。
- レベルと英検表示名の変換は共通関数で行う。

### 11.4 ステージ進行

1. ステージ1: 5問
2. ステージ2以降: 10問
3. 難易度変更は現在ステージ完了後にだけ行う。
4. ステージ途中で `questionIndex`、`score`、`responseTimes` を初期化しない。
5. 過去に出題したIDを同一テスト内で再出題しない。
6. ステージ得点と全体得点を別に保持する。
7. 早期終了は最低回答数を満たした後、全回答履歴から判定する。
8. 戻る操作で同じ問題へ再回答した場合の扱いを明示する。

### 11.5 再現可能なテスト

出題関数へ乱数関数を注入できるようにする。

```js
selectQuestions(words, level, count, seededRandom)
```

これにより、テスト環境では同じ問題順を再現する。

### 11.6 必須テスト

- 5問目で難易度が変わってもステージがリセットされない。
- `pre1`、`pre2`を含むデータで例外やNaNが発生しない。
- 全問正解でレベルが上がる。
- 全問不正解で適切に下がる。
- 早期終了前に最低回答数を満たす。
- 累積正答率が正しく計算される。
- 最終語彙数が永続IDのユニーク件数から算出される。
- 保存失敗時に完了画面へ進まない。

### 11.7 完了条件

- テスト途中で問題や得点が消えない。
- 同じ回答履歴から常に同じ最終レベルが返る。
- 判定ロジックの主要分岐がユニットテストで網羅される。

---

## 12. フェーズ7: AIストーリー機能

### 12.1 目的

月1回制限、未使用単語の再試行、保存、管理画面表示を矛盾なく動作させる。

### 12.2 サーバー側処理

クライアントからFunctionsを1回だけ呼ぶ。

```text
認証確認
  ↓
月次ドキュメントをトランザクションで予約
  ↓
入力単語を検証
  ↓
1回目のストーリー生成
  ↓
未使用単語があれば同じFunctions実行内で2回目を生成
  ↓
各ストーリーを翻訳
  ↓
最終結果を generatedStories/YYYY-MM に保存
  ↓
クライアントへ完成データを返す
```

予約ドキュメントの状態:

- `generating`
- `complete`
- `failed`

失敗時は再試行できるよう、失敗理由と更新日時を記録する。

### 12.3 保存スキーマ

```json
{
  "status": "complete",
  "title": "今月の長文",
  "sentences": [
    {
      "english": "...",
      "japanese": "..."
    }
  ],
  "usedWordIds": [],
  "unusedWordIds": [],
  "createdAt": "server timestamp"
}
```

### 12.4 クライアント側

- 2回目のAPI呼び出しを削除する。
- `generatedStories` だけを読む。
- 管理画面も `generatedStories` を読む。
- 旧スキーマの `story1`、`story2` は読込み時だけ互換変換する。
- `dangerouslySetInnerHTML` を廃止する。
- テキストを分割し、対象単語だけReactの `<mark>` 要素で描画する。
- 生成中、完了、既存、失敗、再試行の状態を表示する。

### 12.5 完了条件

- 未使用単語があっても429で2回目が失敗しない。
- 同時クリックで月次ストーリーが二重生成されない。
- 生徒画面と管理画面で同じ内容を表示できる。
- HTMLを含む生成文がコードとして実行されない。

---

## 13. フェーズ8: UI、アクセシビリティ、安定性

### 13.1 ログイン

- `<form onSubmit>` を使用する。
- ラベルへ `htmlFor`、inputへ `id` を付ける。
- Enterキーでログイン可能にする。
- 処理中は入力とボタンを無効化する。
- エラーはalertだけでなく画面内へ表示する。
- PCではカード最大幅を設定し、入力欄が画面いっぱいに伸びないようにする。

### 13.2 読込・エラー・空状態

全主要画面で次を用意する。

- 読込中
- データなし
- 権限なし
- 通信失敗
- 再試行
- 保存中
- 保存成功
- 保存失敗

### 13.3 操作性

- 選択ボタンへ `aria-pressed` を付ける。
- フォーカスリングを消さない。
- 最小タップ領域44pxを確保する。
- 色だけで正解・不正解・選択状態を表さない。
- スワイプ操作にはボタンによる代替手段を用意する。
- 音声が利用できない場合も学習を継続できるようにする。

### 13.4 デバッグログ

- 本番で不要な `console.log` を削除する。
- 必要なエラーは共通ロガーへ集約する。
- 生徒名、ユーザーID、回答履歴を本番コンソールへ大量出力しない。
- 開発ログは環境変数で有効化する。

### 13.5 パフォーマンス

- `StudentDashboard` と `AdminDashboard` を遅延読込する。
- 単語JSONを初期JavaScriptバンドルから外す。
- 管理画面用Chart.jsを管理者ルートでのみ読み込む。
- 重い集計をrender中に繰り返さず `useMemo` または事前集計する。
- 大量一覧をページングまたは仮想化する。
- 画像・PDFを初期ロード対象に含めない。

### 13.6 Vite移行

機能ロジックが安定してから、Create React AppをViteへ移行する。

主な変更:

- `react-scripts` を削除
- `vite` とReactプラグインを追加
- `src/index.js` をViteエントリーへ調整
- `process.env.REACT_APP_*` を `import.meta.env.VITE_*` へ変更
- `vite.config.js` を追加
- Firebase Hosting向けbaseを `/` に設定
- テスト基盤をVitestまたは既存Jest互換構成へ移行
- `firebase-admin` などサーバー専用依存をルートから除去

### 13.7 完了条件

- ログイン画面が390px、768px、1440pxで破綻しない。
- キーボードだけでログイン・目標設定できる。
- 主要操作に画面内エラー表示と再試行がある。
- 初期バンドルが現状より明確に縮小する。
- 本番コンソールに大量デバッグログが出ない。

---

## 14. フェーズ9: テストと最終検証

### 14.1 ユニットテスト

対象:

- 目標IDと必要語彙数
- やる気レベルと日次語数
- 日本時間の日付キー
- 単語ID生成とデータ検証
- 復習日計算
- 日次計画
- 単語力チェックエンジン
- 安全な単語ハイライト
- CSV解析・学年正規化・差分計算

### 14.2 コンポーネントテスト

- ログインの必須入力とEnter送信
- 目標未選択時の保存禁止
- やる気選択状態
- 読込失敗と再試行
- 単語力チェックの問題進行
- ストーリーの旧新スキーマ表示
- 管理画面のCSV差分プレビュー

### 14.3 Firebase Emulator統合テスト

シードユーザー:

- 管理者1名
- 生徒A
- 生徒B
- 目標未設定生徒
- 復習期限超過生徒

確認項目:

- ロール別アクセス制御
- 目標保存
- 日次完了
- 復習履歴
- CSV dry-runとupsert
- ストーリー月次制限
- 管理画面からの生徒詳細取得

### 14.4 画面確認

| 画面幅 | 主な確認 |
|---|---|
| 390×844 | スマートフォン、タップ領域、固定タブ、スクロール |
| 768×1024 | タブレット、2列レイアウト |
| 1440×900 | PC、最大幅、管理画面 |

主要導線:

1. 生徒ログイン
2. 初回目標設定
3. 単語力チェック
4. 日次新規学習
5. 不正解語の復習登録
6. 復習セッション
7. ストーリー生成と表示
8. ログアウトと再ログイン
9. 管理者ログイン
10. CSV確認・実行
11. 生徒詳細・ログ・ストーリー確認

### 14.5 品質コマンド

最終的に次を一括実行できるようscriptsを整備する。

```bash
npm run lint
npm test -- --watchAll=false
npm run build
npm audit --omit=dev
npm --prefix functions run lint
npm --prefix functions test
npm audit --omit=dev --prefix functions
```

### 14.6 完了条件

- テスト、Lint、ビルドがすべて成功する。
- Functionsのcritical脆弱性が0件になる。
- 主要導線の画面確認結果を記録する。
- 公開URLでコンソールエラーが発生しない。

---

## 15. リリース計画

### 15.1 リリース前

1. Firestoreの管理エクスポートまたは復元可能なバックアップを取得する。
2. Authユーザー件数、users文書件数、各主要サブコレクション件数を記録する。
3. 単語ID移行のドライラン結果を保存する。
4. Firebase Emulatorで最終テストする。
5. 可能なら別Firebaseプロジェクトまたはステージング環境で確認する。

### 15.2 デプロイ順

1. Firestore RulesとIndexes
2. 後方互換性を持つFunctions
3. データ移行
4. 新しいフロントエンド
5. 公開後スモークテスト

この順番により、古いフロントエンドと新しいFunctions、新しいフロントエンドと移行済みデータが一時的に共存できるようにする。

### 15.3 公開後確認

- ログイン成功率
- Functionsエラー率
- CSV実行結果
- ストーリー生成失敗
- Firestore権限エラー
- 日次完了件数
- 新規・復習ログ件数
- JavaScriptエラー

### 15.4 ロールバック

- Hosting: 直前のFirebase Hostingリリースへ戻す。
- Functions: 旧スキーマ互換を残した前バージョンへ戻す。
- 単語ID: 旧文書を移行確認まで残し、対応表から戻せるようにする。
- CSV: upsert方式のため既存進捗は原則変更せず、operationId単位で更新内容を追跡する。
- Rules: 直前のrulesファイルをタグまたはコミットから再デプロイする。

---

## 16. 推奨コミット単位

1. `chore: establish audit baseline and fix repository ignores`
2. `fix: align firebase hosting and application routing`
3. `fix: make student imports validation-first and non-destructive`
4. `feat: add tracked firestore rules and emulator tests`
5. `refactor: centralize goals motivation and date keys`
6. `feat: add persistent word identifiers and migration tooling`
7. `fix: align daily plan quotas and review scheduling`
8. `refactor: extract and correct placement test engine`
9. `fix: make story generation atomic and safe to render`
10. `fix: improve loading error and accessibility states`
11. `perf: lazy-load routes and word datasets`
12. `build: migrate frontend from cra to vite`
13. `test: add end-to-end release coverage`

各コミットで関係のないファイルを混ぜず、テスト結果を残す。

## 17. リスク管理

| リスク | 影響 | 対策 |
|---|---|---|
| 既存作業中差分との競合 | 変更消失、意図しない上書き | 初期差分記録、工程別変更、狭いパッチ |
| 単語ID移行の誤対応 | 復習履歴消失・重複 | ドライラン、一意判定、旧文書保持 |
| CSV本実行の途中失敗 | AuthとFirestoreの不一致 | 検証先行、operationId、作成ロールバック |
| Rules変更による利用不能 | 全生徒がデータを読めない | Emulator、段階デプロイ、管理者・生徒テスト |
| Node/依存更新の非互換 | Functions停止 | Emulator、関数別デプロイ、旧レスポンス互換 |
| CRAからViteへの移行 | ビルド・環境変数不一致 | 機能修正後に独立工程として実施 |
| 日本時間変更 | 日次キーの二重化 | 移行日を決め、旧UTCキーの読込み互換を期間限定で持つ |
| AI生成の同時実行 | 二重課金・上書き | トランザクション予約と冪等キー |

## 18. 実装着手順

実際の作業は次のまとまりで進める。

### 第1まとまり: 公開とデータ保全

- フェーズ0
- フェーズ1
- フェーズ2
- Security Rules

この段階で、公開URLと管理者の生徒管理を安全にする。

### 第2まとまり: 学習結果の信頼性

- フェーズ3
- フェーズ4
- フェーズ5
- フェーズ6

この段階で、目標、単語、日次計画、単語力チェックを一貫させる。

### 第3まとまり: 機能完成と公開品質

- フェーズ7
- フェーズ8
- フェーズ9
- 本番リリース

この段階で、ストーリー、UI、速度、自動テスト、最終公開を完成させる。

## 19. Definition of Done

つくたんの完成条件は次のとおり。

- Firebase Hostingの正式URLから利用できる。
- 未知URL、再読み込み、認証失敗で空白画面にならない。
- CSVの不正入力で既存生徒が削除されない。
- 生徒は他の生徒データへアクセスできない。
- 空の目標を保存できない。
- 目標ID、必要語彙数、教材推奨が全画面で一致する。
- 同じ単語項目は常に同じIDを持つ。
- 復習履歴が教材切替で重複しない。
- 単語力チェックが途中リセットされない。
- 日次計画の表示値と実データが一致する。
- ストーリーが1回の操作で生成・保存され、管理画面にも表示される。
- AI生成文をHTMLとして実行しない。
- スマートフォンとPCで主要導線が利用できる。
- テスト、Lint、ビルド、依存監査、Emulator検証がリリースゲートを通る。
- データ移行とリリースに復元手順がある。

