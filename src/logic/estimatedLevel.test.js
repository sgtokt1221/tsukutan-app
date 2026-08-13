import { estimateLevel, isAheadOfAssessment, CLEAR_RATIO } from './estimatedLevel';

/** レベルごとに count 語のマスターを作る */
const master = (counts) => Object.entries(counts).flatMap(([level, count]) =>
  Array.from({ length: count }, (_, i) => ({ id: `w${level}-${i}`, level: Number(level) })));

/** そのレベルを count 語だけ卒業した状態 */
const graduated = (counts) => Object.entries(counts).flatMap(([level, count]) =>
  Array.from({ length: count }, (_, i) => ({ id: `w${level}-${i}`, level: Number(level), status: 'mastered' })));

const MASTER = master({ 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100, 7: 100 });

test('8割卒業したレベルの1つ上を見積もる', () => {
  const result = estimateLevel({ master: MASTER, reviewWords: graduated({ 1: 80, 2: 80 }) });

  expect(result.cleared).toBe(2);
  expect(result.estimated).toBe(3);
});

test('8割に届かないうちは越えたと見なさない', () => {
  const result = estimateLevel({ master: MASTER, reviewWords: graduated({ 1: 79 }) });

  expect(result.cleared).toBe(0);
  expect(result.estimated).toBeNull();
  expect(result.nextRatio).toBeCloseTo(0.79);
});

test('途中を飛ばしていたら、そこで止める', () => {
  // レベル3を飛ばして5だけ覚えていても「レベル6相当」とは言えない
  const result = estimateLevel({ master: MASTER, reviewWords: graduated({ 1: 80, 2: 80, 4: 90, 5: 90 }) });

  expect(result.cleared).toBe(2);
  expect(result.estimated).toBe(3);
});

test('卒業していない復習語は数えない', () => {
  const words = graduated({ 1: 80 }).map((word, i) => (i < 40 ? { ...word, status: 'learning' } : word));
  const result = estimateLevel({ master: MASTER, reviewWords: words });

  expect(result.estimated).toBeNull();
});

test('一番上まで行っても、それ以上は上げない', () => {
  const result = estimateLevel({
    master: MASTER,
    reviewWords: graduated({ 1: 80, 2: 80, 3: 80, 4: 80, 5: 80, 6: 80, 7: 80 }),
  });

  expect(result.cleared).toBe(7);
  expect(result.estimated).toBe(7);
});

test('記録がなければ見積もらない', () => {
  expect(estimateLevel({}).estimated).toBeNull();
  expect(estimateLevel({ master: MASTER, reviewWords: [] }).estimated).toBeNull();
});

test('測った値より上のときだけ促す', () => {
  expect(isAheadOfAssessment(4, 3)).toBe(true);
  expect(isAheadOfAssessment(3, 3)).toBe(false);
  expect(isAheadOfAssessment(2, 3)).toBe(false);
  expect(isAheadOfAssessment(null, 0)).toBe(false);
  // テスト未受験（0）でも、見積もりが出れば促す
  expect(isAheadOfAssessment(2, 0)).toBe(true);
});

test('境目は8割', () => {
  expect(CLEAR_RATIO).toBe(0.8);
  expect(estimateLevel({ master: MASTER, reviewWords: graduated({ 1: 80 }) }).cleared).toBe(1);
});
