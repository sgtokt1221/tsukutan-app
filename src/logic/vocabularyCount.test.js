import {
  achievementPercentage,
  assessedWordCount,
  masteredBeyondAssessment,
  reachedWordCount,
} from './vocabularyCount';

const master = [
  { id: 'a', word: 'a', level: 1 },
  { id: 'b', word: 'b', level: 2 },
  { id: 'c', word: 'c', level: 5 },
  { id: 'd', word: 'd', level: 7 },
];

describe('assessedWordCount', () => {
  test('判定レベル以下の語だけ数える', () => {
    expect(assessedWordCount(master, 2)).toBe(2);
    expect(assessedWordCount(master, 5)).toBe(3);
    expect(assessedWordCount(master, 7)).toBe(4);
  });

  test('未測定は0語', () => {
    expect(assessedWordCount(master, 0)).toBe(0);
    expect(assessedWordCount(master, undefined)).toBe(0);
  });
});

describe('masteredBeyondAssessment', () => {
  const reviewWords = [
    { id: 'a', level: 1, status: 'mastered' },   // 判定範囲内
    { id: 'd', level: 7, status: 'mastered' },   // 範囲外
    { id: 'e', level: 7, status: undefined },    // まだ復習中
    { id: 'f', level: 7, status: 'mastered', migratedTo: 'x' }, // 旧文書
  ];

  test('判定レベルより上の復習完了だけ数える', () => {
    expect(masteredBeyondAssessment(reviewWords, 5)).toBe(1);
  });

  test('判定レベル以下はすでに含まれているので数えない', () => {
    expect(masteredBeyondAssessment(reviewWords, 7)).toBe(0);
  });

  test('復習完了していない語は数えない', () => {
    expect(masteredBeyondAssessment([{ id: 'e', level: 7 }], 5)).toBe(0);
  });

  test('移行済みの旧文書は数えない', () => {
    expect(masteredBeyondAssessment([{ id: 'f', level: 7, status: 'mastered', migratedTo: 'x' }], 5)).toBe(0);
  });
});

describe('reachedWordCount', () => {
  test('足し算ではなく和集合になる', () => {
    // 判定レベル5（3語）＋ 範囲外の復習完了1語 = 4語。
    // 以前は「判定で4語 + 学習で加算」を足して収録語数を超えていた。
    const result = reachedWordCount({
      master,
      reviewWords: [{ id: 'a', level: 1, status: 'mastered' }, { id: 'd', level: 7, status: 'mastered' }],
      assessedLevel: 5,
    });
    expect(result).toEqual({ assessed: 3, masteredBeyond: 1, total: 4 });
  });

  test('収録語数を超えない', () => {
    const result = reachedWordCount({
      master,
      reviewWords: master.map((w) => ({ ...w, status: 'mastered' })),
      assessedLevel: 7,
    });
    expect(result.total).toBeLessThanOrEqual(master.length);
  });

  test('未測定でも復習完了ぶんは数える', () => {
    const result = reachedWordCount({
      master,
      reviewWords: [{ id: 'a', level: 1, status: 'mastered' }],
      assessedLevel: 0,
    });
    expect(result.total).toBe(1);
  });
});

describe('achievementPercentage', () => {
  test('100%を超えない', () => {
    expect(achievementPercentage(9000, 7000)).toBe(100);
  });

  test('目標が無ければ0%', () => {
    expect(achievementPercentage(100, 0)).toBe(0);
  });

  test('割合を四捨五入する', () => {
    expect(achievementPercentage(3500, 7000)).toBe(50);
  });
});
