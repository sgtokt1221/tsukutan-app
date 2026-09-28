const fs = require('fs');
const path = require('path');
const { masteryByTextbook, bucketOf, easiestEiken, LEARNING_DAYS, RETAINED_DAYS } = require('./textbookMastery');

test('段階は間隔で分ける。外した語は卒業', () => {
  expect(bucketOf({ interval: 1 })).toBe('learning');
  expect(bucketOf({ interval: 7 })).toBe('settling');
  expect(bucketOf({ interval: 21 })).toBe('retained');
  expect(bucketOf({ interval: 1, status: 'mastered' })).toBe('graduated');
});

test('**境目は生徒の画面（retentionBreakdown.js）と同じ**', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/logic/retentionBreakdown.js'), 'utf8');
  expect(src).toContain(`interval < ${LEARNING_DAYS}`);
  expect(src).toContain(`interval < ${RETAINED_DAYS}`);
});

test('教材ごとに数える。id で引けなければ中身で引く（Firestore の id の記録）。移した古い記録は数えない', () => {
  const words = [
    { id: 'a', word: 'apple', partOfSpeech: '名', meaning: 'りんご' },
    { id: 'b', word: 'look after', partOfSpeech: '熟語', meaning: '世話をする' },
    { id: 'c', word: 'cat', partOfSpeech: '名', meaning: 'ねこ' },
    { id: 'a', word: 'apple', partOfSpeech: '名', meaning: 'りんご' },
  ];
  const docs = [
    { id: 'a', data: { interval: 30 } },
    { id: 'RandomFs', data: { word: 'Look after', partOfSpeech: '熟', meaning: '世話をする', interval: 2 } },
    { id: 'old', data: { word: 'cat', partOfSpeech: '名', meaning: 'ねこ', interval: 30, migratedTo: 'c' } },
  ];
  const [m] = masteryByTextbook(docs, [{ id: 't', title: 'T', words }]);
  expect(m.total).toBe(3);
  expect(m.counts).toEqual({ unlearned: 1, known: 0, learning: 1, settling: 0, retained: 1, graduated: 0 });
});

test('英検の級は、いちばんやさしい級1つにだけ入る（数値と文字列が混ざっていても）', () => {
  expect(easiestEiken({ eikenLevels: [3, 4] })).toBe('4');
  expect(easiestEiken({ eikenLevels: ['pre1', 2] })).toBe('2');
  expect(easiestEiken({ eikenLevels: ['pre2'] })).toBe('pre2');
  expect(easiestEiken({})).toBeNull();
  expect(easiestEiken({ eikenLevels: ['x'] })).toBeNull();
});

test('英検の級の束は、本物の単語帳で空にならない', () => {
  const words = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/data/words-master.json'), 'utf8'));
  for (const g of ['5', '4', '3', 'pre2', '2', 'pre1']) {
    expect(words.filter((w) => easiestEiken(w) === g).length).toBeGreaterThan(100);
  }
});

describe('テストで分かっている（推定）（2026-09-27）', () => {
  const book = [{ id: 'bk', title: 'b', words: [
    { id: 'a', word: 'apple', level: 1 }, { id: 'b', word: 'bank', level: 1 },
    { id: 'c', word: 'curious', level: 7 }, { id: 'd', word: 'dog' },
  ] }];
  test('力が高ければ、学んでいないやさしい語を「知っていそう」に数える', () => {
    const [m] = masteryByTextbook([], book, { ability: 6, levelBySpelling: new Map([['dog', 1]]) });
    expect(m.counts.known).toBe(3); // apple・bank・dog はほぼ確実、curious は半分以下
    expect(m.counts.unlearned).toBe(1);
    expect(m.estimated).toBe(true);
  });
  test('テストを受けていなければ見積もらない', () => {
    const [m] = masteryByTextbook([], book);
    expect(m.counts.known).toBe(0);
    expect(m.counts.unlearned).toBe(4);
  });
});
