import { retentionBreakdown } from './retentionBreakdown';

const countOf = (result, id) => result.buckets.find((b) => b.id === id).count;

describe('retentionBreakdown', () => {
  test('間隔で3つに分ける', () => {
    const result = retentionBreakdown([
      { interval: 0 }, { interval: 1 }, { interval: 6 },
      { interval: 7 }, { interval: 20 },
      { interval: 21 }, { interval: 365 },
    ]);

    expect(countOf(result, 'learning')).toBe(3);
    expect(countOf(result, 'settling')).toBe(2);
    expect(countOf(result, 'retained')).toBe(2);
    expect(result.total).toBe(7);
  });

  test('卒業した語は間隔によらず卒業として数える', () => {
    const result = retentionBreakdown([{ interval: 1, status: 'mastered' }]);
    expect(countOf(result, 'graduated')).toBe(1);
    expect(countOf(result, 'learning')).toBe(0);
  });

  test('移行前の古い文書は数えない', () => {
    // 新旧が二重に入っているので、数えると語数が倍になる
    const result = retentionBreakdown([
      { interval: 1, migratedTo: 'w_new' },
      { interval: 1 },
    ]);
    expect(result.total).toBe(1);
  });

  test('間隔が無い語は覚えかけに入れる', () => {
    const result = retentionBreakdown([{}, { interval: null }]);
    expect(countOf(result, 'learning')).toBe(2);
  });

  test('1語も無ければ割合は0で、0除算にならない', () => {
    const result = retentionBreakdown([]);
    expect(result.total).toBe(0);
    expect(result.buckets.every((b) => b.percent === 0)).toBe(true);
  });
});
