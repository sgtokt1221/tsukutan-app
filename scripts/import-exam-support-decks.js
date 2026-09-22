#!/usr/bin/env node
/**
 * scripts/import-exam-support-decks.js
 *
 * 受験サポート（つくばホーム）の小テスト用単語帳を data-sources/ へ写す。
 *
 *   node scripts/import-exam-support-decks.js          # 写す
 *   node scripts/import-exam-support-decks.js --check  # ずれていないかだけ見る
 *
 * **正本はつくばホーム側**（`tsukuba-manager/data/source/words/*.json`）。
 * 語の中身を直すときは**あちらを直してから**これを実行する。こちらで直すと、
 * 同じ本の小テストと単語カードで訳が食い違う（生徒は同じ本を開いている）。
 *
 * ここは写すだけ。つくつくの形に直すのは build-book-words.js。
 *
 * つくばホームを clone していない環境では**失敗にしない**（写しがあれば足りる）。
 * CI やほかの人の手元で、無いものを理由に赤くしても直しようがない。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data-sources', 'exam-support-decks');

/** つくばホームの置き場。**兄弟ディレクトリにある前提**（無ければ飛ばす） */
const SOURCE_DIR = path.resolve(ROOT, '..', 'tsukuba-manager', 'data', 'source', 'words');

/**
 * 写す単語帳。**英語の4冊だけ。**
 * 生物基礎・古典文法も同じ場所にあるが、つくつくは英単語しか扱わない。
 */
const DECKS = ['systan5', 'target1900', 'leap', 'idiom-target1000'];

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

const main = () => {
  const check = process.argv.includes('--check');

  if (!fs.existsSync(SOURCE_DIR)) {
    console.log(`つくばホームが見つかりません（${SOURCE_DIR}）。写しをそのまま使います。`);
    return 0;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let changed = 0;
  for (const deckId of DECKS) {
    const from = path.join(SOURCE_DIR, `${deckId}.json`);
    if (!fs.existsSync(from)) {
      console.error(`× ${deckId}.json が向こうにありません`);
      return 1;
    }
    const text = fs.readFileSync(from, 'utf8');

    // **読めることを確かめてから写す。** 壊れたJSONを写すと、
    // 次の build-book-words.js まで気づけない
    const deck = JSON.parse(text);
    if (deck.subjectId !== 'english') {
      console.error(`× ${deckId} は英語ではありません（subjectId=${deck.subjectId}）`);
      return 1;
    }

    const to = path.join(OUT_DIR, `${deckId}.json`);
    const before = fs.existsSync(to) ? fs.readFileSync(to, 'utf8') : null;
    if (before === text) {
      console.log(`  ${deckId}  そのまま（${deck.words.length}語）`);
      continue;
    }

    changed += 1;
    console.log(
      `${check ? '差分' : '更新'}  ${deckId}  ${deck.words.length}語  ${sha256(text).slice(0, 12)}`
      + (before === null ? '（新規）' : ''),
    );
    if (!check) fs.writeFileSync(to, text);
  }

  if (check && changed > 0) {
    console.error(`\n${changed}件ずれています。 node scripts/import-exam-support-decks.js で写し直してください。`);
    return 1;
  }
  return 0;
};

process.exit(main());
