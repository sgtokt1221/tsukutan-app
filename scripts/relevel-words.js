#!/usr/bin/env node
/**
 * 単語データのレベル（1〜7）を付け直す（ルールC。規則の正本は scripts/lib/relevel.js）。
 *
 *   node scripts/relevel-words.js           下読み（変わる数だけ出す。何も書かない）
 *   node scripts/relevel-words.js --check   変わる語があれば exit 1（書き換え忘れの番人）
 *   node scripts/relevel-words.js --write   書き込む
 *
 * - 書き換えるのは public/data/words-master.json と、レベルの写しを持つ
 *   words-osaka.json・words-highschool.json（大阪府の自由学習は教材ファイルのレベルを読む）
 * - **id は変えない**。`subLevel`（5A〜7C。並び順で付いた値）は消す
 * - 何度流しても同じ結果（どの語も英検か元レベルで決まる）
 *
 * `npm run build:words`（scripts/build-words.js）の1段。単独で流したときは
 * `node scripts/build-book-words.js`（単語帳4冊がレベルを借りている）と
 * `npm run build:manifest`（端末が単語データを読み直す目印）も流す（`npm run build:levels` が3つまとめて流す）。
 * 本番 Firestore は触らない。
 */
const fs = require('fs');
const path = require('path');
const { relevelAll } = require('./lib/relevel');

const ROOT = path.join(__dirname, '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const write = (file, data) => fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(data)}\n`);

const main = () => {
  const mode = process.argv.includes('--write') ? 'write' : (process.argv.includes('--check') ? 'check' : 'dry');

  const master = read('public/data/words-master.json');
  const osaka = read('public/data/words-osaka.json');
  const highschool = read('public/data/words-highschool.json');
  const origin = read('data-sources/firestore-textbooks.json');

  const levels = relevelAll({
    master,
    highschoolIds: new Set(highschool.map((w) => w.id)),
    osakaIds: new Set(osaka.map((w) => w.id)),
    highschoolOrigin: origin['highschool-english'],
    osakaOrigin: [...read('public/words.json'), ...origin['osaka-koukou-nyuushi']],
  });

  const counts = [0, 0, 0, 0, 0, 0, 0, 0];
  const basis = {};
  let changed = 0;
  let withSubLevel = 0;
  for (const w of master) {
    const next = levels.get(w.id);
    counts[next.level] += 1;
    basis[next.basis] = (basis[next.basis] || 0) + 1;
    if (w.level !== next.level) changed += 1;
    if ('subLevel' in w) withSubLevel += 1;
  }
  console.log(`レベル別   : ${counts.slice(1).join(' / ')}`);
  console.log(`根拠       : ${Object.entries(basis).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
  console.log(`変わる語   : ${changed} / ${master.length}　（subLevel を消す語 ${withSubLevel}）`);

  if (mode === 'check') {
    process.exitCode = (changed > 0 || withSubLevel > 0) ? 1 : 0;
    console.log(process.exitCode ? '付け直しが必要です（--write）。' : '付け直し済みです。');
    return;
  }
  if (mode !== 'write') return;

  const apply = (list) => list.map((w) => {
    const next = levels.get(w.id);
    const { subLevel, ...rest } = w; // eslint-disable-line no-unused-vars
    // 教材ファイルだけにある語（master に無い id）はレベルをそのまま残す
    return next ? { ...rest, level: next.level } : rest;
  });
  write('public/data/words-master.json', apply(master));
  write('public/data/words-osaka.json', apply(osaka));
  write('public/data/words-highschool.json', apply(highschool));
  console.log('書き込みました。続けて node scripts/build-book-words.js と npm run build:manifest を。');
};

main();
