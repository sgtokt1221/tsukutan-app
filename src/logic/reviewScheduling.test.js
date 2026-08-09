import {
  ANSWER_QUALITY,
  actionForQuality,
  nextSchedule,
  shouldRepeatToday,
  toQuality,
} from './reviewScheduling';
import { MOTIVATION_LEVELS } from '../config';

const normal = MOTIVATION_LEVELS.normal;

describe('toQuality', () => {
  test('3段階の名前を q に直す', () => {
    expect(toQuality('again')).toBe(2);
    expect(toQuality('hard')).toBe(3);
    expect(toQuality('good')).toBe(5);
  });

  test('旧来の真偽値も受け取れる', () => {
    expect(toQuality(true)).toBe(ANSWER_QUALITY.good);
    expect(toQuality(false)).toBe(ANSWER_QUALITY.again);
  });

  test('知らない文字列は「もう一度」に倒す', () => {
    // 覚えている扱いにして間隔を空けるより、出し直すほうが害が小さい
    expect(toQuality('なにこれ')).toBe(ANSWER_QUALITY.again);
  });
});

describe('nextSchedule', () => {
  const fresh = { interval: 0, repetitions: 0, easeFactor: 2.5 };

  test('初回に正解すると翌日', () => {
    expect(nextSchedule(fresh, ANSWER_QUALITY.good, normal).interval).toBe(1);
  });

  test('2回目の正解で6日側へ進む', () => {
    const state = { interval: 1, repetitions: 1, easeFactor: 2.5 };
    expect(nextSchedule(state, ANSWER_QUALITY.good, normal).interval)
      .toBe(Math.ceil(6 * normal.intervalMultiplier));
  });

  test('「もう一度」は間隔を0に戻し、繰り返し回数もリセットする', () => {
    const state = { interval: 30, repetitions: 5, easeFactor: 2.5 };
    const next = nextSchedule(state, ANSWER_QUALITY.again, normal);
    expect(next.interval).toBe(0);
    expect(next.repetitions).toBe(0);
  });

  test('「迷った」は進むが、「わかった」より間隔が短い', () => {
    const state = { interval: 10, repetitions: 3, easeFactor: 2.5 };
    const hard = nextSchedule(state, ANSWER_QUALITY.hard, normal);
    const good = nextSchedule(state, ANSWER_QUALITY.good, normal);

    expect(hard.repetitions).toBe(4);
    expect(hard.interval).toBeGreaterThan(0);
    expect(hard.interval).toBeLessThan(good.interval);
  });

  test('「迷った」でも間隔は必ず1日以上になる', () => {
    // 0日にすると同じ日に出続けて「もう一度」と区別が付かなくなる
    const state = { interval: 0, repetitions: 0, easeFactor: 2.5 };
    expect(nextSchedule(state, ANSWER_QUALITY.hard, normal).interval).toBeGreaterThanOrEqual(1);
  });

  test('E-Factor は わかった で上がり、迷った・もう一度 で下がる', () => {
    const state = { interval: 10, repetitions: 3, easeFactor: 2.5 };
    const good = nextSchedule(state, ANSWER_QUALITY.good, normal).easeFactor;
    const hard = nextSchedule(state, ANSWER_QUALITY.hard, normal).easeFactor;
    const again = nextSchedule(state, ANSWER_QUALITY.again, normal).easeFactor;

    expect(good).toBeGreaterThan(hard);
    expect(hard).toBeGreaterThan(again);
  });

  test('E-Factor は 1.3 を下回らない', () => {
    let state = { interval: 1, repetitions: 1, easeFactor: 1.3 };
    for (let i = 0; i < 20; i += 1) {
      state = { ...state, ...nextSchedule(state, ANSWER_QUALITY.again, normal) };
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  test('やる気レベルが高いほど間隔が短くなる（復習が多く回る）', () => {
    // intervalMultiplier は逆向きの係数。そこそこ=1.5 / 普通=1 / やる気満々=0.7。
    // 向きを取り違えると、やる気のある生徒ほど復習が減るという逆の挙動になる。
    const state = { interval: 10, repetitions: 3, easeFactor: 2.5 };
    const low = nextSchedule(state, ANSWER_QUALITY.good, MOTIVATION_LEVELS.low).interval;
    const normalInterval = nextSchedule(state, ANSWER_QUALITY.good, MOTIVATION_LEVELS.normal).interval;
    const high = nextSchedule(state, ANSWER_QUALITY.good, MOTIVATION_LEVELS.high).interval;
    expect(low).toBeGreaterThan(normalInterval);
    expect(normalInterval).toBeGreaterThan(high);
  });

  test('状態が壊れていても既定値で計算できる', () => {
    const next = nextSchedule(undefined, ANSWER_QUALITY.good, normal);
    expect(next.interval).toBe(1);
    expect(next.repetitions).toBe(1);
    expect(Number.isFinite(next.easeFactor)).toBe(true);
  });
});

describe('shouldRepeatToday / actionForQuality', () => {
  test('今日もう一度出すのは「もう一度」だけ', () => {
    expect(shouldRepeatToday(ANSWER_QUALITY.again)).toBe(true);
    expect(shouldRepeatToday(ANSWER_QUALITY.hard)).toBe(false);
    expect(shouldRepeatToday(ANSWER_QUALITY.good)).toBe(false);
  });

  test('ログの行動名が3段階に分かれる', () => {
    expect(actionForQuality(ANSWER_QUALITY.good)).toBe('correct');
    expect(actionForQuality(ANSWER_QUALITY.hard)).toBe('hard');
    expect(actionForQuality(ANSWER_QUALITY.again)).toBe('incorrect');
  });
});
