#!/usr/bin/env node
/**
 * scripts/export-firestore-textbooks.js
 *
 * Firestore の textbooks/{id}/words を data-sources/firestore-textbooks.json へ書き出す。
 * build-word-master.js の入力になるので、Firestore 側の単語を足したら実行し直すこと。
 *
 *   node scripts/export-firestore-textbooks.js
 *
 * 認証は Application Default Credentials（gcloud auth application-default login）。
 * 読み取りのみで、Firestore には何も書かない。
 *
 * 文書ID（ランダム自動ID）は保存しない。永続IDは内容から決めるので使わない。
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data-sources', 'firestore-textbooks.json');
const PROJECT_ID = 'tsukutan-58b3f';

const main = async () => {
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
  }
  const db = admin.firestore();

  const out = {};
  for (const textbook of await db.collection('textbooks').listDocuments()) {
    const snapshot = await textbook.collection('words').get();
    out[textbook.id] = snapshot.docs.map((doc) => doc.data());
    const levels = [...new Set(out[textbook.id].map((w) => w.level))].sort((a, b) => a - b);
    console.log(`${textbook.id.padEnd(22)} ${String(snapshot.size).padStart(5)}件  レベル: ${levels.join(',')}`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  console.log(`保存: ${path.relative(ROOT, OUT)}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
