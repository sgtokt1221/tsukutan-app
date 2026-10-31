#!/usr/bin/env node
/**
 * 英検ライティングの重要フレーズを単語データへ入れる。
 *
 * 出どころは先生から渡された「◯級合格ライティング道場」（3級 / 準2級 / 2級）。
 * 中身は scripts/lib/writingPhrases.js に置いてある（PDFは配れないので、
 * 素材そのものをリポジトリの正本にする）。
 *
 *   node scripts/importWritingPhrases.js          下読み
 *   node scripts/importWritingPhrases.js --write  words-master.json へ書き込む
 *
 * 書き込んだあとは、テーマを付け直すこと（意味別の合計が合わなくなる）。
 *   node scripts/assignThemes.js --rest   → 未決を themeOverrides に足す
 *   node scripts/assignThemes.js --write
 *
 * 本番 Firestore は触らない。public/data/*.json だけ。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BY_GRADE } = require('./lib/writingPhrases');

const ROOT = path.join(__dirname, '..');
const MASTER = path.join(ROOT, 'public/data/words-master.json');

/** 既存の id と同じ形にする（w_ + 16桁）。同じ見出しなら毎回同じ id。 */
const idFor = (word) =>
  `w_${crypto.createHash('sha1').update(`writing:${word}`).digest('hex').slice(0, 16)}`;

/** 見出しの比較用。伏せ字と記号の違いで二重登録しない。 */
const key = (word) => String(word).toLowerCase().replace(/[～~.\s]/g, '');

const main = () => {
  const write = process.argv.includes('--write');
  const master = JSON.parse(fs.readFileSync(MASTER, 'utf8'));

  const existing = new Map(master.map((entry) => [key(entry.word), entry]));
  const added = [];
  const skipped = [];
  const seen = new Set();

  for (const { grade, level, entries } of BY_GRADE) {
    for (const [word, meaning, example, exampleJa] of entries) {
      const k = key(word);
      // 同じフレーズが複数の級に載っている。やさしい級のほうを採る。
      if (seen.has(k)) continue;
      seen.add(k);

      if (existing.has(k)) {
        skipped.push(`${word} → 既に ${existing.get(k).word}`);
        continue;
      }

      added.push({
        id: idFor(word),
        word,
        partOfSpeech: '熟語',
        meaning,
        example,
        exampleJa,
        level,
        eikenLevels: [grade],
        // 書くための型なので、単語カードと区別できるようにしておく。
        source: 'writing',
      });
    }
  }

  console.log(`追加 ${added.length}件 / 既にある ${skipped.length}件`);
  const byLevel = {};
  for (const entry of added) byLevel[entry.eikenLevels[0]] = (byLevel[entry.eikenLevels[0]] || 0) + 1;
  console.log('級ごと:', JSON.stringify(byLevel));
  if (skipped.length) console.log(`\n既にあるので入れないもの:\n  ${skipped.join('\n  ')}`);

  if (!write) {
    console.log('\n下読みだけ。書き込むには --write を付ける。');
    return;
  }

  fs.writeFileSync(MASTER, `${JSON.stringify([...master, ...added])}\n`);
  console.log(`\n${path.relative(ROOT, MASTER)} へ書き込んだ（${master.length} → ${master.length + added.length}語）`);
  console.log('テーマを付け直すこと: node scripts/assignThemes.js --rest');
};

main();
