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

describe('自分で始めるテスト（2026-09-27）', () => {
  const { buildSelfTest, SELF_TEST_MAX } = require('./assignedQuiz');
  const words = Array.from({ length: 50 }, (_, i) => ({ id: `w${i}`, word: `w${i}`, meaning: `意味${i}` }));

  test('範囲から最大20問を混ぜて出し、先生の小テストと見分けられる', () => {
    const quiz = buildSelfTest({ title: 'LEAP 1〜100', words, pool: words }, () => 0.3, 123);
    expect(quiz.words).toHaveLength(SELF_TEST_MAX);
    expect(quiz.id).toBe('self_123');
    expect(quiz.selfTest).toBe(true);
    expect(quiz.pool).toBe(words);
    expect(new Set(quiz.words.map((w) => w.id)).size).toBe(SELF_TEST_MAX);
  });

  test('意味の無い語は出さない（4択が組めない）', () => {
    const quiz = buildSelfTest({ title: 't', words: [{ id: 'a', word: 'a', meaning: '' }, { id: 'b', word: 'b', meaning: 'び' }] });
    expect(quiz.words.map((w) => w.id)).toEqual(['b']);
  });
});
