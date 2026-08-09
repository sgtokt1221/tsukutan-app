#!/usr/bin/env node
/**
 * 実力テストの問題バンクを単語マスターから作る。
 *
 *   node scripts/build-assessment-items.js
 *   node scripts/build-assessment-items.js --check
 *
 * 出力: public/data/assessment-items.json
 *
 * Firestore ではなく静的JSONに置く。問題は生成物でユーザーごとに
 * 変わらないため、単語データ（words-master.json）と同じ扱いにすると
 * 読み取り課金もルールも要らず、git で差分が追える。
 * 出題統計は assessmentSessions から後で集計する。
 *
 * 先生の校閲は挟まない運用にしたので、質の悪い問題は作らせない側で
 * 防ぐ（scripts/lib/assessmentItemBuilder.js のフィルタ）。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  isSingleWord,
  meaningsOverlap,
  choiceLengthsBalanced,
  canMakeCloze,
  blankExample,
  pickDistractors,
} = require('./lib/assessmentItemBuilder');

const ROOT = path.resolve(__dirname, '..');
const MASTER_PATH = path.join(ROOT, 'public', 'data', 'words-master.json');
const RANKS_PATH = path.join(ROOT, 'src', 'config', 'ranks.json');
const OUT_PATH = path.join(ROOT, 'public', 'data', 'assessment-items.json');

/** ランクごと・領域ごとに用意する上限。全語ぶん作るとファイルが数MBになる。 */
const ITEMS_PER_RANK_PER_DOMAIN = 120;

const DOMAINS = ['vocabulary', 'context'];

const itemId = (kind, word) => {
  const signature = `${kind}|${word.word}|${word.meaning}|${word.level}`;
  return `ai_${crypto.createHash('sha256').update(signature).digest('hex').slice(0, 16)}`;
};

/** 単語レベル(1〜7) を ranks.json の代表スコア経由でランクへ写す */
const buildLevelToRank = () => {
  const ranks = JSON.parse(fs.readFileSync(RANKS_PATH, 'utf8'));
  const map = {};
  for (const [level, score] of Object.entries(ranks.levelToScore)) {
    if (!Number.isFinite(score)) continue;
    const rank = ranks.ranks.find((r) => score >= r.min && score <= r.max);
    if (rank) map[level] = rank.id;
  }
  return map;
};

/** 正解の位置が偏らないように、決まった規則でずらす（計画書13.2） */
const placeAnswer = (correct, distractors, index) => {
  const position = index % 4;
  const choices = [...distractors];
  choices.splice(position, 0, correct);
  return { choices, correctChoice: position };
};

const main = () => {
  const checkOnly = process.argv.includes('--check');
  const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
  const levelToRank = buildLevelToRank();

  // 同レベル・同品詞のプール。誤答はここからしか取らない。
  const pools = new Map();
  for (const word of master) {
    if (!word.meaning || !word.partOfSpeech) continue;
    const key = `${word.level}|${word.partOfSpeech}`;
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(word);
  }

  const items = [];
  const counts = {};
  const rejected = { noPool: 0, distractors: 0, length: 0, noCloze: 0, sameInSentence: 0, idiom: 0 };

  // 出力を安定させるため、語→品詞→意味で並べてから回す
  const ordered = [...master].sort((a, b) =>
    `${a.word}|${a.partOfSpeech}|${a.meaning}`.localeCompare(`${b.word}|${b.partOfSpeech}|${b.meaning}`, 'en')
  );

  ordered.forEach((word, index) => {
    const rank = levelToRank[String(word.level)];
    if (!rank || !word.meaning || !word.partOfSpeech) return;

    const pool = pools.get(`${word.level}|${word.partOfSpeech}`) || [];
    if (pool.length < 4) {
      rejected.noPool += 1;
      return;
    }

    for (const domain of DOMAINS) {
      const key = `${rank}|${domain}`;
      counts[key] = counts[key] || 0;
      if (counts[key] >= ITEMS_PER_RANK_PER_DOMAIN) continue;

      const distractors = pickDistractors(word, pool, index);
      if (!distractors) {
        rejected.distractors += 1;
        continue;
      }

      // 熟語は語義が近いものが多く、「〜と調和して」と「〜と一致して」の
      // ように、文字列としては別でも両方が正解になる組み合わせが作れて
      // しまう。類義語辞書が無い以上ここでは防げないので、意味を問う
      // 4択には使わない。空所補充なら文脈で答えが1つに決まる。
      if (domain === 'vocabulary' && /熟/.test(word.partOfSpeech)) {
        rejected.idiom = (rejected.idiom || 0) + 1;
        continue;
      }

      if (domain === 'vocabulary') {
        const { choices, correctChoice } = placeAnswer(
          word.meaning,
          distractors.map((d) => d.meaning),
          counts[key]
        );
        if (!choiceLengthsBalanced(choices)) {
          rejected.length += 1;
          continue;
        }
        items.push({
          itemId: itemId('vocab', word),
          domain,
          targetRank: rank,
          level: word.level,
          word: word.word,
          prompt: `${word.word} の意味として最も適切なものはどれですか。`,
          choices,
          correctChoice,
        });
        counts[key] += 1;
        continue;
      }

      // 文脈・空所補充
      if (!canMakeCloze(word)) {
        rejected.noCloze += 1;
        continue;
      }
      // 誤答も1語でないと選択肢として文に嵌まらない
      if (!distractors.every((d) => isSingleWord(d.word))) {
        rejected.noCloze += 1;
        continue;
      }
      // 誤答の語が例文に既に出ていると答えが割れる
      const sentence = blankExample(word);
      const lowerSentence = sentence.toLowerCase();
      if (distractors.some((d) => lowerSentence.includes(String(d.word).toLowerCase()))) {
        rejected.sameInSentence += 1;
        continue;
      }
      const { choices, correctChoice } = placeAnswer(
        word.word,
        distractors.map((d) => d.word),
        counts[key]
      );
      items.push({
        itemId: itemId('cloze', word),
        domain,
        targetRank: rank,
        level: word.level,
        word: word.word,
        prompt: '空所に入る語として最も適切なものはどれですか。',
        sentence,
        sentenceJa: word.exampleJa || null,
        choices,
        correctChoice,
      });
      counts[key] += 1;
    }
  });

  // 同じ itemId が二重に入らないことを確かめる
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.itemId)) {
      console.error(`itemId が衝突しました: ${item.itemId} (${item.word})`);
      process.exit(1);
    }
    ids.add(item.itemId);
  }

  items.sort((a, b) => a.itemId.localeCompare(b.itemId));

  const payload = {
    version: 1,
    generatedFrom: 'public/data/words-master.json',
    itemsPerRankPerDomain: ITEMS_PER_RANK_PER_DOMAIN,
    counts,
    items,
  };
  const text = `${JSON.stringify(payload)}\n`;

  if (checkOnly) {
    const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
    if (current !== text) {
      console.error('assessment-items.json が最新ではありません。--check を外して再生成してください。');
      process.exit(1);
    }
    console.log('assessment-items.json は最新です。');
    return;
  }

  fs.writeFileSync(OUT_PATH, text);

  console.log('=== 実力テストの問題を生成しました ===');
  console.log(`  問題数    : ${items.length}`);
  console.log(`  容量      : ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`);
  console.log('  ランク×領域:');
  for (const key of Object.keys(counts).sort()) {
    console.log(`    ${key.padEnd(20)} ${counts[key]}`);
  }
  console.log('  作らなかった理由:');
  console.log(`    誤答が確保できない : ${rejected.distractors}`);
  console.log(`    選択肢の長さが偏る : ${rejected.length}`);
  console.log(`    空所にできない     : ${rejected.noCloze}`);
  console.log(`    誤答が例文に出現   : ${rejected.sameInSentence}`);
  console.log(`    同レベル同品詞不足 : ${rejected.noPool}`);
};

main();
