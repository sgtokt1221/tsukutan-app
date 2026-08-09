const test = require('node:test');
const assert = require('node:assert');
const {
  isSingleWord,
  meaningsOverlap,
  choiceLengthsBalanced,
  canMakeCloze,
  blankExample,
  pickDistractors,
} = require('./assessmentItemBuilder');

test('意味が実質同じ誤答をはじく', () => {
  // 同レベル同品詞に普通に存在する組み合わせ
  assert.strictEqual(meaningsOverlap('を達成する；を成し遂げる', 'を成し遂げる'), true);
  assert.strictEqual(meaningsOverlap('を捨てる；を放棄する', 'を放棄する，断念する'), true);
  assert.strictEqual(meaningsOverlap('熱心な', '熱心な、しきりにしたがる'), true);
});

test('意味が違えば誤答として使える', () => {
  assert.strictEqual(meaningsOverlap('を達成する', '突然の'), false);
  assert.strictEqual(meaningsOverlap('チョコレート', 'ページ'), false);
});

test('意味が判定できないものは使わない', () => {
  assert.strictEqual(meaningsOverlap('', 'ページ'), true);
  assert.strictEqual(meaningsOverlap(null, undefined), true);
});

test('正解だけが極端に長い選択肢をはじく', () => {
  assert.strictEqual(choiceLengthsBalanced(['熱心な', '慎重な', '充分な', '必須の']), true);
  assert.strictEqual(choiceLengthsBalanced(['熱心でしきりにしたがるようす', '慎重', '充分', '必須']), false);
});

test('1語の見出しだけを空所補充に使う', () => {
  assert.strictEqual(isSingleWord('improvise'), true);
  assert.strictEqual(isSingleWord("one's own"), false);
  assert.strictEqual(isSingleWord("Why don't we ...?"), false);
  assert.strictEqual(isSingleWord('so-called'), true);
});

test('活用形しか出てこない例文は空所にしない', () => {
  // "A baby is crying." を cry で空所にすると "A baby is cry." になる
  assert.strictEqual(canMakeCloze({ word: 'cry', example: 'A baby is crying.' }), false);
  assert.strictEqual(canMakeCloze({ word: 'cry', example: 'I want to cry right now.' }), true);
});

test('句や断片は空所にしない', () => {
  // マスターには "a speech contest" のような句が混ざっている
  assert.strictEqual(canMakeCloze({ word: 'contest', example: 'a speech contest' }), false);
  assert.strictEqual(canMakeCloze({ word: 'contest', example: 'He won the contest.' }), true);
});

test('短すぎる例文は空所にしない', () => {
  assert.strictEqual(canMakeCloze({ word: 'run', example: 'I run.' }), false);
});

test('同じ語が2回出る例文は空所にしない', () => {
  assert.strictEqual(canMakeCloze({ word: 'time', example: 'Time after time, it works.' }), false);
});

test('空所は原形の1箇所だけを置き換える', () => {
  assert.strictEqual(
    blankExample({ word: 'contest', example: 'He won the contest.' }),
    'He won the ____.'
  );
});

test('誤答は同じ意味同士にならない', () => {
  const word = { word: 'achieve', meaning: 'を達成する', partOfSpeech: '動', level: 5 };
  const pool = [
    word,
    { word: 'accomplish', meaning: 'を成し遂げる', partOfSpeech: '動', level: 5 },
    { word: 'abandon', meaning: 'を捨てる', partOfSpeech: '動', level: 5 },
    { word: 'absorb', meaning: 'を吸収する', partOfSpeech: '動', level: 5 },
    { word: 'adjust', meaning: 'を調整する', partOfSpeech: '動', level: 5 },
  ];
  const picked = pickDistractors(word, pool, 0);
  assert.ok(picked, '誤答が3つ取れる');
  assert.strictEqual(picked.length, 3);
  for (const distractor of picked) {
    assert.strictEqual(meaningsOverlap(word.meaning, distractor.meaning), false);
  }
});

test('候補が足りなければ問題を作らない', () => {
  const word = { word: 'achieve', meaning: 'を達成する', partOfSpeech: '動', level: 5 };
  const pool = [word, { word: 'accomplish', meaning: 'を成し遂げる', partOfSpeech: '動', level: 5 }];
  assert.strictEqual(pickDistractors(word, pool, 0), null);
});

test('生成済みの問題バンクが壊れていない', () => {
  const bank = require('../../public/data/assessment-items.json');
  assert.ok(bank.items.length > 500, `問題数が少なすぎる: ${bank.items.length}`);

  const ids = new Set();
  for (const item of bank.items) {
    assert.match(item.itemId, /^ai_[0-9a-f]{16}$/);
    assert.ok(!ids.has(item.itemId), `itemId が重複: ${item.itemId}`);
    ids.add(item.itemId);

    assert.strictEqual(item.choices.length, 4, `選択肢が4つでない: ${item.word}`);
    assert.ok(item.correctChoice >= 0 && item.correctChoice < 4);
    assert.strictEqual(new Set(item.choices).size, 4, `選択肢が重複: ${item.word}`);
    assert.ok(['vocabulary', 'context'].includes(item.domain));
    // SS は問題バンクが無いので作らない
    assert.notStrictEqual(item.targetRank, 'SS');
  }
});

test('正解の位置が4つに散っている', () => {
  const bank = require('../../public/data/assessment-items.json');
  const counts = [0, 0, 0, 0];
  bank.items.forEach((item) => { counts[item.correctChoice] += 1; });
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  // 極端に偏っていないこと（読まずに位置で当てられないように）
  assert.ok(max / min < 1.5, `正解位置が偏っている: ${counts.join(',')}`);
});

test('空所補充の選択肢はすべて1語', () => {
  const bank = require('../../public/data/assessment-items.json');
  for (const item of bank.items.filter((i) => i.domain === 'context')) {
    for (const choice of item.choices) {
      assert.ok(isSingleWord(choice), `1語でない選択肢: ${choice} (${item.word})`);
    }
    assert.ok(item.sentence.includes('____'), `空所が無い: ${item.word}`);
  }
});
