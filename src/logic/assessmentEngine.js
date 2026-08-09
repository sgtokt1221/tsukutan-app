import {
  TARGET_STANDARD_ERROR,
  estimateAbility,
  itemDifficulty,
  itemInformation,
} from './assessmentScoring';
import { SCORE_MAX, SCORE_MIN, rankForScore } from './rankLogic';

/**
 * 実力テストの出題エンジン。
 * ASSESSMENT_RANK_SYSTEM_PLAN.md 5章。
 *
 * Firestore にも React にも依存しない純粋な状態機械にしてある。
 * 出題の偏りや終了条件は学習体験に直結するので、画面と混ぜずに
 * 単体で検証できるようにする。
 */

export const MIN_QUESTIONS = 28;
export const MAX_QUESTIONS = 48;

/**
 * 領域ごとの目標比率（計画書4.2）。
 * 今の問題バンクは語彙35% / 文脈25% の2領域だけなので、
 * その比を保ったまま正規化して使う。
 */
export const DOMAIN_WEIGHTS = { vocabulary: 35, context: 25 };

/** どの領域も最低これだけは出す。語彙だけに偏らせないため。 */
export const MIN_PER_DOMAIN = 8;

/** 同じ単語を2回出さない。意味と空所補充で同じ語が続くのを防ぐ。 */
const usedWordKey = (item) => String(item.word || '').toLowerCase();

export const createSession = ({ startScore } = {}) => ({
  answers: [],
  askedItemIds: [],
  askedWords: [],
  // 初回は中央帯から始める。再受験は前回の能力値から（計画書5.1）。
  ability: Number.isFinite(startScore) ? startScore : Math.round((SCORE_MIN + SCORE_MAX) / 2),
  standardError: null,
  finished: false,
});

/** 今の推定でその領域をあと何問出すべきか */
const domainDeficit = (state, domain, totalTarget) => {
  const weightSum = Object.values(DOMAIN_WEIGHTS).reduce((a, b) => a + b, 0);
  const target = Math.round((DOMAIN_WEIGHTS[domain] / weightSum) * totalTarget);
  const asked = state.answers.filter((answer) => answer.domain === domain).length;
  return target - asked;
};

/**
 * 次に出す問題を選ぶ（計画書5.2）。
 *
 * 条件:
 *   1. 今の推定能力に近く、判定情報量が高い
 *   2. 領域別の出題割合を守る
 *   3. 同じ単語を二度出さない
 *   4. 一度出した問題を出さない
 */
export const selectNextItem = (state, bank) => {
  const asked = new Set(state.askedItemIds);
  const words = new Set(state.askedWords);

  const available = bank.filter(
    (item) => !asked.has(item.itemId) && !words.has(usedWordKey(item))
  );
  if (available.length === 0) return null;

  // 不足している領域を優先する
  const deficits = Object.keys(DOMAIN_WEIGHTS)
    .map((domain) => ({ domain, deficit: domainDeficit(state, domain, MIN_QUESTIONS) }))
    .sort((a, b) => b.deficit - a.deficit);

  for (const { domain, deficit } of deficits) {
    if (deficit <= 0) continue;
    const pool = available.filter((item) => item.domain === domain);
    if (pool.length > 0) return mostInformative(pool, state.ability);
  }

  return mostInformative(available, state.ability);
};

/** 情報量が最大の問題。同点なら itemId で決める（実行のたびに変えない）。 */
const mostInformative = (pool, ability) => {
  let best = null;
  let bestInfo = -Infinity;
  for (const item of pool) {
    const info = itemInformation(ability, itemDifficulty(item));
    if (info > bestInfo || (info === bestInfo && best && item.itemId < best.itemId)) {
      best = item;
      bestInfo = info;
    }
  }
  return best;
};

/**
 * 回答を記録して推定を更新する。
 * 同じ問題を二重に記録しない（連打・再送対策。計画書13.5）。
 */
export const recordAnswer = (state, item, choiceIndex, responseMs) => {
  if (!item || state.finished) return state;
  if (state.askedItemIds.includes(item.itemId)) return state;

  const answer = {
    itemId: item.itemId,
    word: item.word,
    domain: item.domain,
    targetRank: item.targetRank,
    difficulty: itemDifficulty(item),
    // 「わからない」は choiceIndex を null で受ける。当てずっぽうと区別する。
    choiceIndex: Number.isInteger(choiceIndex) ? choiceIndex : null,
    correct: choiceIndex === item.correctChoice,
    skipped: !Number.isInteger(choiceIndex),
    responseMs: Number.isFinite(responseMs) ? responseMs : null,
  };

  const answers = [...state.answers, answer];
  const { score, standardError } = estimateAbility(answers);

  return {
    ...state,
    answers,
    askedItemIds: [...state.askedItemIds, item.itemId],
    askedWords: [...state.askedWords, usedWordKey(item)],
    ability: Number.isFinite(score) ? score : state.ability,
    standardError,
  };
};

/**
 * 終了してよいか（計画書5.3）。
 * 最低問題数・領域別の最低数・誤差の3つをすべて満たしたときだけ。
 */
export const isComplete = (state) => {
  const total = state.answers.length;
  if (total >= MAX_QUESTIONS) return true;
  if (total < MIN_QUESTIONS) return false;

  for (const domain of Object.keys(DOMAIN_WEIGHTS)) {
    const asked = state.answers.filter((answer) => answer.domain === domain).length;
    if (asked < MIN_PER_DOMAIN) return false;
  }

  return Number.isFinite(state.standardError) && state.standardError <= TARGET_STANDARD_ERROR;
};

/** 結果をまとめる。ランクの確定は rankLogic 側で行う。 */
export const buildResult = (state) => {
  const estimate = estimateAbility(state.answers);
  return {
    ...estimate,
    rankId: rankForScore(estimate.score)?.id ?? null,
    totalQuestions: state.answers.length,
    correctCount: state.answers.filter((answer) => answer.correct).length,
    skippedCount: state.answers.filter((answer) => answer.skipped).length,
    answers: state.answers,
  };
};
