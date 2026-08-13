# CLAUDE.md - つくたん (tsukutan-app)

## 1. Project Overview

中高生向けの英単語学習アプリ「つくたん」。生徒が目標（英検 / 高校入試 / 大学入試）と達成日・やる気レベルを設定すると、必要語彙数から逆算した日次学習プランが自動生成される。

主要機能:

- **目標設定** — 英検5級〜1級 / 高校入試（偏差値45・50・60・最難関） / 大学入試（偏差値50・60・最難関）を複数選択可。達成日とやる気レベル（そこそこ / 普通 / やる気満々）を設定
- **語彙力チェックテスト** — レベル推定（`VocabularyCheckTest.js` → `TestResult.js`）
- **日次学習** — 新規単語 + 復習単語のフラッシュカード（`LearningFlashcard.js` / `ReviewFlashcard.js`）
- **自由学習** — 教材別・レベル別に自分のペースで進める（進捗は別管理）
- **AIストーリー生成** — 学習した単語を使った短編を Gemini (Vertex AI) が生成し、Cloud Translation で和訳を付与。**月1回まで**
- **分析・予測** — 正答率推移・弱点分野・学習パターン・レベル予測・推薦（`src/logic/` 配下）
- **管理者ダッシュボード** — 生徒一覧、学年別インサイト、生徒詳細（ログ/復習単語/ストーリー）、CSV一括インポート、生徒個別作成・削除、印刷用小テスト/ストーリー出力

## 2. Technical Stack

| 領域 | 技術 |
|------|------|
| フロント | React 19 + Create React App (`react-scripts` 5.0.1) |
| ルーティング | react-router-dom v7（`basename="/tsukutan-app"`） |
| UI | 素の CSS（`App.css` / `AdminDashboard.css` / `Analytics.css`）+ framer-motion + react-icons |
| グラフ | Chart.js + react-chartjs-2 |
| 認証 / DB | Firebase Auth + Cloud Firestore |
| サーバー | Cloud Functions for Firebase v2（Node 18, us-central1） |
| AI | Vertex AI `gemini-2.0-flash-001` + Cloud Translation v3beta1 |
| CSV | papaparse + iconv-lite（Shift_JIS 対応） |
| 音声 | Web Speech API（`src/logic/speechUtils.js`） |

Firebase プロジェクト: **`tsukutan-58b3f`**（`.firebaserc`）
GitHub: `sgtokt1221/tsukutan-app`（現在のブランチは `feat/admin-portal`）

## 3. Key Files & Architecture

| File/Dir | Role |
|----------|------|
| `src/App.js` | ルーティング + 認証状態監視 + 目標設定画面（UI がここに直書き） |
| `src/LoginPage.js` | ログイン |
| `src/StudentDashboard.js` | **3,365行**。生徒側のほぼ全機能（ホーム / ストーリー / 自由学習タブ、分析セクション） |
| `src/AdminDashboard.js` | **1,332行**。管理者。`view` state で `analytics` / `studentDetails` / `import` を切替 |
| `src/LearningFlashcard.js` | 新規学習フラッシュカード（1,318行） |
| `src/ReviewFlashcard.js` | 復習フラッシュカード（1,367行） |
| `src/VocabularyCheckTest.js` | 語彙力チェックテスト（975行） |
| `src/GoalSetter.js` | 目標設定コンポーネント。**未使用（デッドコード）** — 実体は `App.js` 内の `/set-goal` ルート |
| `src/PrintableQuiz.js` / `PrintableStory.js` | 印刷用ビュー |
| `src/LevelBadge.js` / `ProgressLamp.js` | 表示用小コンポーネント |
| `src/firebaseConfig.js` | Firebase 初期化。**gitignore 済み（リポジトリに無い）** |
| `src/wordsData.json` | クライアント同梱の単語データ |
| `src/components/` | 分割済みのコンポーネント群（`eiken` / `learning` / `student` / `assessment` / `layout` / `onboarding` / `ui` / `brand`）。新しい画面はここに置く |
| `functions/index.js` | Cloud Functions 4本（下記） |

### 英検二次試験（面接）モード — `src/components/eiken/`

素材は `public/eiken-interview/`（形式の正本は `docs/eiken-interview-format.md`）。

| File | Role |
|------|------|
| `EikenInterview.js` | 入室から退室までを1場面ずつ進める。録音・文字起こし・結果の状態を全部ここが持つ |
| `SpeakingPanel.js` | 録り終えたあとの聞き返しと、文字起こしの編集欄 |
| `InterviewResultModal.js` | 通し終えたあとの結果。Chart.js のドーナツと横棒 + 場面ごとの講評 |
| `src/logic/interviewContent.js` | 素材の読み込み、場面の組み立て（`buildBeats`）、その場面で何を録るか（`speakingFor`） |
| `src/logic/interviewScore.js` | 結果の点。音読は読めた語の割合、質問は判定（good/partial/off-target） |
| `src/logic/transcribeApi.js` | `transcribeSpeaking()` 文字起こし / `reviewAnswer()` 採点 |
| `src/logic/useRecorder.js` | MediaRecorder。端末まかせの形式で録り、送るときだけ 16kHz WAV に変換 |

**採点は面接の途中では出さない。** 録音を止めると自動で文字起こしだけ走り、生徒が
文字を直せる。判定（Gemini）は「結果を見る」を押した時点で、直したあとの文に対して
まとめて走る。ここを変えると、認識ミスがそのまま点になる。

### `src/logic/` — ビジネスロジック層

| File | Role |
|------|------|
| `learningPlanner.js` | `generateDailyPlan()` — 日次プラン（新規 / 復習 / 追加分）生成 |
| `reviewLogic.js` | 復習単語の追加・進捗更新・削除（間隔反復） |
| `progressLogic.js` | `updateProgressPercentage()` — `goalsMaster` の必要語彙数に対する達成率 |
| `vocabularyEstimator.js` | `estimateNeededWords()` — 目標から必要語彙数を算出 |
| `basicAnalytics.js` | 正答率推移・弱点・学習パターン分析（425行） |
| `knowledgeAnalysis.js` | テーマ別の知識マップ / ギャップ抽出 |
| `predictionModel.js` | レベル予測・学習曲線・信頼度 |
| `recommendationEngine.js` | レベル / 成績 / スケジュールベースの推薦 |
| `freeStudyProgress.js` | 自由学習の進捗保存（教材ID × レベル単位） |
| `studyLogger.js` | `users/{uid}/logs` への記録 |
| `speechUtils.js` | 発音再生（音声の選択ロジックを含む） |

### Cloud Functions（`functions/index.js`）

| Export | 種類 | 用途 |
|--------|------|------|
| `importUsers` | onRequest (Express) | CSV 一括インポート。**既存ユーザーを全削除してから作り直す破壊的処理** |
| `manageStudents` | onRequest (Express) | `POST /` 生徒作成、`DELETE /:uid` 生徒削除（サブコレクション再帰削除 + Auth 削除） |
| `generateStoryFromWords` | onRequest | AI ストーリー生成 + 和訳。月1回制限 |
| `transcribeSpeaking` | onRequest (Express) | `POST /` 録音（16kHz WAV）→ Speech-to-Text で文字起こし。`POST /review` 文字起こし（生徒が直したあとの文）→ 読み飛ばした語 + Gemini による中身の判定 |

### ルート直下の運用スクリプト（Admin SDK, ローカル実行）

`serviceAccountKey.json` を読む Node スクリプト群。**本番 Firestore を直接書き換えるので実行前に必ず内容を確認すること。**

- `setupMasterData.js` — `goalsMaster` コレクションの初期投入
- `uploadWords.js` — JSON → 任意のコレクションへ単語投入（先頭の定数でファイル名とコレクション名を切替）
- `migrate.js` — 旧 `words` コレクション → 教材ID 単位への移行
- `mergeHighschoolWords.js` / `reclassifyHighschoolLevels.js` / `addSubLevelsToHighschool.js` / `updateWordsWithReclassifiedHighschool.js` — 高校英語データの整備
- `extract.js` — JSON から単語だけ抽出

## 4. Database Schema (Firestore)

```
users/{uid}
  name, studentId, grade, level
  goal: { targets: [{goalId, displayName}], isSet, targetDate, motivationLevel, setAt }
  progress: { percentage, currentVocabulary, lastCheckedAt }

  logs/{autoId}              学習・テストのイベントログ
  reviewWords/{wordId}       復習対象（間隔反復の状態を持つ）
  dailyPlans/{YYYY-MM-DD}    その日のプラン
  freeStudyProgress/{textbookId}_{level}   自由学習の進捗（+ 'all' ドキュメント）
  generatedStories/{YYYY-MM} 月次 AI ストーリー（存在すればその月は生成不可）

goalsMaster/{goalId}
  displayName, requiredVocabulary, description
```

単語データ（`words.json` / `highschool.json` など）のスキーマ:

```json
{ "word": "about", "partOfSpeech": "副", "meaning": "約、およそ",
  "example": "about 40 students", "exampleJa": "約40人の生徒", "level": 1 }
```

### アカウント規約（ハードコード）

- 生徒メール = `{4桁の生徒ID}@tsukasafoods.com`
- 生徒初期パスワード = `tsukuba{4桁の生徒ID}`
- 管理者判定 = メールアドレスが `tsukasafoods@gmail.com` かどうか（`src/App.js` と `functions/index.js` の `verifyAdmin` の**2箇所**にハードコード）

## 5. Coding Conventions

- コンポーネントは `src/` 直下にフラット配置、ファイル名は PascalCase、ロジックは `src/logic/` に camelCase
- ロジックは `export const fn = async (...) => {}` 形式の名前付きエクスポート
- CSS は BEM ではなくセマンティックなクラス名（`section-card` / `goal-chip` / `motivation-option` など）
- UI 文言は日本語。コード内コメントも日本語が主
- 状態管理ライブラリは未使用。`useState` + props で完結（そのため巨大コンポーネントになっている）

## 6. Development Commands

```bash
npm start                       # localhost:3000 で開発サーバー
npm run build                   # 本番ビルド → build/
npm test                        # react-scripts test (jest)

firebase deploy --only hosting  # Hosting（public: build）
firebase deploy --only functions
cd functions && npm run serve   # Functions エミュレータ
```

## 7. Common Pitfalls

- **`npm run deploy` は動かない。** `gh-pages -d build` を呼ぶが `gh-pages` が dependencies にも node_modules にも無い。デプロイは `firebase deploy` を使うか、`gh-pages` を入れる
- **`basename="/tsukutan-app"`** が Router に固定されている。Firebase Hosting のルートに置くとパスが合わない（GitHub Pages 前提の設定が残っている）
- **`importUsers` は既存ユーザーを全削除してから再作成する。** 部分更新ではない。CSV 実行前に必ず影響範囲を確認する
- **管理者メールが2箇所にハードコード**（`src/App.js:28` と `functions/index.js:35`）。変更時は両方直す。片方だけだと沈黙失敗する
- **AI ストーリーは月1回制限。** `users/{uid}/generatedStories/{YYYY-MM}` の存在チェックで判定するため、テストしたい場合はこのドキュメントを消す
- **`src/firebaseConfig.js` は gitignore 済み。** 新しい環境でクローンしたら手動で作る必要がある
- **CSV は Shift_JIS 前提**（`iconv.decode(buffer, 'shift_jis')` → 文字化け検出で UTF-8 フォールバック）
- **ルート直下の `*.js` スクリプトは本番 Firestore を直接叩く。** 実行前に定数（コレクション名・ファイルパス）を必ず読むこと
- `words_backup_*.json` が多数あるが、どれが最新の正本かはファイル名からしか判断できない。現行の正本は `words.json` と `src/wordsData.json`

## 8. Current State / Known Issues

**リポジトリ衛生**

- `functions/node_modules` が **git に追跡されたまま**（`.gitignore` の該当行に行末コメントが付いていて無効化されていたのが原因。2026-08-09 修正済）。作業ツリー上では削除済みなので大量の `D` 差分が出ている → `git rm -r --cached functions/node_modules` してコミットが必要
- `.env` が追跡されている。中身は `REACT_APP_IMPORT_USERS_URL` のみで、`REACT_APP_*` は元々クライアントバンドルに焼き込まれる公開値のため機密漏洩ではない。`serviceAccountKey.json` は履歴を含め一度もコミットされていない（確認済み）
- 直近のコミットメッセージが `fdfd` / `dsds` など無意味。以後は内容の分かるメッセージにする
- リモートブランチが5本（`main` / `feat/admin-portal` / `feat/mobile-responsive-styles` / `feature/review-mode` / `update-word-levels`）。マージ済みかどうか未整理

**コード**

- `StudentDashboard.js` が 3,365 行。分析パネル・ストーリー・自由学習が1ファイルに同居している
- **`src/GoalSetter.js` はどこからも import されていないデッドコード**（`grep` で確認済み）。実際に使われている目標設定 UI は `src/App.js` 内にインラインで書かれた `/set-goal` ルート。`App.css:615` に残る `GoalSetter` 用スタイルも同様
- `src/App.js` の目標設定画面に `alert()` と `console.log()` がデバッグ用に残っている（やる気レベル選択時）
- テストは CRA 雛形の `App.test.js` のみ。`src/logic/` にテストが無い
