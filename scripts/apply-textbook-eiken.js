#!/usr/bin/env node
/**
 * 中学の語の英検の級（5・4・3級）を、教科書の初出学年で決め直す（規則は scripts/lib/textbookEiken.js）。
 *
 *   node scripts/apply-textbook-eiken.js           下読み（変わる行と例を出す。書かない）
 *   node scripts/apply-textbook-eiken.js --write   書き込む
 *
 * `npm run build:words`（scripts/build-words.js）の1段。relevel-words.js より前に流す
 * （レベルは英検の級から付け直すので）。単独で流さない（理由は lib の冒頭）。
 *
 * 書き換えるのは eikenLevels を持つ words-master.json と words-osaka.json。
 * 本番 Firestore は触らない。
 */
const fs = require('fs');
const path = require('path');
const { textbookEikenChanges } = require('./lib/textbookEiken');

const ROOT = path.join(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const write = (file, data) => fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(data)}\n`);

const easiest = (levels) => {
  const order = ['5', '4', '3', 'pre2', '2', 'pre1', '1'];
  const ranks = (levels || []).map((x) => order.indexOf(String(x))).filter((i) => i >= 0);
  return ranks.length ? order[Math.min(...ranks)] : 'なし';
};

const master = read('public/data/words-master.json');
const textbook = read('data-sources/textbook-sunshine-r7.json');
const changes = textbookEikenChanges(master, textbook.words);

const moves = {};
for (const entry of master) {
  if (!changes.has(entry.id)) continue;
  const key = `${easiest(entry.eikenLevels)} → ${easiest(changes.get(entry.id))}`;
  (moves[key] = moves[key] || []).push(entry.word);
}
console.log(`教科書の語: ${textbook.words.length}　変わる行: ${changes.size} / ${master.length}`);
for (const [key, words] of Object.entries(moves).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${key.padEnd(12)} ${String(words.length).padStart(4)}  ${words.slice(0, 10).join(', ')}`);
}

if (process.argv.includes('--write')) {
  const apply = (list) => list.map((w) => (changes.has(w.id) ? { ...w, eikenLevels: changes.get(w.id) } : w));
  write('public/data/words-master.json', apply(master));
  write('public/data/words-osaka.json', apply(read('public/data/words-osaka.json')));
  console.log('書き込みました。続けて relevel-words.js（npm run build:words なら自動で続く）');
}
