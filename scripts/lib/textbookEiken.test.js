const test = require('node:test');
const assert = require('node:assert/strict');
const { textbookEikenChanges, spellingKey } = require('./textbookEiken');

const e = (id, word, eikenLevels) => ({ id, word, eikenLevels });

test('小学校・中1 → 5級、中2 → 4級、中3 → 3級。準2級より上の印は残す', () => {
  const master = [e('a', 'but', [4]), e('b', 'arrive', [3, 'pre2']), e('c', 'achieve', ['pre2', 2]), e('d', 'actor', undefined)];
  const out = textbookEikenChanges(master, [
    { word: 'but', grade: 0 }, { word: 'arrive', grade: 2 }, { word: 'achieve', grade: 3 }, { word: 'actor', grade: 1 },
  ]);
  assert.deepEqual(out.get('a'), [5]);
  assert.deepEqual(out.get('b'), [4, 'pre2']);
  assert.deepEqual(out.get('c'), [3, 'pre2', 2]);
  assert.deepEqual(out.get('d'), [5]);
});

test('**教科書は級をやさしくする方向にだけ使う**（easy が中2で初出でも5級のまま）', () => {
  const out = textbookEikenChanges([e('a', 'easy', [5, 4])], [{ word: 'easy', grade: 2 }]);
  assert.equal(out.size, 0);
});

test('**大文字で始まる教科書の語（人名）は小文字の語に当てない**', () => {
  const master = [e('a', 'mark', ['pre2']), e('b', 'Japan', undefined)];
  const out = textbookEikenChanges(master, [{ word: 'Mark', grade: 1 }, { word: 'Japan', grade: 0 }]);
  assert.equal(out.has('a'), false);
  assert.deepEqual(out.get('b'), [5]);
});

test('同じつづりの語は、いちばんやさしい印の行にだけ当てる', () => {
  const master = [e('a', 'minute', [3]), e('b', 'minute', ['pre1'])];
  const out = textbookEikenChanges(master, [{ word: 'minute', grade: 1 }]);
  assert.deepEqual(out.get('a'), [5]);
  assert.equal(out.has('b'), false);
});

test('つづりの揺れ（～・大文字小文字・空白）はそろえる', () => {
  assert.equal(spellingKey('be from ～'), 'be from');
  assert.equal(spellingKey('  I’m  sorry. '), "i'm sorry.");
});

test('何度流しても同じ（書き換えたあとにもう一度流すと変わる行が無い）', () => {
  const master = [e('a', 'but', [4]), e('b', 'last', [3, 4]), e('c', 'last', [3, 4])];
  const words = [{ word: 'but', grade: 0 }, { word: 'last', grade: 1 }];
  const first = textbookEikenChanges(master, words);
  const applied = master.map((w) => (first.has(w.id) ? { ...w, eikenLevels: first.get(w.id) } : w));
  assert.equal(textbookEikenChanges(applied, words).size, 0);
});
