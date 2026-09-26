#!/usr/bin/env node
/**
 * 単語データに theme（意味のまとまり）を焼き込む。
 *
 * 意味別タブは themes.json のキーワードを実行時に部分一致させていたので、
 * 7〜8割の語がどのテーマにも入らず、レベル別・品詞別と数が合わなかった。
 * 分類はここで一度だけ決めて、データに持たせる。実行時は word.theme を読むだけ。
 *
 * 1語につきテーマは1つ。先に書いたルールが勝つ（scripts/lib/themeRules.js）。
 *
 *   node scripts/assignThemes.js          下読み。書き込まずに結果だけ出す
 *   node scripts/assignThemes.js --write  3つのデータファイルへ書き込む
 *   node scripts/assignThemes.js --rest   まだテーマが決まらない語を出す
 *
 * 本番 Firestore は触らない。public/data/*.json だけを書き換える。
 */

const fs = require('fs');
const path = require('path');
const { THEME_RULES, POS_FALLBACK } = require('./lib/themeRules');
const { WORD_TO_THEME } = require('./lib/themeOverrides');

const ROOT = path.join(__dirname, '..');
const MASTER = path.join(ROOT, 'public/data/words-master.json');
// master のIDの部分集合。theme はIDで配る。
const DERIVED = [
  path.join(ROOT, 'public/data/words-osaka.json'),
  path.join(ROOT, 'public/data/words-highschool.json'),
];

const THEME_IDS = require(path.join(ROOT, 'src/config/themes.json')).map((t) => t.id);
const THEME_LABELS = Object.fromEntries(
  require(path.join(ROOT, 'src/config/themes.json')).map((t) => [t.id, t.label])
);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data)}\n`);

/** 英語の見出しを語に割る。'look up to' → ['look','up','to'] */
const tokenize = (text) =>
  (text || '').toLowerCase().split(/[^a-z']+/).filter(Boolean);

/**
 * 1語のテーマを決める。決まらなければ null。
 * ja は意味（日本語）の部分一致、en は見出しの語の完全一致で見る。
 * 部分一致を英語に使うと 'go' が ago / good に当たる。
 */
const themeOf = (word) => {
  // 1語ずつ置いた表が最優先。ルールの当たり方に左右されない。
  const override = WORD_TO_THEME.get(word.word);
  if (override) return override;

  const meaning = String(word.meaning || '');
  const tokens = new Set(tokenize(word.word));

  for (const rule of THEME_RULES) {
    if (rule.en && rule.en.some((term) => tokens.has(term))) return rule.theme;
    if (rule.ja && rule.ja.some((term) => meaning.includes(term))) return rule.theme;
  }

  // 最後の逃げ。形容詞・副詞は「ようす・性質」で素直に読める。
  for (const [pos, theme] of Object.entries(POS_FALLBACK)) {
    if (String(word.partOfSpeech || '').includes(pos)) return theme;
  }

  return null;
};

const main = () => {
  const write = process.argv.includes('--write');
  const showRest = process.argv.includes('--rest');

  const master = readJson(MASTER);
  const counts = {};
  const rest = [];
  const themeById = new Map();

  for (const word of master) {
    const theme = themeOf(word);
    if (theme && !THEME_IDS.includes(theme)) {
      throw new Error(`themes.json に無いテーマです: ${theme}（${word.word}）`);
    }
    if (theme) {
      themeById.set(word.id, theme);
      counts[theme] = (counts[theme] || 0) + 1;
    } else {
      rest.push(word);
    }
  }

  const decided = master.length - rest.length;
  console.log(`master ${master.length}語  テーマ決定 ${decided}  未決 ${rest.length}`);
  console.log('');
  for (const id of THEME_IDS) {
    console.log(`  ${String(THEME_LABELS[id]).padEnd(14)} ${String(counts[id] || 0).padStart(5)}`);
  }

  if (showRest) {
    console.log(`\n--- 未決 ${rest.length}語 ---`);
    for (const word of rest) {
      console.log(`${word.word} | ${word.partOfSpeech} | ${word.meaning}`);
    }
  }

  if (!write) {
    console.log('\n下読みだけ。書き込むには --write を付ける。');
    return;
  }
  if (rest.length > 0) {
    console.log('\n未決が残っているうちは書き込まない。--rest で中身を見る。');
    process.exitCode = 1;
    return;
  }

  for (const file of [MASTER, ...DERIVED]) {
    const words = readJson(file);
    let missed = 0;
    for (const word of words) {
      const theme = themeById.get(word.id);
      if (theme) word.theme = theme;
      else missed += 1;
    }
    writeJson(file, words);
    console.log(`書き込み ${path.relative(ROOT, file)}  ${words.length}語${missed ? `（master に無いID ${missed}）` : ''}`);
  }
};

main();
