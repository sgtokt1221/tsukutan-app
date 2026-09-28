#!/usr/bin/env node
/**
 * public/data/manifest.json の files（件数・バイト数・sha256）を、**今のファイルから計算し直す。**
 *
 * ## なぜ要るか（2026-09-24）
 * 端末は単語データを保存するとき、manifest の sha256 を鍵にする（→ src/logic/wordDataCache.js）。
 * データを書き換えても manifest が古いままだと、**鍵が変わらないので端末は古いデータを使い続ける**
 * （エラーは出ない）。実際に words-master は 7,949語の版の鍵のまま 8,160語になっていた。
 *
 * `npm run build:words` の最後の段でもある（scripts/build-words.js）。
 * データファイルに手を入れたときは、これだけ流して manifest を合わせる。
 * 番人は src/logic/wordManifest.test.js。
 *
 *   node scripts/refresh-word-manifest.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', 'public', 'data');
const manifestPath = path.join(DIR, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const name of Object.keys(manifest.files || {})) {
  const text = fs.readFileSync(path.join(DIR, name), 'utf8');
  const data = JSON.parse(text);
  const count = Array.isArray(data) ? data.length : Object.keys(data).length;
  const before = manifest.files[name];
  manifest.files[name] = {
    count,
    bytes: Buffer.byteLength(text),
    sha256: crypto.createHash('sha256').update(text).digest('hex'),
  };
  const changed = before.sha256 !== manifest.files[name].sha256;
  console.log(`${changed ? '更新' : 'そのまま'}  ${name}  ${before.count} → ${count}件`);
}

for (const [id, book] of Object.entries(manifest.textbooks || {})) {
  if (manifest.files[book.file]) manifest.textbooks[id] = { ...book, count: manifest.files[book.file].count };
}
const levels = JSON.parse(fs.readFileSync(path.join(DIR, 'words-master.json'), 'utf8')).map((w) => w.level);
manifest.levels = [...new Set(levels)].sort((a, b) => a - b);

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
