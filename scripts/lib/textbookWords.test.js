const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTextbookCards, baseCandidates } = require('./textbookWords');

const m = (id, word, level, pos = '名', meaning = `${word}の意味`) => ({ id, word, level, partOfSpeech: pos, meaning, example: `ex ${word}` });
const row = (word, page = 10, grade = 1, order = 1) => ({ word, page, grade, order });

test('つづりが1件なら単語データの id と意味。例文やレベルも借りる', () => {
  const { cards } = buildTextbookCards([row('apple')], [m('w_a', 'apple', 1)], []);
  assert.deepEqual(cards[0], { word: 'apple', grade: 1, page: 10, order: 1, partOfSpeech: '名', id: 'w_a', meaning: 'appleの意味', level: 1, example: 'ex apple' });
});

test('複数あればいちばんレベルの低い意味', () => {
  const master = [m('w_hard', 'last', 6, '動', '続く'), m('w_easy', 'last', 2, '形', '最後の')];
  const { cards } = buildTextbookCards([row('last')], master, []);
  assert.equal(cards[0].id, 'w_easy');
});

test('**人名・地名（大文字で始まり単語データに無い）は外す**。I や Japan のように単語データにあれば残す', () => {
  const { cards, skipped } = buildTextbookCards([row('Bob'), row('Japan')], [m('w_j', 'Japan', 1)], []);
  assert.deepEqual(cards.map((c) => c.word), ['Japan']);
  assert.equal(skipped[0].reason, 'proper-noun');
});

test('不規則な活用形は原形の意味に「変化形」と添え、別の id・level なし', () => {
  const { cards } = buildTextbookCards([row('ate')], [m('w_eat', 'eat', 1, '動', '食べる')], []);
  assert.equal(cards[0].meaning, '（eat の変化形）食べる');
  assert.notEqual(cards[0].id, 'w_eat');
  assert.equal(cards[0].level, undefined);
});

test('**語を作る接尾辞では削らない**（kindly→kind「種類」、butter→but を出さない）', () => {
  assert.deepEqual(baseCandidates('kindly'), []);
  assert.deepEqual(baseCandidates('butter'), []);
  const { cards } = buildTextbookCards([row('news')], [m('w_new', 'new', 1, '形', '新しい')], []);
  assert.equal(cards.length, 0); // -s を削っても、原形が名詞・動詞でなければ当てない
});

test('単語帳につづりが1件ならその語。どれにも無ければ外す', () => {
  const { cards, skipped } = buildTextbookCards([row('xylophone'), row('niece')], [], [{ id: 'b_x', word: 'xylophone', meaning: '木琴', no: 5 }]);
  assert.deepEqual(cards.map((c) => [c.id, c.meaning]), [['b_x', '木琴']]);
  assert.equal(skipped[0].reason, 'no-meaning');
});

test('同じ学年で同じ語は先のページだけ。別の学年なら両方', () => {
  const master = [m('w_a', 'apple', 1)];
  const { cards } = buildTextbookCards([row('apple', 10, 1), row('apple', 20, 1), row('apple', 5, 2)], master, []);
  assert.deepEqual(cards.map((c) => [c.grade, c.page]), [[1, 10], [2, 5]]);
});
