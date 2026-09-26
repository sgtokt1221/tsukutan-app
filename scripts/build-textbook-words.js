#!/usr/bin/env node
/**
 * 教科書（開隆堂 Sunshine）の語をカードにする（規則は scripts/lib/textbookWords.js）。
 *
 *   node scripts/build-textbook-words.js
 *
 * 入力  data-sources/textbook-sunshine-r7.json（ページつきの語彙一覧）
 *       public/data/words-master.json / words-book-*.json（意味を引く相手）
 * 出力  public/data/words-textbook-sunshine.json
 *       docs/baseline/sunshine-unmatched.txt（意味が引けず外した語。あとで足すときの一覧）
 *
 * `npm run build:words`（scripts/build-words.js）の1段。レベルを付け直したあとに流す
 * （単語データの level を借りるので）。本番 Firestore は触らない。
 */
const fs = require('fs');
const path = require('path');
const { buildTextbookCards } = require('./lib/textbookWords');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'public', 'data');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

const source = read('data-sources/textbook-sunshine-r7.json');
const master = read('public/data/words-master.json');
const bookWords = fs.readdirSync(DATA)
  .filter((f) => /^words-book-.*\.json$/.test(f))
  .sort()
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')));

const { cards, skipped, counts } = buildTextbookCards(source.rows, master, bookWords);

fs.writeFileSync(path.join(DATA, 'words-textbook-sunshine.json'), `${JSON.stringify(cards)}\n`);

const noMeaning = skipped.filter((s) => s.reason === 'no-meaning');
const report = [
  `# 教科書 Sunshine で、意味が引けず外した語（${noMeaning.length}行）`,
  '# 学年 ページ 語。人名・地名（大文字で始まり単語データに無い語）はここに載せない',
  ...noMeaning.map((s) => `${s.row.grade}\tp.${s.row.page}\t${s.row.word}`),
].join('\n');
fs.mkdirSync(path.join(ROOT, 'docs', 'baseline'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'baseline', 'sunshine-unmatched.txt'), `${report}\n`);

console.log(`教科書の行: ${source.rows.length}　カード: ${cards.length}`);
console.log(`  内訳: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
for (const g of [1, 2, 3]) console.log(`  ${g}年: ${cards.filter((c) => c.grade === g).length}語`);
