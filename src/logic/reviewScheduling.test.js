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

describe('初見の単語（進捗が無い状態からの1回答目）', () => {
  // reviewLogic は初回に { interval: 0, repetitions: 0, easeFactor: 2.5 } を作って
  // そこへ回答を適用する。以前は回答を捨てて必ず interval:1 / repetitions:0 に
  // していたため、正解でも不正解でも同じ状態になっていた。
  const fresh = { interval: 0, repetitions: 0, easeFactor: 2.5 };

  test('正解と不正解で状態が変わる', () => {
    const good = nextSchedule(fresh, ANSWER_QUALITY.good, normal);
    const again = nextSchedule(fresh, ANSWER_QUALITY.again, normal);
    expect(good).not.toEqual(again);
  });

  test('初回正解は翌日、繰り返し1回目になる', () => {
    const next = nextSchedule(fresh, ANSWER_QUALITY.good, normal);
    expect(next.interval).toBe(1);
    expect(next.repetitions).toBe(1);
  });

  test('初回不正解は当日のまま、繰り返しは進まない', () => {
    const next = nextSchedule(fresh, ANSWER_QUALITY.again, normal);
    expect(next.interval).toBe(0);
    expect(next.repetitions).toBe(0);
    expect(shouldRepeatToday(ANSWER_QUALITY.again)).toBe(true);
  });

  test('初回不正解のほうが Ease Factor が低い', () => {
    expect(nextSchedule(fresh, ANSWER_QUALITY.again, normal).easeFactor)
      .toBeLessThan(nextSchedule(fresh, ANSWER_QUALITY.good, normal).easeFactor);
  });
});

describe('Ease Factor の暴走を防ぐ', () => {
  // 以前は easeFactorMultiplier を毎回答 EF に掛けていたため、
  // 「そこそこ」(1.2) で12回正解すると EF が 27 まで発散し、
  // 間隔が約58,000年になっていた。
  const runCorrect = (config, times) => {
    let state = { interval: 0, repetitions: 0, easeFactor: 2.5 };
    for (let i = 0; i < times; i += 1) {
      state = { ...state, ...nextSchedule(state, ANSWER_QUALITY.good, config) };
    }
    return state;
  };

  test('やる気レベルによらず Ease Factor は 1.3〜3.0 に収まる', () => {
    for (const key of ['low', 'normal', 'high']) {
      const state = runCorrect(MOTIVATION_LEVELS[key], 30);
      expect(state.easeFactor).toBeGreaterThanOrEqual(1.3);
      expect(state.easeFactor).toBeLessThanOrEqual(3.0);
    }
  });

  test('やる気満々でも Ease Factor が下限に張り付かない', () => {
    // 以前は4回正解で 1.3 に落ち、成績と無関係に3日間隔で回り続けていた
    const state = runCorrect(MOTIVATION_LEVELS.high, 10);
    expect(state.easeFactor).toBeGreaterThan(1.3);
  });

  test('間隔は365日を超えない', () => {
    for (const key of ['low', 'normal', 'high']) {
      const state = runCorrect(MOTIVATION_LEVELS[key], 30);
      expect(state.interval).toBeLessThanOrEqual(365);
    }
  });

  test('保存済みの壊れた Ease Factor を読み取り時に丸める', () => {
    // 既存ユーザーには 27 まで膨らんだ値が入っている
    const broken = nextSchedule({ interval: 10, repetitions: 3, easeFactor: 27 }, ANSWER_QUALITY.good, normal);
    expect(broken.easeFactor).toBeLessThanOrEqual(3.0);
    expect(broken.interval).toBeLessThanOrEqual(365);
  });

  test('やる気の効きが二重にならない', () => {
    // interval と easeFactor の両方に倍率を掛けていたため、
    // やる気満々では 0.7 × 0.8 = 0.56 倍が毎回かかっていた
    const state = { interval: 10, repetitions: 3, easeFactor: 2.5 };
    const high = nextSchedule(state, ANSWER_QUALITY.good, MOTIVATION_LEVELS.high).interval;
    const expected = Math.ceil(10 * 2.5 * MOTIVATION_LEVELS.high.intervalMultiplier);
    expect(high).toBe(expected);
  });
});
