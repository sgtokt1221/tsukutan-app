const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hsMap, osakaMap, easiestEiken, levelFor, alignGroups, relevelAll, buildOriginIndex, lookupOrigin,
} = require('./relevel');

test('英検の級 → レベル（いちばんやさしい級で決める）', () => {
  assert.equal(levelFor({ eikenLevels: [5] }).level, 1);
  assert.equal(levelFor({ eikenLevels: [4, 3] }).level, 2);
  assert.equal(levelFor({ eikenLevels: [3] }).level, 3);
  assert.equal(levelFor({ eikenLevels: ['pre2', 2] }).level, 4);
  assert.equal(levelFor({ eikenLevels: [2] }).level, 5);
});

test('英検の値は数値と文字列が混ざっていても読める', () => {
  assert.equal(easiestEiken({ eikenLevels: ['pre1', 2, 'pre2'] }), 'pre2');
  assert.equal(easiestEiken({ eikenLevels: [] }), null);
  assert.equal(easiestEiken({}), null);
});

test('準1級は、高校英語の元レベルで6と7に分ける', () => {
  assert.equal(levelFor({ eikenLevels: ['pre1'] }, { origHs: 8 }).level, 6);
  assert.equal(levelFor({ eikenLevels: ['pre1'] }, { origHs: 9 }).level, 7);
  assert.equal(levelFor({ eikenLevels: ['pre1'] }).level, 7);
  // 大阪府だけの語は準1級から6。ただ大阪府の元レベルは最大4なので必ず2以上ずれ、平均の5になる
  assert.deepEqual(levelFor({ eikenLevels: ['pre1'] }, { origOsaka: 7 }), { level: 5, basis: 'eiken+origin' });
});

test('英検の値が無い語は元レベルから。両方の教材にあれば低い方', () => {
  assert.equal(levelFor({}, { origHs: 2 }).level, 3);
  assert.equal(levelFor({}, { origHs: 9 }).level, 7);
  assert.equal(levelFor({}, { origOsaka: 1 }).level, 1);
  assert.equal(levelFor({}, { origOsaka: 8 }).level, 4);
  assert.equal(levelFor({}, { origHs: 9, origOsaka: 3 }).level, 2);
  assert.deepEqual([1, 3, 4, 5, 7, 8, 10].map(hsMap), [3, 3, 4, 5, 5, 6, 7]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 10].map(osakaMap), [1, 1, 2, 2, 3, 3, 4, 4]);
});

test('**英検と元レベルが2以上ずれたら平均**（どちらにも誤りがある）', () => {
  // 英検3級（→3）だが元レベルは高校9（→7）：pursue のような語
  const r = levelFor({ eikenLevels: [3] }, { origHs: 9 });
  assert.equal(r.level, 5);
  assert.equal(r.basis, 'eiken+origin');
  // 1ずれなら英検のまま
  assert.equal(levelFor({ eikenLevels: [3] }, { origHs: 4 }).level, 3);
});

test('根拠の無い語は今のレベルのまま', () => {
  assert.deepEqual(levelFor({ level: 4 }), { level: 4, basis: 'keep' });
});

test('**同じつづり＋品詞の組は揃える**（英検で決まった語の最小）', () => {
  const e = (id, word, pos) => ({ id, word, partOfSpeech: pos });
  const aligned = alignGroups([
    { entry: e('a', 'favorite', '形'), level: 3, basis: 'eiken' },
    { entry: e('b', 'Favorite ', '形'), level: 6, basis: 'origin' },
    { entry: e('c', 'favorite', '名'), level: 5, basis: 'origin' },
  ]);
  assert.equal(aligned.get('a'), 3);
  assert.equal(aligned.get('b'), 3);
  assert.equal(aligned.get('c'), 5); // 品詞が違えば別の組
});

test('元の教材は 語＋品詞＋意味 → 語＋品詞 → 語 の順に引き、複数なら一番やさしい', () => {
  const ix = buildOriginIndex([
    { word: 'run', partOfSpeech: '動', meaning: '走る', level: 3 },
    { word: 'run', partOfSpeech: '動', meaning: '経営する', level: 6 },
    { word: 'run', partOfSpeech: '名', meaning: '走ること', level: 5 },
  ]);
  assert.equal(lookupOrigin(ix, { word: 'run', partOfSpeech: '動', meaning: '経営する' }), 6);
  assert.equal(lookupOrigin(ix, { word: 'run', partOfSpeech: '動', meaning: '別の意味' }), 3);
  assert.equal(lookupOrigin(ix, { word: 'Run', partOfSpeech: '副', meaning: 'x' }), 3);
  assert.equal(lookupOrigin(ix, { word: 'walk', partOfSpeech: '動', meaning: 'x' }), null);
});

test('**id は変えない**。教材に所属していない語は元レベルを見ない', () => {
  const master = [
    { id: 'x1', word: 'apple', partOfSpeech: '名', meaning: 'りんご', level: 6, eikenLevels: [5] },
    { id: 'x2', word: 'curtail', partOfSpeech: '動', meaning: '削減する', level: 5 },
  ];
  const out = relevelAll({
    master,
    highschoolIds: new Set(['x2']),
    osakaIds: new Set(),
    highschoolOrigin: [{ word: 'curtail', partOfSpeech: '動', meaning: '削減する', level: 10 }],
    osakaOrigin: [{ word: 'curtail', partOfSpeech: '動', meaning: '削減する', level: 1 }],
  });
  assert.deepEqual([...out.keys()], ['x1', 'x2']);
  assert.equal(out.get('x1').level, 1);
  assert.equal(out.get('x2').level, 7); // 大阪府には所属していないので大阪の元レベル1は見ない
});
