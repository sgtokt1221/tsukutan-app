/**
 * 単語帳4冊の例文の付け方（scripts/build-book-words.js）。2026-09-26。
 * 同じ綴りが複数あるときは本の訳に近い方から借りる。借りられない語は手で書いた例文を付ける。
 */
const { pickByMeaning, cardOf } = require('../../scripts/build-book-words');

const byWord = (list) => {
  const m = new Map();
  for (const w of list) {
    const k = w.word.toLowerCase();
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(w);
  }
  return m;
};

test('同じ意味で2件あるだけなら、訳の近い方から借りる（increase）', () => {
  const found = [
    { id: 'm1', word: 'increase', partOfSpeech: '動', meaning: '~を増やす、増える、増加する', example: 'A', exampleJa: 'あ' },
    { id: 'm2', word: 'increase', partOfSpeech: '動', meaning: '増える、〜を増やす', example: 'B', exampleJa: 'い' },
  ];
  expect(pickByMeaning(found, '増える、～を増やす').id).toBe('m2');
});

test('**品詞の違う候補が同じくらい近ければ決めない**（別の意味の例文を付けない）', () => {
  const found = [
    { id: 'v', word: 'close', partOfSpeech: '動', meaning: '閉じる' },
    { id: 'a', word: 'close', partOfSpeech: '形', meaning: '近い' },
  ];
  // 本の訳が両方の意味を並べていて、どちらも同じくらい近い
  expect(pickByMeaning(found, '近い、閉じる')).toBeNull();
  // 片方しか書いていなければ、その意味で決まる
  expect(pickByMeaning(found, '近い').id).toBe('a');
});

test('訳で選んだ語は、本のIDのまま・level を借りない（覚えた記録を切らない）', () => {
  const master = byWord([
    { id: 'm1', word: 'increase', partOfSpeech: '名', meaning: '増加', example: 'A', exampleJa: 'あ', level: 3 },
    { id: 'm2', word: 'increase', partOfSpeech: '動', meaning: '増える、～を増やす', example: 'B', exampleJa: 'い', level: 3 },
  ]);
  const card = cardOf('systan5', { no: 3, en: 'increase', ja: '増える、～を増やす' }, master);
  expect(card.id).toMatch(/^w_/);
  expect(card.id).not.toBe('m2');
  expect(card.example).toBe('B');
  expect(card.level).toBeUndefined();
});

test('どこにも無い語は、手で書いた例文を出所つきで付ける', () => {
  const card = cardOf('systan5', { no: 10, en: 'respond', ja: '反応する' }, new Map(),
    { 10: { example: 'He did not respond to my email.', exampleJa: '彼は私のメールに反応しなかった。' } });
  expect(card.example).toBe('He did not respond to my email.');
  expect(card.exampleSource).toBe('written');
  expect(card.level).toBeUndefined();
});
