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

  /* **教材を署名に入れないと、変えてもその日は古い教材のまま**（翌日まで効かない） */
  test('新しい単語の教材が変わると署名も変わる', () => {
    const withBook = { ...user, goal: { ...user.goal, newWordTextbook: 'book-leap' } };
    const withOther = { ...user, goal: { ...user.goal, newWordTextbook: 'eiken-3' } };
    expect(planSignature(withBook)).not.toBe(planSignature(user));
    expect(planSignature(withBook)).not.toBe(planSignature(withOther));
  });

  /* おまかせの生徒まで、今日の計画が作り直しにならないように */
  test('おまかせ（null・未設定）は教材を足す前と同じ署名', () => {
    const auto = { ...user, goal: { ...user.goal, newWordTextbook: null } };
    expect(planSignature(auto)).toBe(planSignature(user));
    expect(planSignature(user)).toBe('eiken_2,hs_60|2026-09-01|normal|4');
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

/*
  保存中の計画を読む・書き足す処理は、保存の完了を待つ（2026-10-31）。
  計画を作る側が保存の返事を待たずに画面へ進むようになったため。
*/
describe('保存中の計画を待つ', () => {
  const fsState = { gate: null, written: [], updated: [], failNext: false };

  beforeAll(() => {
    jest.resetModules();
  });

  const load = () => {
    jest.doMock('../firebaseConfig', () => ({ db: {} }));
    jest.doMock('firebase/firestore', () => ({
      doc: (_db, ...path) => path.join('/'),
      getDoc: async (path) => ({ exists: () => fsState.written.includes(path), data: () => ({ path }) }),
      setDoc: async (path) => {
        if (fsState.gate) await fsState.gate;
        if (fsState.failNext) { fsState.failNext = false; throw new Error('offline'); }
        fsState.written.push(path);
      },
      updateDoc: async (path) => {
        if (!fsState.written.includes(path)) throw new Error('no document');
        fsState.updated.push(path);
      },
      arrayUnion: (...v) => v,
    }));
    return require('./dailyPlanRepository');
  };

  beforeEach(() => {
    fsState.gate = null;
    fsState.written = [];
    fsState.updated = [];
    fsState.failNext = false;
  });

  test('保存が終わるまで読み出しも回答の記録も待つ', async () => {
    const repo = load();
    let release;
    fsState.gate = new Promise((resolve) => { release = resolve; });

    const saving = repo.saveDailyPlan('u1', '2026-10-31', { newWords: [] });
    const reading = repo.loadDailyPlan('u1', '2026-10-31');
    const marking = repo.markNewWordAnswered('u1', '2026-10-31', 'w1');

    release();
    await saving;
    await expect(reading).resolves.toEqual({ path: 'users/u1/dailyPlans/2026-10-31' });
    await marking;
    expect(fsState.updated).toEqual(['users/u1/dailyPlans/2026-10-31']);
  });

  test('保存に失敗しても reject せず、待っている側は先へ進む', async () => {
    const repo = load();
    fsState.failNext = true;
    await expect(repo.saveDailyPlan('u1', '2026-11-01', {})).resolves.toBeUndefined();
    await expect(repo.loadDailyPlan('u1', '2026-11-01')).resolves.toBeNull();
    await expect(repo.waitForPlanSave('u1', '2026-11-01')).resolves.toBeUndefined();
  });
});
