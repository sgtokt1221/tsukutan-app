import { buildChoices, promptOf, answerOf } from './assignedQuiz';

jest.mock('../firebaseConfig', () => ({ db: {} }));

const w = (word, meaning) => ({ id: word, word, meaning });
const seq = () => { let i = 0; return () => ((i += 0.37) % 1); };

test('4択は正解を含み、重ならない。ひっかけは同じ小テストの語から', () => {
  const quiz = [w('apple', 'りんご'), w('bread', 'パン'), w('cat', 'ねこ'), w('dog', 'いぬ')];
  const choices = buildChoices(quiz[0], quiz, [], 'en-ja', seq());
  expect(choices).toHaveLength(4);
  expect(choices).toContain('りんご');
  expect(new Set(choices).size).toBe(4);
});

test('**正解と同じ文字の選択肢は出さない**。足りなければ教科書の語から補う', () => {
  const quiz = [w('big', '大きい'), w('large', '大きい')];
  const choices = buildChoices(quiz[0], quiz, [w('small', '小さい'), w('red', '赤い'), w('blue', '青い')], 'en-ja', seq());
  expect(choices.filter((c) => c === '大きい')).toHaveLength(1);
  expect(choices).toHaveLength(4);
});

test('和→英は意味を見せて語を選ぶ', () => {
  expect(promptOf(w('apple', 'りんご'), 'ja-en')).toBe('りんご');
  expect(answerOf(w('apple', 'りんご'), 'ja-en')).toBe('apple');
  expect(buildChoices(w('apple', 'りんご'), [w('apple', 'りんご'), w('pen', 'ペン')], [], 'ja-en', seq()).sort()).toEqual(['apple', 'pen']);
});
