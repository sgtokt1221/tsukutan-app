# フェーズ0 基準値レポート

- 計測日: 2026-08-09
- ブランチ: `feat/admin-portal`
- 対象: `IMPLEMENTATION_PLAN.md` フェーズ0（作業状態の保全と実装基盤）

このディレクトリは**変更前のスナップショット**です。以降の工程で「本当に改善したか」を
比較する基準になるので、内容を上書きせず、再計測するときは日付つきの別ファイルに残してください。

| ファイル | 内容 | 再生成コマンド |
|---|---|---|
| `git-snapshot.txt` | ブランチ・差分・未追跡ファイルの一覧 | 手動 |
| `word-data-audit.txt` / `.json` | 単語データの件数・ハッシュ・重複・分布 | `node scripts/audit-word-data.js --json docs/baseline/word-data-audit.json` |
| `config-consistency.txt` / `.json` | 目標ID・教材ID・コレクション名・環境変数の不整合 | `node scripts/check-config-consistency.js --json docs/baseline/config-consistency.json` |
| `build-and-audit.txt` | ビルド出力・バンドルサイズ・依存監査 | `CI=false npm run build` / `npm audit --omit=dev` |

---

## 1. 品質指標

| 項目 | 計画書3章の記載 | 実測（2026-08-09） | 備考 |
|---|---|---|---|
| 本番ビルド | 成功・警告あり | **成功・警告1件** | 計画書は「警告2件」。実際は `react-hooks/exhaustive-deps` 1件のみ |
| JSバンドル | gzip 約766KB | **gzip 766.17 kB**（生 3.32MB） | 一致 |
| テスト | 0件のため失敗 | **失敗**（`App.test.js` にテストが無い） | 一致 |
| Lint | 警告2件 | **1件** — `src/ReviewFlashcard.js:250` `viewMode` 依存漏れ | `npm run lint` スクリプトは未定義（ビルド経由のeslintのみ） |
| アプリ依存監査 | 69件 / critical 4 | **69件（low 11 / moderate 21 / high 33 / critical 4）** | 一致 |
| Functions依存監査 | 22件 / critical 3 | **22件（low 1 / moderate 12 / high 6 / critical 3）** | critical は `websocket-driver` 系 |
| Functions Node.js | 18（非推奨） | **18** | ローカル実行環境は Node v22.19.0 |
| ビルド時の想定ホスト | — | **`/tsukutan-app/`** | `package.json` の `homepage` 由来。フェーズ1で撤去 |

## 2. 単語データ

| ファイル | 件数 | SHA-256（先頭12桁） | レベル範囲 | 完全同一の重複 | 同綴・意味違い | 永続ID |
|---|---:|---|---|---:|---:|---|
| `words.json` | 7,205 | `ff6b9fad30b3` | 1–7 | 518 | 777 | なし |
| `src/wordsData.json` | 7,205 | `ff6b9fad30b3` | 1–7 | 518 | 777 | なし |
| `public/words.json` | 1,969 | `e258cfd4e203` | **1–9** | 0 | 426 | なし |
| `highschool.json` | 5,307 | `1884bfbc684e` | 5–7 | 518 | 355 | なし |

**フェーズ4へ引き継ぐ事実**

1. `words.json` と `src/wordsData.json` は**バイト単位で同一**。正本は1つで、片方は複製。
2. `highschool.json` の完全同一重複518件が、そのまま `words.json` にも入っている。
   マージ時に重複が持ち込まれた。統合してよいのはこの518件だけ。
3. `words.json` の**777件は同綴だが意味・品詞が違う**（`close` 動/形/副 など）。
   表面語をキーにした `Map` で潰すと消える。計画書9.3の警告どおり。
4. `public/words.json` だけ**レベルが1〜9**。他は1〜7。
   計画書11.3の「レベルは1〜7だけを使う」と食い違うので、
   フェーズ4の正本確定時にどちらの体系に寄せるか決める必要がある。
5. どのファイルにも `id` フィールドが無い。現状は配列indexか表面語がIDの代わり。

## 3. 設定の不整合（`check-config-consistency.js` の検出結果）

### 3.1 目標ID — 旧IDが8種類残存

`setupMasterData.js` の `goalsMaster` 定義（14件）が正本。以下は正本に存在しない。

| 旧ID | 使用箇所 |
|---|---|
| `hs1`–`hs5` | `AdminDashboard.js:41-45, 117, 838` / `StudentDashboard.js:264, 270` |
| `uni1`–`uni3` | `AdminDashboard.js:46-48, 118, 839` |

`StudentDashboard.js:270` の大阪府教材の推奨判定が `['hs1','hs2']` を見ているため、
新IDで目標を設定した生徒には**大阪府教材が推奨されない**。計画書8.6の完了条件に直結する。

### 3.2 コレクション名 — スキーマ外の2つ

コード内で使われている: `users`, `logs`, `reviewWords`, `freeStudyProgress`,
`generatedStories`, `goalsMaster`, `textbooks`, `words`, **`dailyCompletion`**, **`stories`**

- **`dailyPlans` はコードから一度も参照されていない。** 実際に使われているのは
  `users/{uid}/dailyCompletion/{YYYY-MM-DD}`（`StudentDashboard.js:773, 926` / `AdminDashboard.js:376, 380`）。
  `CLAUDE.md` のスキーマ記載が実装とずれている。
- **`users/{uid}/stories` と `users/{uid}/generatedStories` が併存している。**
  - 書き込み: `functions/index.js:364` → `generatedStories`
  - 生徒画面の読み込み: `StudentDashboard.js:694` → `generatedStories`
  - **管理画面の読み込み: `AdminDashboard.js:466` → `stories`**

  つまり**管理画面の生徒詳細ではストーリーが常に空**になる。エラーは出ないので沈黙失敗。
  計画書12.4「管理画面も `generatedStories` を読む」で解消される想定。

### 3.3 環境変数

- `REACT_APP_MANAGE_STUDENTS_URL` は `.env` に未定義だが、
  `AdminDashboard.js:599` にコード内既定値があるため動作はする。
  `.env` に明示するか、既定値に一本化するかを決める。

## 4. リポジトリ衛生（本フェーズで実施した変更）

| 対象 | 変更前 | 変更後 |
|---|---|---|
| `.gitignore` | `/functions/node_modules` に行末コメントが付き無効 | 修正済み。加えて `.eslintcache`、Firebaseエミュレータ成果物を追加 |
| `functions/node_modules` | 15,318ファイルがGit追跡対象 | `git rm -r --cached` で追跡解除（ローカル実体は触っていない） |
| `tsukutan-app` | `.gitmodules` の無い**孤児gitlink**（mode 160000）が追跡されていた | 追跡解除 |
| `.env` | 追跡中 | **そのまま**。`REACT_APP_*` はクライアントバンドルに焼き込まれる公開値で、機密ではない |
| `serviceAccountKey.json` | 追跡なし・ignore済み | 変更なし |

## 5. Firebase の現行状態

| 項目 | 値 |
|---|---|
| プロジェクトID | `tsukutan-58b3f`（`.firebaserc`） |
| Hosting public | `build`、SPA rewrite `** → /index.html` あり |
| Functions codebase | `functions`（Node 18, us-central1） |
| **`firestore.rules`** | **リポジトリに存在しない** |
| **`firestore.indexes.json`** | **リポジトリに存在しない** |
| `firebase.json` の firestore セクション | **無し** |
| importUsers URL | `https://importusers-oyecohkzna-uc.a.run.app`（`.env`） |
| manageStudents URL | `https://us-central1-tsukutan-58b3f.cloudfunctions.net/manageStudents`（コード内既定値） |

**Security Rules がバージョン管理されていない。** 現行ルールは Firebase Console にしか存在せず、
内容を確認するには `firebase firestore:rules get` 相当の取得か Console の目視が要る。
計画書7.8のRulesテストに入る前に、まず現行ルールを吸い出して `firestore.rules` として
リポジトリに取り込む工程が要る（フェーズ2の前提）。

## 6. バックアップJSONの保管方針

未追跡のバックアップが7件ある。**削除しない**（計画書2.2）。

```
highschool_backup_before_reclassify.json
words_backup.json
words_backup_2kyu.json
words_backup_before_highschool_update.json
words_backup_before_merge.json
words_backup_pre1.json
words_backup_realistic.json
```

方針:

1. リポジトリには**コミットしない**（合計で数MB、かつ正本ではないため）。
2. ローカルの `backups/` ディレクトリへ移動し、`.gitignore` で除外する。
   移動は**フェーズ4のデータ照合が終わってから**行う。それまでは現在地から動かさない
   （既存スクリプトが相対パスで参照している可能性があるため）。
3. 何のバックアップか分かるよう、移動時に `backups/MANIFEST.md` へ
   「生成日時・生成元スクリプト・件数・SHA-256」を記録する。件数とハッシュは
   `node scripts/audit-word-data.js <file>` で取得できる。

## 7. 次工程への申し送り

| # | 内容 | 対応フェーズ |
|---|---|---|
| 1 | `firestore.rules` / `firestore.indexes.json` が未管理。現行ルールの吸い出しが先 | フェーズ2の前 |
| 2 | 管理画面が `stories` を読んでいてストーリーが常に空 | フェーズ7（12.4） |
| 3 | 旧目標ID `hs1-5` / `uni1-3` が8種類残存。大阪府教材の推奨が壊れている | フェーズ3（8.2, 8.6） |
| 4 | `dailyPlans` は実在せず `dailyCompletion` が実体。`CLAUDE.md` の修正が必要 | フェーズ3/5 |
| 5 | `public/words.json` だけレベル体系が1〜9 | フェーズ4（9.2） |
| 6 | `highschool.json` 由来の完全同一重複518件 | フェーズ4（9.3） |
| 7 | `npm run lint` スクリプトが未定義。計画書14.5の品質コマンドが揃わない | フェーズ9（14.5） |
