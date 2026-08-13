#!/usr/bin/env node
/**
 * partOfSpeech の表記ゆれを直す。
 *
 * マスターに「熟語」と「熟」が混在していた。品詞別タブは posMap の '熟語' を
 * 部分一致で探すので、「熟」と書かれた語はどの品詞にも入らず、合計が
 * レベル別より少なくなっていた（高校英語で647語ぶん）。
 *
 *   node scripts/normalizePartOfSpeech.js          下読み
 *   node scripts/normalizePartOfSpeech.js --write  書き込む
 *
 * 本番 Firestore は触らない。public/data/*.json だけ。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'public/data/words-master.json',
  'public/data/words-osaka.json',
  'public/data/words-highschool.json',
].map((file) => path.join(ROOT, file));

/** 正本の書き方。左を右に寄せる。 */
const CANONICAL = { 熟: '熟語' };

const normalize = (value) =>
  String(value || '')
    .split(/\s*[,、]\s*/)
    .map((part) => CANONICAL[part] || part)
    .join(', ');

const main = () => {
  const write = process.argv.includes('--write');

  for (const file of FILES) {
    const words = JSON.parse(fs.readFileSync(file, 'utf8'));
    let changed = 0;
    for (const word of words) {
      const next = normalize(word.partOfSpeech);
      if (next !== word.partOfSpeech) {
        word.partOfSpeech = next;
        changed += 1;
      }
    }
    console.log(`${path.relative(ROOT, file).padEnd(34)} ${String(changed).padStart(4)}語を直す`);
    if (write) fs.writeFileSync(file, `${JSON.stringify(words)}\n`);
  }

  if (!write) console.log('\n下読みだけ。書き込むには --write を付ける。');
};

main();
