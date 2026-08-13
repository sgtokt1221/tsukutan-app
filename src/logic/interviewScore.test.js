import { commentFor, scoreOf, summarize, toneOf } from './interviewScore';

const readAloud = (review) => ({ key: 'read-aloud', label: '音読', mode: 'scripted', review });
const question = (no, verdict) => ({
  key: `q-${no}`,
  label: `No.${no}`,
  mode: 'unscripted',
  review: verdict ? { missing: [], total: 0, content: { verdict } } : null,
});

test('音読は読めた語の割合が点になる', () => {
  expect(scoreOf(readAloud({ total: 20, missing: ['many', 'towns'] }))).toBe(90);
  expect(scoreOf(readAloud({ total: 20, missing: [] }))).toBe(100);
});

test('質問は判定がそのまま点になる', () => {
  expect(scoreOf(question(1, 'good'))).toBe(100);
  expect(scoreOf(question(1, 'partial'))).toBe(50);
  expect(scoreOf(question(1, 'off-target'))).toBe(0);
});

test('判定が返っていない場面は点にしない', () => {
  expect(scoreOf(question(1, null))).toBeNull();
  expect(scoreOf({ mode: 'unscripted', review: { content: null } })).toBeNull();
  // 分母が無いと割合を出せない
  expect(scoreOf(readAloud({ total: 0, missing: [] }))).toBeNull();
});

test('点が付かなかった場面は平均から外す', () => {
  const summary = summarize([
    readAloud({ total: 10, missing: [] }), // 100
    question(1, 'partial'), // 50
    question(2, null), // 判定なし
  ]);

  // (100 + 50) / 2。判定なしを0点として混ぜない
  expect(summary.overall).toBe(75);
  expect(summary.items).toHaveLength(3);
  expect(summary.items[2].score).toBeNull();
});

test('判定の内訳を数える', () => {
  const summary = summarize([
    question(1, 'good'),
    question(2, 'good'),
    question(3, 'off-target'),
  ]);

  expect(summary.counts).toEqual({ good: 2, partial: 0, 'off-target': 1 });
});

test('録音が1つも無ければ点は出ない', () => {
  const summary = summarize([]);
  expect(summary.overall).toBeNull();
  expect(commentFor(summary.overall)).toMatch(/判定が取れませんでした/);
});

test('点を3段階の色分けに寄せる', () => {
  expect(toneOf(100)).toBe('good');
  expect(toneOf(80)).toBe('good');
  expect(toneOf(79)).toBe('partial');
  expect(toneOf(50)).toBe('partial');
  expect(toneOf(49)).toBe('off-target');
});
