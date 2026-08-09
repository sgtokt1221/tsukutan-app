import {
  MAX_NEW_WORDS_PER_DAY,
  computeNewWordsQuota,
  computeRemainingDays,
  dedupeAcross,
  splitIntoSessions,
  sortReviewCandidates,
} from './dailyPlanMath';
import { parseLocalDate } from './dateKeys';

describe('computeNewWordsQuota', () => {
  test('期限に余裕があれば希望語数を採る', () => {
    // 2,000語 / 365日 = 6語必要。希望20語のほうが多い
    expect(computeNewWordsQuota({ remainingWords: 2000, remainingDays: 365, preferredNewWords: 20 }))
      .toEqual({ preferredNewWords: 20, requiredNewWords: 6, plannedNewWords: 20, isFeasible: true });
  });

  test('期限が近ければ必要語数を採る', () => {
    // 900語 / 30日 = 30語必要。希望15語より多い
    expect(computeNewWordsQuota({ remainingWords: 900, remainingDays: 30, preferredNewWords: 15 }))
      .toEqual({ preferredNewWords: 15, requiredNewWords: 30, plannedNewWords: 30, isFeasible: true });
  });

  test('上限を超える必要語数は達成困難として頭打ちにする', () => {
    const result = computeNewWordsQuota({ remainingWords: 3000, remainingDays: 10, preferredNewWords: 20 });
    expect(result.requiredNewWords).toBe(300);
    expect(result.plannedNewWords).toBe(MAX_NEW_WORDS_PER_DAY);
    expect(result.isFeasible).toBe(false);
  });

  test('ちょうど上限なら達成可能', () => {
    const result = computeNewWordsQuota({ remainingWords: 60, remainingDays: 1, preferredNewWords: 20 });
    expect(result.requiredNewWords).toBe(60);
    expect(result.isFeasible).toBe(true);
  });

  test('目標語彙数に到達済みなら希望語数で続ける', () => {
    expect(computeNewWordsQuota({ remainingWords: 0, remainingDays: 100, preferredNewWords: 20 }))
      .toEqual({ preferredNewWords: 20, requiredNewWords: 0, plannedNewWords: 20, isFeasible: true });
  });

  test('残り日数0でも0で割らない', () => {
    const result = computeNewWordsQuota({ remainingWords: 50, remainingDays: 0, preferredNewWords: 20 });
    expect(result.requiredNewWords).toBe(50);
    expect(result.plannedNewWords).toBe(50);
  });

  test('引数なしでも壊れない', () => {
    expect(computeNewWordsQuota({})).toEqual({
      preferredNewWords: 0, requiredNewWords: 0, plannedNewWords: 0, isFeasible: true,
    });
  });

  test('負の値は0として扱う', () => {
    const result = computeNewWordsQuota({ remainingWords: -100, remainingDays: -5, preferredNewWords: -1 });
    expect(result).toEqual({ preferredNewWords: 0, requiredNewWords: 0, plannedNewWords: 0, isFeasible: true });
  });

  test('やる気レベルが上がると提案語数も上がる', () => {
    const base = { remainingWords: 2000, remainingDays: 365 };
    const low = computeNewWordsQuota({ ...base, preferredNewWords: 15 }).plannedNewWords;
    const normal = computeNewWordsQuota({ ...base, preferredNewWords: 20 }).plannedNewWords;
    const high = computeNewWordsQuota({ ...base, preferredNewWords: 30 }).plannedNewWords;
    expect([low, normal, high]).toEqual([15, 20, 30]);
  });
});

describe('computeRemainingDays', () => {
  const today = parseLocalDate('2026-08-09');

  test('目標日の1ヶ月前が締め切りになる', () => {
    // 2027-08-09 の1ヶ月前 = 2027-07-09
    expect(computeRemainingDays(today, parseLocalDate('2027-08-09'))).toBe(334);
  });

  test('1ヶ月前が過ぎていれば目標日そのものが締め切り', () => {
    // 2026-08-20 の1ヶ月前は 2026-07-20 で今日より前 → 目標日まで11日
    expect(computeRemainingDays(today, parseLocalDate('2026-08-20'))).toBe(11);
  });

  test('目標日が過去でも最低1日を返す', () => {
    expect(computeRemainingDays(today, parseLocalDate('2026-01-01'))).toBe(1);
  });

  test('目標日が無ければ null', () => {
    expect(computeRemainingDays(today, null)).toBeNull();
  });
});

describe('dedupeAcross', () => {
  test('先のリストを優先して後続から重複を除く', () => {
    const [a, b, c] = dedupeAcross(
      [{ id: 'w1' }, { id: 'w2' }],
      [{ id: 'w2' }, { id: 'w3' }],
      [{ id: 'w1' }, { id: 'w3' }, { id: 'w4' }]
    );
    expect(a.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(b.map((w) => w.id)).toEqual(['w3']);
    expect(c.map((w) => w.id)).toEqual(['w4']);
  });

  test('同一リスト内の重複も落とす', () => {
    const [only] = dedupeAcross([{ id: 'w1' }, { id: 'w1' }]);
    expect(only).toHaveLength(1);
  });

  test('IDが無い項目は落とす', () => {
    const [only] = dedupeAcross([{ id: 'w1' }, { word: 'no id' }, null]);
    expect(only.map((w) => w.id)).toEqual(['w1']);
  });

  test('空やundefinedを渡しても空配列を返す', () => {
    expect(dedupeAcross(undefined, [])).toEqual([[], []]);
  });
});

describe('splitIntoSessions', () => {
  const words = Array.from({ length: 75 }, (_, i) => ({ id: `w${i}` }));

  test('指定サイズで区切る', () => {
    const sessions = splitIntoSessions(words, 30);
    expect(sessions.map((s) => s.length)).toEqual([30, 30, 15]);
  });

  test('サイズ以下なら1セッション', () => {
    expect(splitIntoSessions(words.slice(0, 10), 30)).toHaveLength(1);
  });

  test('空なら0セッション', () => {
    expect(splitIntoSessions([], 30)).toEqual([]);
  });

  test('サイズ0でも無限ループしない', () => {
    expect(splitIntoSessions(words.slice(0, 3), 0)).toHaveLength(3);
  });
});

describe('sortReviewCandidates', () => {
  test('期日超過を必ず先に置く', () => {
    const sorted = sortReviewCandidates([
      { id: 'a', isOverdue: false, forgettingScore: 9 },
      { id: 'b', isOverdue: true, forgettingScore: 1 },
      { id: 'c', isOverdue: true, forgettingScore: 5 },
      { id: 'd', isOverdue: false, forgettingScore: 3 },
    ]);
    expect(sorted.map((w) => w.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  test('元の配列を壊さない', () => {
    const input = [{ id: 'a', isOverdue: false }, { id: 'b', isOverdue: true }];
    sortReviewCandidates(input);
    expect(input.map((w) => w.id)).toEqual(['a', 'b']);
  });
});
