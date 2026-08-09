# リリース前バックアップ記録（2026-08-09）

計画書15.1に対応する記録。

## Firestore エクスポート

| 項目 | 値 |
|---|---|
| 保存先 | `gs://tsukutan-58b3f-firestore-backup/2026-08-09-pre-release` |
| バケットのロケーション | `asia-northeast2`（Firestore と同じ） |
| 状態 | SUCCESSFUL |
| 文書数 | **13,717** |
| 取得コマンド | `gcloud firestore export gs://tsukutan-58b3f-firestore-backup/2026-08-09-pre-release --project tsukutan-58b3f` |

復元:

```bash
gcloud firestore import gs://tsukutan-58b3f-firestore-backup/2026-08-09-pre-release \
  --project tsukutan-58b3f
```

**インポートは既存文書を上書きする。** 復元する場合は影響範囲を確認してから実行すること。

## 件数

| 項目 | 件数 |
|---|---:|
| Firebase Auth アカウント | **242** |
| `users` 文書 | **240** |
| `goalsMaster` 文書 | 14 |
| Firestore 全文書（エクスポート時点） | 13,717 |

Auth 242 と users 240 の差は、管理者アカウントと、Firestore 文書を持たない
アカウントが1件ある可能性を示す。CSV取り込みの `replace` モードは
`studentId` を持つ文書だけを生徒とみなすので、この差分に影響されない。

## Firebase Auth は Firestore エクスポートに含まれない

アカウント本体（メール・パスワードハッシュ）は別物なので、上記の
エクスポートでは復元できない。必要なら別途取得すること。

```bash
firebase auth:export auth-backup.json --project tsukutan-58b3f
```

**出力にはパスワードハッシュが含まれる。** リポジトリの外に置き、共有しないこと。
今回は取得していない。

生徒アカウントは規約から再作成できる（メール `{4桁ID}@tsukasafoods.com`、
初期パスワード `tsukuba{4桁ID}`）ので、実質的に失って困るのは管理者アカウントだけ。
管理者は `tsukasafoods@gmail.com` なので Console からリセットできる。

## この時点の本番の状態

| 対象 | 状態 |
|---|---|
| Firestore Rules | **この記録の直後に新ルールをデプロイ**（それまでは「認証済みなら全部読み書き可」） |
| Cloud Functions | 旧実装（`importUsers` は全削除する版） |
| Hosting | 未公開（Firebase の初期画面） |
| GitHub Pages | 404 |
