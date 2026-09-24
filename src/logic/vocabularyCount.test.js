import {
  achievementPercentage,
  assessedWordCount,
  levelLookup,
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

  const levelOf = levelLookup([...master, { id: 'e', level: 7 }, { id: 'f', level: 7 }]);

  test('判定レベルより上の復習完了だけ数える', () => {
    expect(masteredBeyondAssessment(reviewWords, 5, levelOf)).toBe(1);
  });

  test('判定レベル以下はすでに含まれているので数えない', () => {
    expect(masteredBeyondAssessment(reviewWords, 7, levelOf)).toBe(0);
  });

  test('復習完了していない語は数えない', () => {
    expect(masteredBeyondAssessment([{ id: 'e', level: 7 }], 5, levelOf)).toBe(0);
  });

  test('移行済みの旧文書は数えない', () => {
    expect(masteredBeyondAssessment([{ id: 'f', level: 7, status: 'mastered', migratedTo: 'x' }], 5, levelOf)).toBe(0);
  });

  /*
    **レベルは単語データから引く**（2026-09-24）。復習データの写しのレベルは覚えた時点のままで、
    単語データのレベルを付け直しても追いかけない。
  */
  test('**写しのレベルが古くても、単語データのレベルで数える**', () => {
    // 写しでは7だが、単語データでは1（判定範囲内）→ 数えない
    expect(masteredBeyondAssessment([{ id: 'a', level: 7, status: 'mastered' }], 5, levelOf)).toBe(0);
    // 写しでは1だが、単語データでは7（範囲外）→ 数える
    expect(masteredBeyondAssessment([{ id: 'd', level: 1, status: 'mastered' }], 5, levelOf)).toBe(1);
  });

  test('単語データに無い id は数えない（レベルが分からない）', () => {
    expect(masteredBeyondAssessment([{ id: 'zzz', level: 7, status: 'mastered' }], 5, levelOf)).toBe(0);
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

describe('levelLookup：古い Firestore の id で入っている語', () => {
  const data = [{ id: 'w_x', word: 'look after', partOfSpeech: '熟語', meaning: '世話をする', level: 3 }];

  test('**id で引けなければ 語＋品詞＋意味 で引く**（日々の新しい単語は Firestore の文書IDで入っている）', () => {
    const levelOf = levelLookup(data);
    expect(levelOf({ id: 'RandomFsId', word: 'Look after', partOfSpeech: '熟', meaning: '世話をする', level: 9 })).toBe(3);
  });

  test('中身も合わなければ数えない', () => {
    expect(levelLookup(data)({ id: 'RandomFsId', word: 'look after', partOfSpeech: '熟語', meaning: '別の意味' })).toBeNull();
  });
});
