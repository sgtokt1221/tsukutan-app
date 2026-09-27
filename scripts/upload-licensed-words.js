#!/usr/bin/env node
/**
 * 市販の単語帳を、塾の生徒だけが読める置き場（Firestore `licensedWordBooks`）へ入れる（2026-09-27）。
 *
 *   node scripts/upload-licensed-words.js          # 何冊・何語・何チャンクかを見るだけ
 *   node scripts/upload-licensed-words.js --apply  # Firestore へ書く
 *
 * ## なぜ公開ファイルに置かないか
 * **このリポジトリは公開**で、ホスティングの /data/ も誰でも取れる。単語帳の収録語と並び（本の番号）は
 * 本の中身なので、`local/licensed-words/`（Git の外。scripts/build-book-words.js の出力）から直接入れる。
 * 読むのは生徒（firestore.rules の isEnrolled）と、職員の管理画面（関数 staffBookWords 経由）。
 *
 * ## 形
 *   licensedWordBooks/{deckId}              { deckId, file, count, chunks, version }
 *   licensedWordBooks/{deckId}/chunks/{NN}  { words: [...] }   … 1文書1MBの上限があるので400語ずつ
 * version は中身のハッシュ。端末はこれが変わったときだけ読み直す。
 *
 * 認証は Application Default Credentials（`gcloud auth application-default login`）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'local', 'licensed-words');
const PROJECT = 'tsukutan-58b3f';
const CHUNK = 400;

async function main() {
  if (!fs.existsSync(DIR)) throw new Error(`${path.relative(ROOT, DIR)} がありません。先に node scripts/build-book-words.js`);
  const files = fs.readdirSync(DIR).filter((f) => /^words-book-.+\.json$/.test(f)).sort();
  const books = files.map((file) => {
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    const words = JSON.parse(text);
    if (!Array.isArray(words) || words.length === 0) throw new Error(`${file} が空です`);
    const deckId = file.replace(/^words-book-|\.json$/g, '');
    const version = crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
    return { deckId, file, words, version, chunks: Math.ceil(words.length / CHUNK) };
  });
  for (const b of books) console.log(`${b.deckId.padEnd(18)} ${String(b.words.length).padStart(5)}語  ${b.chunks}チャンク  ${b.version}`);
  if (!process.argv.includes('--apply')) {
    console.log('--apply を付けると Firestore へ書きます');
    return;
  }

  const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
  admin.initializeApp({ projectId: PROJECT });
  const db = admin.firestore();
  for (const b of books) {
    const ref = db.collection('licensedWordBooks').doc(b.deckId);
    const batch = db.batch();
    for (let i = 0; i < b.chunks; i += 1) {
      batch.set(ref.collection('chunks').doc(String(i).padStart(2, '0')), { words: b.words.slice(i * CHUNK, (i + 1) * CHUNK) });
    }
    // **一覧は最後に書く**（チャンクが揃う前に version が変わると、端末が欠けたまま読む）
    batch.set(ref, { deckId: b.deckId, file: b.file, count: b.words.length, chunks: b.chunks, version: b.version });
    await batch.commit();
    // 減ったチャンク（前より語数が少ない）を消す
    const old = await ref.collection('chunks').get();
    await Promise.all(old.docs.filter((d) => Number(d.id) >= b.chunks).map((d) => d.ref.delete()));
    console.log(`書きました: licensedWordBooks/${b.deckId}`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
