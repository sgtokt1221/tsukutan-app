import { SCORE_MAX, SCORE_MIN, getRank } from './rankLogic';

/**
 * 実力テストの採点。ASSESSMENT_RANK_SYSTEM_PLAN.md 5.4 の第1段階
 * （層化出題と難度加重得点）。
 *
 * 正答数を数えるだけだと、簡単な問題ばかり当てた生徒と難しい問題を
 * 当てた生徒が同じ点になる。問題ごとの難度を使って能力値を推定する。
 *
 * Rasch / 2PL へ進む前提の作りにしてある。ここでは識別力を固定し、
 * 4択の当てずっぽう（1/4）だけ確率に織り込む。
 */

/** 4択なので、何も知らなくても1/4は当たる */
export const GUESSING = 0.25;

/**
 * 能力と難度の差がどれだけ効くか。小さいほど急峻。
 *
 * ランク帯の幅は125〜150点。80 だと1段下の問題を約90%、1段上を約35%
 * （当てずっぽうの25%をわずかに上回る程度）正解する見込みになる。
 * 大きくすると誤差が広がってランクを分離できず、小さくすると
 * 実際より精度が高いように見えてしまう。
 */
const SCALE = 80;

/**
 * ここまで誤差が縮んだら終了してよい（計画書5.3）。
 * ランク帯の幅125〜150点に対し、95%区間で±88点まで絞れる。
 */
export const TARGET_STANDARD_ERROR = 45;

/** 探索の刻み。1000点を5点刻みで見る。 */
const STEP = 5;

/** 問題の難度。ランクの中央値を使う。 */
export const itemDifficulty = (item) => {
  const rank = getRank(item?.targetRank);
  if (!rank) return (SCORE_MIN + SCORE_MAX) / 2;
  return (rank.min + rank.max) / 2;
};

/** 能力 ability の生徒が難度 difficulty の問題に正解する確率 */
export const correctProbability = (ability, difficulty) => {
  const logistic = 1 / (1 + Math.exp(-(ability - difficulty) / SCALE));
  return GUESSING + (1 - GUESSING) * logistic;
};

/** 対数尤度。答えの並びから、その能力値のもっともらしさを測る。 */
const logLikelihood = (ability, answers) => {
  let total = 0;
  for (const answer of answers) {
    const p = correctProbability(ability, answer.difficulty);
    // 0 や 1 に張り付いて -Infinity にならないよう内側に寄せる
    const safe = Math.min(0.999, Math.max(0.001, p));
    total += answer.correct ? Math.log(safe) : Math.log(1 - safe);
  }
  return total;
};

/**
 * フィッシャー情報量。標準誤差を出すのに使う。
 * 難度が能力に近い問題ほど情報が多い＝その問題を出す価値が高い。
 */
export const itemInformation = (ability, difficulty) => {
  const sigma = 1 / (1 + Math.exp(-(ability - difficulty) / SCALE));
  const p = GUESSING + (1 - GUESSING) * sigma;
  if (p <= 0 || p >= 1) return 0;
  // I = (dp/dθ)^2 / (p(1-p))
  const slope = ((1 - GUESSING) * sigma * (1 - sigma)) / SCALE;
  return (slope * slope) / (p * (1 - p));
};

/**
 * 回答履歴から能力値を推定する。
 *
 * @param {Array<{difficulty:number, correct:boolean}>} answers
 * @returns {{score:number, standardError:number, confidenceLow:number, confidenceHigh:number}}
 */
export const estimateAbility = (answers = []) => {
  if (!Array.isArray(answers) || answers.length === 0) {
    return { score: null, standardError: null, confidenceLow: null, confidenceHigh: null };
  }

  // 全問正解・全問不正解は尤度が端で最大になり、値が決まらない。
  // 出題した難度の外側へ半段ぶんだけ寄せた値を返し、誤差を大きく取る。
  const difficulties = answers.map((a) => a.difficulty);
  const allCorrect = answers.every((a) => a.correct);
  const allWrong = answers.every((a) => !a.correct);

  let best = SCORE_MIN;
  let bestValue = -Infinity;
  for (let ability = SCORE_MIN; ability <= SCORE_MAX; ability += STEP) {
    const value = logLikelihood(ability, answers);
    if (value > bestValue) {
      bestValue = value;
      best = ability;
    }
  }

  if (allCorrect) best = Math.min(SCORE_MAX, Math.max(...difficulties) + SCALE);
  if (allWrong) best = Math.max(SCORE_MIN, Math.min(...difficulties) - SCALE);

  const information = answers.reduce(
    (sum, answer) => sum + itemInformation(best, answer.difficulty),
    0
  );
  // 情報が無いときに無限大にしないよう下駄をはかせる
  const standardError = information > 0 ? 1 / Math.sqrt(information) : SCALE * 2;
  // 全問同じ向きのときは推定が甘いので誤差を広げる
  const inflated = allCorrect || allWrong ? standardError * 2 : standardError;

  return {
    score: Math.round(best),
    standardError: Math.round(inflated),
    confidenceLow: Math.max(SCORE_MIN, Math.round(best - 1.96 * inflated)),
    confidenceHigh: Math.min(SCORE_MAX, Math.round(best + 1.96 * inflated)),
  };
};

/** 領域別のスコア。得意・不得意を出すのに使う。 */
export const domainScores = (answers = []) => {
  const byDomain = {};
  for (const answer of answers) {
    if (!answer.domain) continue;
    if (!byDomain[answer.domain]) byDomain[answer.domain] = [];
    byDomain[answer.domain].push(answer);
  }
  const result = {};
  for (const [domain, list] of Object.entries(byDomain)) {
    result[domain] = estimateAbility(list).score;
  }
  return result;
};
