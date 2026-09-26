import { estimateAbility, expectedVocabulary, isAmbiguous, levelOfAbility, knowProbability } from './abilityEstimate';

const answers = (level, correct, total) => Array.from({ length: total }, (_, i) => ({ wordLevel: level, isCorrect: i < correct }));

describe('力の推定', () => {
  test('半分わかるレベルのあたりに力が来る', () => {
    const { theta } = estimateAbility([...answers(3, 9, 10), ...answers(4, 5, 10), ...answers(5, 1, 10)]);
    expect(theta).toBeGreaterThan(3.5);
    expect(theta).toBeLessThan(4.5);
  });

  test('答えが増えるほど確か（標準誤差が小さい）', () => {
    const few = estimateAbility(answers(4, 5, 10));
    const many = estimateAbility(answers(4, 25, 50));
    expect(many.se).toBeLessThan(few.se);
  });

  test('全問正解でも無限に飛ばない', () => {
    const { theta } = estimateAbility(answers(7, 30, 30));
    expect(Number.isFinite(theta)).toBe(true);
    expect(levelOfAbility(theta)).toBe(7);
  });

  test('2つのレベルの境目なら「割れた」', () => {
    expect(isAmbiguous({ theta: 3.5, se: 0.2 })).toBe(true);
    expect(isAmbiguous({ theta: 4.0, se: 0.2 })).toBe(false);
  });
});

describe('推定語彙数（各語 × 知っていそうな割合）', () => {
  test('**判定レベル以下を全部知っている、とは数えない**', () => {
    const words = [{ id: 'a', level: 2 }, { id: 'b', level: 4 }, { id: 'c', level: 6 }];
    const n = expectedVocabulary(words, 4);
    expect(n).toBe(Math.round(knowProbability(2, 4) + knowProbability(4, 4) + knowProbability(6, 4)));
  });

  test('同じIDは1語', () => {
    expect(expectedVocabulary([{ id: 'a', level: 1 }, { id: 'a', level: 1 }], 7)).toBe(1);
  });

  test('実際の単語データ：力が上がるほど増え、全語数を超えない', () => {
    // eslint-disable-next-line global-require
    const master = require('../../public/data/words-master.json');
    const counts = [1, 2, 3, 4, 5, 6, 7].map((t) => expectedVocabulary(master, t));
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[6]).toBeLessThan(master.length);
  });
});
