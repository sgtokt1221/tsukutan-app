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

describe('目標までの内訳（2026-09-26）', () => {
  // eslint-disable-next-line global-require
  const { retentionBreakdown: rb, retentionTowardGoal } = require('./retentionBreakdown');
  const learned = rb([{ interval: 1 }, { interval: 10 }, { interval: 30 }, { status: 'mastered' }]); // 4語

  test('分母は目標の語数。習った語・テストで分かっている・まだ に分ける', () => {
    const g = retentionTowardGoal(learned, { target: 100, reached: 30 });
    const count = Object.fromEntries(g.buckets.map((b) => [b.id, b.count]));
    expect(g.total).toBe(100);
    expect(count.known).toBe(26); // 到達30のうち、習った4語は習った側で数える
    expect(count.notYet).toBe(70);
    expect(g.buckets.reduce((s, b) => s + b.count, 0)).toBe(100);
  });

  test('**習った語が0でも、はじめから全体を出す**', () => {
    const g = retentionTowardGoal(rb([]), { target: 5100, reached: 0 });
    expect(g.total).toBe(5100);
    expect(g.buckets.find((b) => b.id === 'notYet').count).toBe(5100);
  });

  test('目標を超えたら、分母はその合計（はみ出さない）', () => {
    const g = retentionTowardGoal(learned, { target: 10, reached: 50 });
    expect(g.total).toBe(50);
    expect(g.buckets.find((b) => b.id === 'notYet').count).toBe(0);
  });

  test('目標が無ければ今までどおり（習った語だけ）', () => {
    expect(retentionTowardGoal(learned, {})).toBe(learned);
  });
});
