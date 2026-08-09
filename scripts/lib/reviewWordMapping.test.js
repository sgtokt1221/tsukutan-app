const test = require('node:test');
const assert = require('node:assert/strict');

const { buildIndex, mapReviewWord, mergeReviewDocs } = require('./reviewWordMapping');

const MASTER = [
  { id: 'w_close_v', word: 'close', partOfSpeech: '動', meaning: '〜を閉じる', level: 2 },
  { id: 'w_close_a', word: 'close', partOfSpeech: '形', meaning: '接近した', level: 3 },
  { id: 'w_close_d', word: 'close', partOfSpeech: '副', meaning: '近くに', level: 3 },
  { id: 'w_apple', word: 'apple', partOfSpeech: '名', meaning: 'りんご', level: 1 },
  { id: 'w_gather', word: 'gather', partOfSpeech: '動', meaning: '集まる', level: 6 },
];

const index = buildIndex(MASTER);

test('語+品詞+意味+レベルが一致すれば確実に対応づく', () => {
  const result = mapReviewWord({ word: 'apple', partOfSpeech: '名', meaning: 'りんご', level: 1 }, index);
  assert.equal(result.status, 'matched');
  assert.equal(result.id, 'w_apple');
  assert.equal(result.via, 'word+pos+meaning+level');
});

test('レベルが再分類されていても語+品詞+意味で対応づく', () => {
  // gather のレベルが 7 で保存されていたが、マスターでは 6 になっている
  const result = mapReviewWord({ word: 'gather', partOfSpeech: '動', meaning: '集まる', level: 7 }, index);
  assert.equal(result.status, 'matched');
  assert.equal(result.id, 'w_gather');
  assert.equal(result.via, 'word+pos+meaning');
});

test('意味違いの同綴語を取り違えない', () => {
  const verb = mapReviewWord({ word: 'close', partOfSpeech: '動', meaning: '〜を閉じる', level: 2 }, index);
  const adjective = mapReviewWord({ word: 'close', partOfSpeech: '形', meaning: '接近した', level: 3 }, index);
  assert.equal(verb.id, 'w_close_v');
  assert.equal(adjective.id, 'w_close_a');
});

test('語しか手掛かりが無く候補が複数なら曖昧として保留する', () => {
  const result = mapReviewWord({ word: 'close', partOfSpeech: '', meaning: '', level: 9 }, index);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.candidates.length, 3);
});

test('語しか無くても候補が1件なら対応づく', () => {
  const result = mapReviewWord({ word: 'apple', partOfSpeech: '', meaning: 'リンゴ', level: 5 }, index);
  assert.equal(result.status, 'matched');
  assert.equal(result.via, 'word');
});

test('マスターに無い語は unmatched', () => {
  const result = mapReviewWord({ word: 'zzzz', partOfSpeech: '名', meaning: '謎', level: 1 }, index);
  assert.equal(result.status, 'unmatched');
});

test('語が空なら unmatched', () => {
  assert.equal(mapReviewWord({ word: '', level: 1 }, index).status, 'unmatched');
  assert.equal(mapReviewWord(null, index).status, 'unmatched');
});

test('大文字・空白の揺れを吸収する', () => {
  const result = mapReviewWord({ word: '  Apple ', partOfSpeech: '名', meaning: 'りんご', level: 1 }, index);
  assert.equal(result.id, 'w_apple');
});

test('mergeReviewDocs は最新・最早・最大を選ぶ', () => {
  const merged = mergeReviewDocs([
    {
      __oldId: 'osaka_word_1',
      lastReviewed: new Date('2026-07-01T00:00:00Z'),
      nextReviewDate: new Date('2026-08-20T00:00:00Z'),
      repetitions: 5,
      easeFactor: 2.1,
      interval: 10,
    },
    {
      __oldId: 'highschool_word_7',
      lastReviewed: new Date('2026-08-01T00:00:00Z'),
      nextReviewDate: new Date('2026-08-10T00:00:00Z'),
      repetitions: 2,
      easeFactor: 2.8,
      interval: 3,
    },
  ]);

  assert.equal(merged.lastReviewed, new Date('2026-08-01T00:00:00Z').getTime());
  assert.equal(merged.nextReviewDate, new Date('2026-08-10T00:00:00Z').getTime());
  assert.equal(merged.repetitions, 5);
  // easeFactor と interval は最も新しい履歴のものを採る
  assert.equal(merged.easeFactor, 2.8);
  assert.equal(merged.interval, 3);
  assert.deepEqual(merged.migratedFrom, ['osaka_word_1', 'highschool_word_7']);
});

test('mergeReviewDocs は Firestore Timestamp 風のオブジェクトも扱える', () => {
  const timestamp = (iso) => ({ toMillis: () => new Date(iso).getTime() });
  const merged = mergeReviewDocs([
    { __oldId: 'a', lastReviewed: timestamp('2026-07-01T00:00:00Z'), nextReviewDate: timestamp('2026-08-05T00:00:00Z'), repetitions: 1, easeFactor: 2.0 },
    { __oldId: 'b', lastReviewed: timestamp('2026-08-02T00:00:00Z'), nextReviewDate: timestamp('2026-08-09T00:00:00Z'), repetitions: 4, easeFactor: 2.6 },
  ]);
  assert.equal(merged.lastReviewed, new Date('2026-08-02T00:00:00Z').getTime());
  assert.equal(merged.nextReviewDate, new Date('2026-08-05T00:00:00Z').getTime());
  assert.equal(merged.repetitions, 4);
  assert.equal(merged.easeFactor, 2.6);
});

test('mergeReviewDocs は空配列で null', () => {
  assert.equal(mergeReviewDocs([]), null);
});

test('実際のマスターでも同綴語が別IDになっている', () => {
  const master = require('../../public/data/words-master.json');
  const real = buildIndex(master);

  const closeEntries = master.filter((entry) => entry.word.toLowerCase() === 'close');
  assert.ok(closeEntries.length >= 2, 'close は複数の品詞で収録されているはず');
  assert.equal(new Set(closeEntries.map((entry) => entry.id)).size, closeEntries.length);

  for (const entry of closeEntries) {
    const result = mapReviewWord(entry, real);
    assert.equal(result.status, 'matched');
    assert.equal(result.id, entry.id);
  }
});

test('マスター全件が自分自身へ一意に対応づく', () => {
  const master = require('../../public/data/words-master.json');
  const real = buildIndex(master);
  let mismatched = 0;
  for (const entry of master) {
    const result = mapReviewWord(entry, real);
    if (result.status !== 'matched' || result.id !== entry.id) mismatched += 1;
  }
  assert.equal(mismatched, 0);
});
