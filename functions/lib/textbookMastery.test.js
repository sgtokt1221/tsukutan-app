const fs = require('fs');
const path = require('path');
const { masteryByTextbook, bucketOf, LEARNING_DAYS, RETAINED_DAYS } = require('./textbookMastery');

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
  expect(m.counts).toEqual({ unlearned: 1, learning: 1, settling: 0, retained: 1, graduated: 0 });
});
