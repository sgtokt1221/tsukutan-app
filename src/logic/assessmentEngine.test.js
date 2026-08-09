import {
  DOMAIN_WEIGHTS,
  MAX_QUESTIONS,
  MIN_PER_DOMAIN,
  MIN_QUESTIONS,
  buildResult,
  createSession,
  isComplete,
  recordAnswer,
  selectNextItem,
} from './assessmentEngine';
import { TARGET_STANDARD_ERROR, estimateAbility, itemDifficulty } from './assessmentScoring';
import { getRank, rankForScore } from './rankLogic';

const BANK = require('../../public/data/assessment-items.json').items;

const mid = (rankId) => {
  const rank = getRank(rankId);
  return (rank.min + rank.max) / 2;
};

/** 能力 trueScore の生徒がひととおり受ける。難度より上は落とす単純な模擬。 */
const runSession = (trueScore, bank = BANK, startScore) => {
  let state = createSession({ startScore });
  let guard = 0;
  while (!isComplete(state) && guard < MAX_QUESTIONS + 5) {
    const item = selectNextItem(state, bank);
    if (!item) break;
    const correct = trueScore >= itemDifficulty(item);
    state = recordAnswer(state, item, correct ? item.correctChoice : (item.correctChoice + 1) % 4, 2000);
    guard += 1;
  }
  return state;
};

describe('採点', () => {
  test('簡単な問題だけ当てた生徒より、難しい問題を当てた生徒が高くなる', () => {
    const easy = estimateAbility([...Array(20)].map(() => ({ difficulty: mid('D'), correct: true })));
    const hard = estimateAbility([...Array(20)].map(() => ({ difficulty: mid('S'), correct: true })));
    expect(hard.score).toBeGreaterThan(easy.score);
  });

  test('同じ回答履歴なら同じ能力値になる', () => {
    const answers = [
      { difficulty: mid('C'), correct: true },
      { difficulty: mid('B'), correct: true },
      { difficulty: mid('A'), correct: false },
    ];
    expect(estimateAbility(answers)).toEqual(estimateAbility(answers));
  });

  test('問題の順番が変わっても同じ能力値になる', () => {
    const answers = [
      { difficulty: mid('C'), correct: true },
      { difficulty: mid('B'), correct: true },
      { difficulty: mid('A'), correct: false },
      { difficulty: mid('S'), correct: false },
    ];
    const reversed = [...answers].reverse();
    expect(estimateAbility(reversed).score).toBe(estimateAbility(answers).score);
  });

  test('当てずっぽうだけで上位ランクにならない', () => {
    // 4択なので25%は当たる。S帯を1/4だけ当てた履歴。
    const answers = [...Array(24)].map((_, i) => ({ difficulty: mid('S'), correct: i % 4 === 0 }));
    const { score } = estimateAbility(answers);
    expect(rankForScore(score).id).not.toBe('S');
    expect(score).toBeLessThan(getRank('S').min);
  });

  test('全問正解・全問不正解でも値が壊れない', () => {
    const allCorrect = estimateAbility([...Array(10)].map(() => ({ difficulty: mid('B'), correct: true })));
    const allWrong = estimateAbility([...Array(10)].map(() => ({ difficulty: mid('B'), correct: false })));
    expect(Number.isFinite(allCorrect.score)).toBe(true);
    expect(Number.isFinite(allWrong.score)).toBe(true);
    expect(allCorrect.score).toBeGreaterThan(allWrong.score);
    // 片側だけの履歴は推定が甘いので、誤差を広く取る
    expect(allCorrect.standardError).toBeGreaterThan(TARGET_STANDARD_ERROR);
  });

  test('回答が無ければ未測定', () => {
    expect(estimateAbility([]).score).toBeNull();
  });
});

describe('出題', () => {
  test('同じ問題を二度出さない', () => {
    const state = runSession(mid('B'));
    expect(new Set(state.askedItemIds).size).toBe(state.askedItemIds.length);
  });

  test('同じ単語を二度出さない', () => {
    const state = runSession(mid('B'));
    expect(new Set(state.askedWords).size).toBe(state.askedWords.length);
  });

  test('領域別の最低問題数を満たす', () => {
    const state = runSession(mid('B'));
    for (const domain of Object.keys(DOMAIN_WEIGHTS)) {
      const asked = state.answers.filter((a) => a.domain === domain).length;
      expect({ domain, ok: asked >= MIN_PER_DOMAIN }).toEqual({ domain, ok: true });
    }
  });

  test('最低28問・最大48問で終わる', () => {
    for (const rank of ['E', 'C', 'B', 'A', 'S']) {
      const state = runSession(mid(rank));
      expect(state.answers.length).toBeGreaterThanOrEqual(MIN_QUESTIONS);
      expect(state.answers.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    }
  });

  test('推定に近い難度の問題が選ばれる', () => {
    const state = createSession({ startScore: mid('B') });
    const item = selectNextItem(state, BANK);
    // 情報量が最大なのは推定能力に最も近い難度
    expect(Math.abs(itemDifficulty(item) - mid('B'))).toBeLessThanOrEqual(150);
  });

  test('出す問題が尽きたら null', () => {
    const tiny = BANK.slice(0, 1);
    let state = createSession();
    state = recordAnswer(state, tiny[0], 0, 1000);
    expect(selectNextItem(state, tiny)).toBeNull();
  });
});

describe('回答の記録', () => {
  const item = BANK[0];

  test('同じ問題を再送しても二重に記録しない', () => {
    let state = createSession();
    state = recordAnswer(state, item, item.correctChoice, 1000);
    const after = recordAnswer(state, item, item.correctChoice, 1000);
    expect(after.answers.length).toBe(1);
  });

  test('「わからない」は当てずっぽうと区別する', () => {
    let state = createSession();
    state = recordAnswer(state, item, null, 1000);
    expect(state.answers[0]).toMatchObject({ skipped: true, correct: false, choiceIndex: null });
  });

  test('終了後は記録しない', () => {
    const state = { ...createSession(), finished: true };
    expect(recordAnswer(state, item, 0, 1000).answers.length).toBe(0);
  });
});

describe('終了条件', () => {
  test('28問未満では終わらない', () => {
    const state = { ...createSession(), answers: new Array(27).fill({ domain: 'vocabulary' }), standardError: 1 };
    expect(isComplete(state)).toBe(false);
  });

  test('誤差が大きいうちは続く', () => {
    const answers = new Array(30).fill(null).map((_, i) => ({
      domain: i % 2 === 0 ? 'vocabulary' : 'context',
    }));
    const state = { ...createSession(), answers, standardError: TARGET_STANDARD_ERROR + 20 };
    expect(isComplete(state)).toBe(false);
  });

  test('48問で必ず終わる', () => {
    const state = { ...createSession(), answers: new Array(MAX_QUESTIONS).fill({ domain: 'vocabulary' }), standardError: 999 };
    expect(isComplete(state)).toBe(true);
  });
});

describe('結果', () => {
  test('実力に近いランクへ着地する', () => {
    // 同一または隣接ランクに入ること（計画書11.4の再現性ゲートの内側）
    for (const rank of ['D', 'C', 'B', 'A']) {
      const state = runSession(mid(rank));
      const result = buildResult(state);
      const order = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'];
      const distance = Math.abs(order.indexOf(result.rankId) - order.indexOf(rank));
      expect({ rank, got: result.rankId, ok: distance <= 1 }).toEqual({ rank, got: result.rankId, ok: true });
    }
  });

  test('前回の能力値から始めても結果は変わらない', () => {
    const fromMiddle = buildResult(runSession(mid('A')));
    const fromPrevious = buildResult(runSession(mid('A'), BANK, mid('A')));
    const order = ['E', 'D', 'C', 'B', 'A', 'S', 'SS'];
    const distance = Math.abs(order.indexOf(fromMiddle.rankId) - order.indexOf(fromPrevious.rankId));
    expect(distance).toBeLessThanOrEqual(1);
  });

  test('正答数と問題数を数える', () => {
    const state = runSession(mid('B'));
    const result = buildResult(state);
    expect(result.totalQuestions).toBe(state.answers.length);
    expect(result.correctCount).toBe(state.answers.filter((a) => a.correct).length);
  });
});
