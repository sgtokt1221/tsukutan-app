/*
  その日最初の計画作り（generateDailyPlan）の速さの番人（2026-10-31）。

  - 復習単語（reviewWords）は1回だけ読む（習得済みの語を選ぶのに問い合わせ直さない）
  - 計画の保存の返事を待たずに計画を返す。ただし保存は控えてあり、
    その日の計画を読み直す処理は保存の完了を待つ（別の抽選で上書きしない）
*/
jest.mock('../firebaseConfig', () => ({ auth: {}, db: {} }));

const mockFs = {
  getDocsCalls: [],
  setDocCalls: [],
  setDocGate: null,
  storedPlan: null,
};

jest.mock('firebase/firestore', () => ({
  collection: (_db, ...path) => ({ path: path.join('/') }),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  query: (ref) => ref,
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  getDocs: async (ref) => {
    mockFs.getDocsCalls.push(ref.path);
    if (ref.path.endsWith('/reviewWords')) {
      const rows = [
        { id: 'r1', word: 'apple', repetitions: 8, interval: 30, lastReviewed: new Date() },
        { id: 'r2', word: 'banana', repetitions: 1, interval: 1, lastReviewed: new Date('2026-10-01') },
      ];
      return { docs: rows.map(({ id, ...data }) => ({ id, data: () => data })) };
    }
    return { docs: [], forEach: () => {} };
  },
  getDoc: async () => ({
    exists: () => Boolean(mockFs.storedPlan),
    data: () => mockFs.storedPlan,
  }),
  setDoc: async (ref, data) => {
    mockFs.setDocCalls.push(ref.path);
    if (mockFs.setDocGate) await mockFs.setDocGate;
    mockFs.storedPlan = data;
  },
  updateDoc: async () => {},
  arrayUnion: (...values) => values,
}));

// CRA の jest は resetMocks が立っているので、jest.fn ではなく素の関数で置く
jest.mock('./vocabularyEstimator', () => ({ estimateNeededWords: async () => 500 }));
jest.mock('./wordMaster', () => ({
  loadTextbookWords: async () => Array.from({ length: 40 }, (_, i) => ({
    id: `w${i}`, word: `word${i}`, partOfSpeech: '名', meaning: `意味${i}`, level: (i % 3) + 1,
  })),
  loadWordMaster: async () => [],
}));

// eslint-disable-next-line import/first
import { generateDailyPlan } from './learningPlanner';
// eslint-disable-next-line import/first
import { waitForPlanSave, loadDailyPlan } from './dailyPlanRepository';
// eslint-disable-next-line import/first
import { getTodayKey } from './dateKeys';

const user = {
  level: 2,
  goal: { isSet: true, targets: [{ goalId: 'hs_45' }], targetDate: '2027-02-20', motivationLevel: 'normal' },
};

beforeEach(() => {
  mockFs.getDocsCalls = [];
  mockFs.setDocCalls = [];
  mockFs.setDocGate = null;
  mockFs.storedPlan = null;
});

test('復習単語のコレクションは1回だけ読む', async () => {
  const plan = await generateDailyPlan(user, 'u1');
  await waitForPlanSave('u1', getTodayKey());
  expect(mockFs.getDocsCalls.filter((p) => p.endsWith('/reviewWords'))).toHaveLength(1);
  // 習得済みの枠（apple は repetitions 8）は手元で選べている
  expect(plan.reviewWords.some((w) => w.id === 'r1' && w.isMastered)).toBe(true);
  expect(plan.fromStoredPlan).toBe(false);
});

test('保存の返事を待たずに計画を返し、読み直しは保存の完了を待つ', async () => {
  let release;
  mockFs.setDocGate = new Promise((resolve) => { release = resolve; });

  const plan = await generateDailyPlan(user, 'u1');
  // 計画は出せるが、保存はまだ終わっていない
  expect(plan.newWords.length).toBeGreaterThan(0);
  expect(mockFs.storedPlan).toBeNull();

  // このあいだに読み直しても「まだ無い」とは見ない（保存を待ってから読む）
  let loaded;
  const reading = loadDailyPlan('u1', getTodayKey()).then((value) => { loaded = value; });
  await Promise.resolve();
  expect(loaded).toBeUndefined();

  release();
  await reading;
  expect(loaded.newWords.map((w) => w.id)).toEqual(plan.newWords.map((w) => w.id));

  // 2回目は保存済みの計画をそのまま返す（作り直さない）
  const again = await generateDailyPlan(user, 'u1');
  expect(again.fromStoredPlan).toBe(true);
  expect(again.newWords.map((w) => w.id)).toEqual(plan.newWords.map((w) => w.id));
  expect(mockFs.setDocCalls).toHaveLength(1);
});
