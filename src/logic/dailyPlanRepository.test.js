import { PLAN_VERSION, isStoredPlanUsable, planSignature, remainingWords } from './dailyPlanRepository';

const user = {
  level: 4,
  goal: {
    targets: [{ goalId: 'eiken_2' }, { goalId: 'hs_60' }],
    targetDate: '2026-09-01',
    motivationLevel: 'normal',
  },
};

describe('planSignature', () => {
  test('同じ設定なら同じ署名', () => {
    expect(planSignature(user)).toBe(planSignature({ ...user }));
  });

  test('目標の並び順が違っても同じ署名', () => {
    const reordered = { ...user, goal: { ...user.goal, targets: [{ goalId: 'hs_60' }, { goalId: 'eiken_2' }] } };
    expect(planSignature(reordered)).toBe(planSignature(user));
  });

  test.each([
    ['達成日', { goal: { ...user.goal, targetDate: '2026-10-01' } }],
    ['やる気', { goal: { ...user.goal, motivationLevel: 'high' } }],
    ['目標', { goal: { ...user.goal, targets: [{ goalId: 'eiken_3' }] } }],
    ['レベル', { level: 5 }],
  ])('%s が変わると署名も変わる', (_label, patch) => {
    expect(planSignature({ ...user, ...patch })).not.toBe(planSignature(user));
  });

  test('設定が空でも落ちない', () => {
    expect(typeof planSignature(undefined)).toBe('string');
    expect(typeof planSignature({})).toBe('string');
  });
});

describe('isStoredPlanUsable', () => {
  const signature = planSignature(user);
  const stored = { planVersion: PLAN_VERSION, signature, newWords: [] };

  test('版と署名が一致すれば使える', () => {
    expect(isStoredPlanUsable(stored, signature)).toBe(true);
  });

  test('版が違えば作り直す', () => {
    expect(isStoredPlanUsable({ ...stored, planVersion: PLAN_VERSION + 1 }, signature)).toBe(false);
  });

  test('設定が変わっていれば作り直す', () => {
    expect(isStoredPlanUsable(stored, 'ちがう署名')).toBe(false);
  });

  test('newWords が壊れていれば作り直す', () => {
    expect(isStoredPlanUsable({ ...stored, newWords: undefined }, signature)).toBe(false);
  });

  test('保存が無ければ作り直す', () => {
    expect(isStoredPlanUsable(null, signature)).toBe(false);
  });
});

describe('remainingWords', () => {
  const words = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  test('回答済みを除く', () => {
    expect(remainingWords(words, ['b'])).toEqual([{ id: 'a' }, { id: 'c' }]);
  });

  test('並び順は保存時のまま', () => {
    expect(remainingWords(words, []).map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });

  test('全部答えていれば空', () => {
    expect(remainingWords(words, ['a', 'b', 'c'])).toEqual([]);
  });

  test('引数が無くても落ちない', () => {
    expect(remainingWords()).toEqual([]);
    expect(remainingWords(words)).toEqual(words);
  });
});
