#!/usr/bin/env node
/**
 * 面接カードの一覧に出すサムネイルを作る。
 *
 * 問題カードのイラストは 1400px 幅で1枚 180KB ほどある。一覧に5枚並べると
 * 選ぶだけで 1MB 近く落とすことになるので、480px 幅の小さい写しを別に置く。
 *
 * あわせて index.json に thumbnail を書き込む。一覧はカード本体（{級}/{id}.json）
 * を読まないので、ファイル名を画面側で組み立てると規約が二重になる。
 *
 *   node scripts/buildInterviewThumbs.js          下読み
 *   node scripts/buildInterviewThumbs.js --write  作って書き込む
 *
 * cwebp が要る（brew install webp）。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'public/eiken-interview/index.json');
const ART_DIR = path.join(ROOT, 'public/eiken');
const THUMB_DIR = path.join(ART_DIR, 'thumbs');

/** 一覧に出すのは1枚目のイラスト。準2級のように2枚あっても先頭だけ。 */
const firstIllustration = (grade, cardId) => {
  const file = path.join(ROOT, 'public/eiken-interview', grade, `${cardId}.json`);
  const card = JSON.parse(fs.readFileSync(file, 'utf8'));
  return card.illustrations?.[0]?.file || null;
};

const main = () => {
  const write = process.argv.includes('--write');
  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));

  if (write) fs.mkdirSync(THUMB_DIR, { recursive: true });

  for (const grade of index.grades) {
    for (const card of grade.cards) {
      const source = firstIllustration(grade.id, card.id);
      if (!source) {
        console.log(`${card.id.padEnd(14)} イラストなし`);
        continue;
      }

      const from = path.join(ART_DIR, source);
      const to = path.join(THUMB_DIR, source);
      if (!fs.existsSync(from)) {
        console.log(`${card.id.padEnd(14)} 元の画像が無い: ${source}`);
        continue;
      }

      if (write) {
        execFileSync('cwebp', ['-quiet', '-q', '76', '-resize', '480', '0', from, '-o', to]);
        card.thumbnail = `thumbs/${source}`;
      }

      const before = fs.statSync(from).size;
      const after = write ? fs.statSync(to).size : null;
      console.log(`${card.id.padEnd(14)} ${source}  ${Math.round(before / 1024)}KB`
        + (after === null ? '' : ` → ${Math.round(after / 1024)}KB`));
    }
  }

  if (!write) {
    console.log('\n下読みだけ。作るには --write を付ける。');
    return;
  }
  fs.writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`\n${path.relative(ROOT, INDEX)} に thumbnail を書き込んだ。`);
};

main();
