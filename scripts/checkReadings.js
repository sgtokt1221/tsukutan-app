#!/usr/bin/env node
/**
 * 長文の素材を検める。docs/reading-format.md が正本。
 *
 * 見るもの:
 *   - チャンクをつないで文になるか（空・二重スペース）
 *   - role が S/V/O/C/M か
 *   - その級までの単語で何割書けているか
 *   - 語数が級の目安に収まっているか
 *   - index.json と実ファイルが食い違っていないか
 *
 * 語彙のカバー率がここで見えないと、「その級の単語で書く」は口約束になる。
 *
 *   node scripts/checkReadings.js
 *   node scripts/checkReadings.js --words   級の外だった語を並べる
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const READING_DIR = path.join(ROOT, 'public/reading');
const INDEX = path.join(READING_DIR, 'index.json');
const MASTER = path.join(ROOT, 'public/data/words-master.json');

/** やさしい順。src/StudentDashboard.js の EIKEN_ORDER と揃える。 */
const EIKEN_ORDER = [5, 4, 3, 'pre2', 2, 'pre1'];
const ROLES = new Set(['S', 'V', 'O', 'C', 'M']);

/** 級ごとの語数の目安（docs/reading-format.md §3）。 */
const WORD_RANGE = {
  5: [40, 90], 4: [80, 150], 3: [120, 220], pre2: [200, 350], 2: [300, 500], pre1: [350, 600],
};

/**
 * どの級にも数えない語。
 * 機能語と数字は級に関係なく出るので、カバー率の分母から外す。
 * ここを甘くすると「9割が級の中」に見えてしまうので、最小限に留める。
 */
const FREE_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'so', 'if', 'that', 'this', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'not', 'no', 'yes',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'as', 'about',
  'there', 'here', 'when', 'where', 'what', 'who', 'how', 'why', 'which',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
]);

const easiestEikenLevel = (word) => {
  if (!Array.isArray(word?.eikenLevels)) return null;
  const known = word.eikenLevels.filter((level) => EIKEN_ORDER.includes(level));
  if (known.length === 0) return null;
  return known.reduce((a, b) => (EIKEN_ORDER.indexOf(a) < EIKEN_ORDER.indexOf(b) ? a : b));
};

/**
 * レベル（1〜7）から英検の級へ。levels.json の eiken と揃える。
 * マスターの 7,949 語のうち eikenLevels を持つのは 4,478 語だけで、
 * milk や kitchen のような基本語にも級が入っていない。級が無いからと
 * 外すと、書ける語がほとんど無くなってしまう。
 */
const EIKEN_BY_LEVEL = { 1: 5, 2: 4, 3: 3, 4: 'pre2', 5: 2, 6: 2, 7: 'pre1' };

/** その級までに出てよい語（見出しを小文字で）。 */
const allowedWordsFor = (grade, master) => {
  const target = /^\d+$/.test(grade) ? Number(grade) : grade;
  const limit = EIKEN_ORDER.indexOf(target);
  if (limit < 0) return null;

  const allowed = new Set();
  for (const word of master) {
    const level = easiestEikenLevel(word) ?? EIKEN_BY_LEVEL[word.level] ?? null;
    if (level === null || EIKEN_ORDER.indexOf(level) > limit) continue;
    // 熟語は語ごとにばらして入れる（"a lot of" の lot を拾えるように）
    for (const token of String(word.word).toLowerCase().split(/[^a-z']+/)) {
      if (token) allowed.add(token);
    }
  }
  return allowed;
};

/**
 * 不規則動詞。語尾の規則では原形に戻せない。
 * 4級以上は過去形を使うので、ここが無いと「級の外」だらけになる。
 */
const IRREGULAR = {
  had: 'have', made: 'make', sold: 'sell', came: 'come', went: 'go', gave: 'give',
  sang: 'sing', sent: 'send', bought: 'buy', brought: 'bring', took: 'take',
  saw: 'see', said: 'say', told: 'tell', found: 'find', got: 'get', put: 'put',
  ran: 'run', ate: 'eat', drank: 'drink', wrote: 'write', read: 'read',
  taught: 'teach', thought: 'think', knew: 'know', grew: 'grow', built: 'build',
  began: 'begin', became: 'become', left: 'leave', felt: 'feel', kept: 'keep',
  met: 'meet', paid: 'pay', heard: 'hear', held: 'hold', lost: 'lose',
  spoke: 'speak', stood: 'stand', understood: 'understand', won: 'win',
  wore: 'wear', chose: 'choose', fell: 'fell', flew: 'fly', spent: 'spend',
  written: 'write', taken: 'take', given: 'give', seen: 'see', done: 'do',
  gone: 'go', known: 'know', grown: 'grow', spoken: 'speak', eaten: 'eat',
  forgot: 'forget', forgotten: 'forget', swam: 'swim', swum: 'swim',
  slept: 'sleep', sat: 'sit', drove: 'drive', driven: 'drive', rose: 'rise',
  children: 'child', people: 'person', men: 'man', women: 'woman', feet: 'foot',
};

/** 語尾を落として原形に寄せる。辞書は持たない（不規則だけ上の表で見る）。 */
const forms = (token) => {
  const set = new Set([token]);
  if (IRREGULAR[token]) set.add(IRREGULAR[token]);
  const rules = [
    [/ies$/, 'y'], [/ied$/, 'y'], [/ies$/, ''], [/es$/, ''], [/s$/, ''],
    [/ing$/, ''], [/ing$/, 'e'], [/ed$/, ''], [/ed$/, 'e'],
    [/([^aeiou])\1(ing|ed)$/, '$1'], [/er$/, ''], [/est$/, ''], [/ly$/, ''],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(token)) set.add(token.replace(pattern, replacement));
  }
  return set;
};

const sentenceText = (sentence) => sentence.chunks.map((chunk) => chunk.en).join(' ');

const main = () => {
  const showWords = process.argv.includes('--words');
  const master = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));

  let problems = 0;

  for (const grade of index.grades) {
    const allowed = allowedWordsFor(grade.id, master);

    for (const listed of grade.readings) {
      const file = path.join(READING_DIR, grade.id, `${listed.id}.json`);
      if (!fs.existsSync(file)) {
        console.log(`✗ ${listed.id}  ファイルが無い`);
        problems += 1;
        continue;
      }
      const reading = JSON.parse(fs.readFileSync(file, 'utf8'));
      const notes = [];

      if (reading.grade !== grade.id) notes.push(`grade が index と違う（${reading.grade}）`);

      const outside = [];
      let counted = 0;
      let words = 0;

      // 固有名詞を先に集める。文の途中で大文字始まりなら名前とみなす。
      // 文頭にも出てくるので（Shiro likes balls.）、読みもの全体で拾っておく。
      const properNouns = new Set();
      for (const sentence of reading.sentences) {
        const raw = sentenceText(sentence).split(/\s+/).filter(Boolean);
        for (let position = 1; position < raw.length; position += 1) {
          const original = raw[position].replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
          if (/^[A-Z]/.test(original)) properNouns.add(original.toLowerCase());
        }
      }

      for (const sentence of reading.sentences) {
        if (!sentence.ja) notes.push('文の和訳が無い');
        for (const chunk of sentence.chunks) {
          if (!chunk.en?.trim()) notes.push('空のチャンクがある');
          if (!chunk.ja?.trim()) notes.push(`和訳の無いチャンク: ${chunk.en}`);
          if (!ROLES.has(chunk.role)) notes.push(`role が S/V/O/C/M でない: ${chunk.role}`);
        }
        const text = sentenceText(sentence);
        if (/\s{2,}/.test(text)) notes.push(`つなぐと二重スペースになる: ${text}`);

        // 大文字で始まる語のうち、文頭でないものは固有名詞として数えない。
        // 名前（Shiro / Yumi）を「級の外」と数えても直しようがない。
        const raw = text.split(/\s+/).filter(Boolean);
        for (let position = 0; position < raw.length; position += 1) {
          const original = raw[position].replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, '');
          const token = original.toLowerCase();
          if (!token) continue;
          words += 1;
          if (FREE_WORDS.has(token)) continue;
          if (properNouns.has(token)) continue;
          counted += 1;
          const known = [...forms(token)].some((form) => allowed?.has(form));
          if (!known) outside.push(token);
        }
      }

      const coverage = counted === 0 ? 1 : (counted - outside.length) / counted;
      const [min, max] = WORD_RANGE[grade.id] || [0, 9999];
      if (words < min || words > max) notes.push(`語数 ${words}（目安 ${min}〜${max}）`);

      const mark = notes.length === 0 && coverage >= 0.9 ? '✓' : '✗';
      if (mark === '✗') problems += 1;
      console.log(`${mark} ${grade.id.padEnd(4)} ${listed.id.padEnd(22)} ${words}語  `
        + `級内 ${Math.round(coverage * 100)}%`
        + (outside.length ? `  外: ${[...new Set(outside)].slice(0, 8).join(' ')}` : ''));
      for (const note of notes) console.log(`     - ${note}`);
      if (showWords && outside.length) {
        console.log(`     級の外だった語: ${[...new Set(outside)].join(' ')}`);
      }
    }
  }

  console.log(problems === 0 ? '\nすべて通った。' : `\n${problems}件、直すところがある。`);
  process.exitCode = problems === 0 ? 0 : 1;
};

main();
