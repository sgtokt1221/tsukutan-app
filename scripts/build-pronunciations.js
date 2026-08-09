#!/usr/bin/env node
/**
 * 単語マスターに載っている語の発音記号（IPA）を作る。
 *
 *   node scripts/build-pronunciations.js --dict <cmudict.dict のパス>
 *   node scripts/build-pronunciations.js --check      # 差分が出ないか確認するだけ
 *
 * 出どころは CMU Pronouncing Dictionary（カーネギーメロン大学、BSD相当の
 * 自由なライセンス）。米音の General American で、学校英語の教材と揃う。
 *
 *   cmudict.dict は https://github.com/cmusphinx/cmudict から取る。
 *
 * 出力: data-sources/pronunciations.json
 *   { "about": "əˈbaʊt", ... }  マスターに出てくる語だけを持つ。
 *
 * この JSON をリポジトリに置いておき、build-word-master.js が
 * words-master.json などへ pronunciation として焼き込む。
 * 辞書本体（135,166語, 3.6MB）は持たない。必要な8千語弱だけを残す。
 *
 * 見出しにできない語（複合語・句）は語ごとに引いて空白でつなぐ。
 * 1語でも辞書に無ければその項目は落とす。半端な表記を出さないため。
 */

const fs = require('fs');
const path = require('path');
const { arpabetToIpa } = require('./lib/arpabetToIpa');

const ROOT = path.resolve(__dirname, '..');
const MASTER_PATH = path.join(ROOT, 'public', 'data', 'words-master.json');
const OUT_PATH = path.join(ROOT, 'data-sources', 'pronunciations.json');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const dictArgIndex = args.indexOf('--dict');
const dictPath = dictArgIndex >= 0 ? args[dictArgIndex + 1] : null;

/** cmudict.dict を { 見出し語: IPA } に変換する。括弧付きの異形は捨てて第1候補を採る。 */
const loadDictionary = (filePath) => {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const dict = new Map();
  let unconvertible = 0;

  for (const line of lines) {
    if (!line || line.startsWith(';;;')) continue;
    // 行末のコメント（# ...）を落とす
    const body = line.split('#')[0].trim();
    if (!body) continue;

    const [headword, ...phonemes] = body.split(/\s+/);
    if (!headword || phonemes.length === 0) continue;

    // read(2) のような異形は第1候補だけ使う
    const base = headword.replace(/\(\d+\)$/, '').toLowerCase();
    if (headword.includes('(')) continue;
    if (dict.has(base)) continue;

    const ipa = arpabetToIpa(phonemes);
    if (!ipa) {
      unconvertible += 1;
      continue;
    }
    dict.set(base, ipa);
  }

  return { dict, unconvertible };
};

/**
 * 辞書に見出しが無い語の手当て。
 * 頭字語は文字の名前読み、複合語や外来語は辞書の慣用に合わせて直接書く。
 */
const OVERRIDES = {
  'a.m.': 'ˌeɪ ˈɛm',
  'p.m.': 'ˌpi ˈɛm',
  'P.E.': 'ˌpi ˈi',
  'U.K.': 'ˌju ˈkeɪ',
  VCR: 'ˌvi si ˈɑr',
  domicile: 'ˈdɑməsaɪl',
  extemporaneous: 'ɪkˌstɛmpəˈreɪniəs',
  homeroom: 'ˈhoʊmrum',
  homestay: 'ˈhoʊmsteɪ',
  impudent: 'ˈɪmpjədənt',
  stomachache: 'ˈstʌməkeɪk',
  toothache: 'ˈtuθeɪk',
  'résumé': 'ˈrɛzəmeɪ',
};

/** 見出しを引くための正規化。前後の記号を落とすが、語中のアポストロフィは残す。 */
const normalizeLookup = (token) =>
  token
    .toLowerCase()
    // é などのアクセント記号を外す（résumé → resume）
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”"‘’]/g, "'")
    .replace(/^[^a-z']+/, '')
    .replace(/[^a-z']+$/, '');

/**
 * 1語ぶんを引く。括弧つきの任意部分（eye(s) など）は
 * 付けた形→外した形の順に試す。
 */
const lookupToken = (token, dict) => {
  const candidates = token.includes('(')
    ? [token.replace(/[()]/g, ''), token.replace(/\([^)]*\)/g, '')]
    : [token];

  for (const candidate of candidates) {
    const key = normalizeLookup(candidate);
    if (key && dict.has(key)) return dict.get(key);
  }
  return null;
};

/**
 * 見出し語 1件の IPA を返す。引けなければ null。
 * 句や複合語は空白で区切って語ごとに引く。ハイフンも語の切れ目として扱う。
 */
const lookup = (word, dict) => {
  if (OVERRIDES[word]) return OVERRIDES[word];

  const tokens = word
    // 「～」は目的語の置き場所を表す記号なので、語として引かない
    .replace(/[～~]/g, ' ')
    .split(/[\s/]+/)
    .flatMap((chunk) => chunk.split('-'))
    .map((token) => token.trim())
    // 「...」「…」「＝」のような記号だけの断片は読み上げる対象ではないので飛ばす
    .filter((token) => /[a-z]/i.test(token.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));

  if (tokens.length === 0) return null;

  const parts = [];
  for (const token of tokens) {
    const ipa = lookupToken(token, dict);
    if (!ipa) return null;
    parts.push(ipa);
  }
  return parts.join(' ');
};

const main = () => {
  const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
  const words = [...new Set(master.map((entry) => entry.word))].sort((a, b) => a.localeCompare(b, 'en'));

  const existing = fs.existsSync(OUT_PATH) ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) : null;

  if (checkOnly && !dictPath) {
    if (!existing) {
      console.error('pronunciations.json がありません。--dict を渡して生成してください。');
      process.exit(1);
    }
    const missing = words.filter((word) => !existing[word]);
    console.log(`マスター: ${words.length}語 / 発音あり: ${words.length - missing.length}語 (${((1 - missing.length / words.length) * 100).toFixed(1)}%)`);
    if (missing.length > 0) {
      console.log(`発音なし: ${missing.length}語`);
      console.log(missing.slice(0, 30).map((word) => `  ${word}`).join('\n'));
      if (missing.length > 30) console.log(`  ... 他 ${missing.length - 30}語`);
    }
    return;
  }

  if (!dictPath) {
    console.error('使い方: node scripts/build-pronunciations.js --dict <cmudict.dict>');
    process.exit(1);
  }

  const { dict, unconvertible } = loadDictionary(dictPath);
  console.log(`辞書: ${dict.size}語（変換できなかった項目 ${unconvertible}件）`);

  const result = {};
  const missing = [];
  for (const word of words) {
    const ipa = lookup(word, dict);
    if (ipa) result[word] = ipa;
    else missing.push(word);
  }

  const coverage = ((Object.keys(result).length / words.length) * 100).toFixed(1);
  console.log(`マスター: ${words.length}語 / 発音を付けた語: ${Object.keys(result).length}語 (${coverage}%)`);
  console.log(`引けなかった語: ${missing.length}語`);
  console.log(missing.slice(0, 40).map((word) => `  ${word}`).join('\n'));
  if (missing.length > 40) console.log(`  ... 他 ${missing.length - 40}語`);

  const text = `${JSON.stringify(result, null, 2)}\n`;

  if (checkOnly) {
    const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
    if (current !== text) {
      console.error('pronunciations.json が最新ではありません。--check を外して再生成してください。');
      process.exit(1);
    }
    console.log('pronunciations.json は最新です。');
    return;
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, text);
  console.log(`書き出し: ${path.relative(ROOT, OUT_PATH)}`);
};

main();
