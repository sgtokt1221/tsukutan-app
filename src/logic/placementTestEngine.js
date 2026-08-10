/**
 * src/logic/placementTestEngine.js
 *
 * 単語力チェックの判定ロジック。React の状態から切り離した純粋な状態機械。
 * IMPLEMENTATION_PLAN.md 11章。
 *
 * 設計上の約束
 *   - 出題に使うのは単語の level（1〜7）だけ。eikenLevels は表示・教材フィルタ専用で、
 *     ここでは一切引き算しない（'pre1' / 'pre2' が混ざると NaN になるため）
 *   - 難易度の変更はステージが終わったときにだけ行う。ステージ途中で
 *     問題・得点・回答時間を初期化しない
 *   - 同じテスト中に同じ単語を二度出さない
 *   - ステージ得点と全体得点は別に持つ
 *   - 早期終了は最低回答数を満たしたうえで、全回答履歴から判定する
 *   - 同じ回答履歴を与えれば必ず同じ最終レベルになる
 */

export const QUESTIONS_STAGE_1 = 5;
export const QUESTIONS_PER_STAGE = 10;
export const MAX_STAGES = 10;

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 7;
export const DEFAULT_START_LEVEL = 3;

/** 早期終了に必要な最低回答数 */
export const MIN_ANSWERS_FOR_EARLY_FINISH = 15;
/** レベルが動かないステージがこの回数続いたら確定とみなす */
export const STABLE_STAGES_FOR_EARLY_FINISH = 2;

const PASS_RATE = 0.7;
const FAIL_RATE = 0.3;

/**
 * 答えを見てから「わかる」を押した回答の重み。
 *
 * 自己申告なので、見てから「知っていた」と答えたのか、本当に思い出せたのかが
 * 区別できなかった。全部「わかる」を押せばレベル7まで行ける状態だった。
 * 画面が「ダブルタップで答えを確認」と案内している以上、見たこと自体を
 * 不正解にはしない。思い出せた回答の半分として数える。
 */
export const REVEALED_ANSWER_WEIGHT = 0.5;

/** 回答1件の得点。答えを見ていたら半分。 */
export const answerScore = (answer) => {
  if (!answer || !answer.isCorrect) return 0;
  return answer.revealed ? REVEALED_ANSWER_WEIGHT : 1;
};

const clampLevel = (level) => Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level));

/** そのステージの問題数 */
export const questionsForStage = (stage) => (stage === 1 ? QUESTIONS_STAGE_1 : QUESTIONS_PER_STAGE);

export const createInitialState = ({ startLevel = DEFAULT_START_LEVEL } = {}) => ({
  stage: 1,
  targetLevel: clampLevel(startLevel),
  stageAnswers: [],
  allAnswers: [],
  askedIds: [],
  stableStages: 0,
  completed: false,
  resultLevel: null,
});

/**
 * 出題する単語を選ぶ。
 *
 * 乱数を注入できるようにしてあるので、テストでは同じ並びを再現できる（計画書11.5）。
 *
 * @param {Array} words     候補の単語（level を持つこと）
 * @param {number} level    狙うレベル
 * @param {number} count    必要な問題数
 * @param {Set|Array} askedIds 出題済みID
 * @param {Function} random 0〜1 を返す関数
 */
export const selectQuestions = (words, level, count, askedIds = [], random = Math.random) => {
  const asked = askedIds instanceof Set ? askedIds : new Set(askedIds);
  const available = (words || []).filter((word) => word && word.id && !asked.has(word.id));

  const withinDistance = (distance) =>
    available.filter((word) => Math.abs((word.level ?? 0) - level) <= distance);

  // 近いレベルから順に広げる。足りなければ最後は全候補。
  let pool = withinDistance(1);
  if (pool.length < count) pool = withinDistance(2);
  if (pool.length < count) pool = available;

  return shuffle(pool, random).slice(0, count);
};

/** 乱数を注入できる Fisher-Yates */
export const shuffle = (items, random = Math.random) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** テスト用の再現可能な乱数 */
export const seededRandom = (seed = 1) => {
  let value = seed >>> 0 || 1;
  return () => {
    // xorshift32
    value ^= value << 13;
    value >>>= 0;
    value ^= value >> 17;
    value ^= value << 5;
    value >>>= 0;
    return value / 0xffffffff;
  };
};

/**
 * 1問の回答を記録する。ここでは難易度を変えないし、何も初期化しない。
 */
export const recordAnswer = (state, { wordId, isCorrect, responseTime = 0, revealed = false }) => {
  if (state.completed) return state;

  const answer = {
    wordId,
    isCorrect: Boolean(isCorrect),
    // 答えを見てから答えたか。見たうえでの「わかる」は思い出せたことにならない。
    revealed: Boolean(revealed),
    responseTime,
    stage: state.stage,
    level: state.targetLevel,
  };

  return {
    ...state,
    stageAnswers: [...state.stageAnswers, answer],
    allAnswers: [...state.allAnswers, answer],
    askedIds: state.askedIds.includes(wordId) ? state.askedIds : [...state.askedIds, wordId],
  };
};

/** 直前の回答を取り消す。前の問題へ戻る操作で使う（計画書11.4.8）。 */
export const undoLastAnswer = (state) => {
  if (state.stageAnswers.length === 0) return state;
  const removed = state.stageAnswers[state.stageAnswers.length - 1];
  return {
    ...state,
    stageAnswers: state.stageAnswers.slice(0, -1),
    allAnswers: state.allAnswers.slice(0, -1),
    // 出題済みからは外さない。同じテスト中に同じ単語を再度出さないため。
    askedIds: state.askedIds,
    completed: false,
    resultLevel: removed ? null : state.resultLevel,
  };
};

export const isStageComplete = (state) =>
  state.stageAnswers.length >= questionsForStage(state.stage);

export const stageScore = (state) =>
  state.stageAnswers.reduce((sum, answer) => sum + answerScore(answer), 0);
export const totalScore = (state) =>
  state.allAnswers.reduce((sum, answer) => sum + answerScore(answer), 0);

export const overallAccuracy = (state) =>
  state.allAnswers.length === 0 ? 0 : totalScore(state) / state.allAnswers.length;

/**
 * ステージを締める。ここでだけ難易度が動く。
 *
 * 正答率 70% 以上でレベルアップ、30% 以下でレベルダウン、その間は据え置き。
 * レベルが動かないステージが2回続き、かつ15問以上答えていれば確定とみなして終了する。
 */
export const completeStage = (state) => {
  if (state.completed) return state;

  // 候補が足りず予定より少ない問題数で締めることがあるので、
  // 実際に答えた数を分母にする。
  const answered = state.stageAnswers.length || questionsForStage(state.stage);
  const score = stageScore(state);
  const accuracy = answered === 0 ? 0 : score / answered;

  let nextLevel = state.targetLevel;
  if (accuracy >= PASS_RATE) nextLevel = clampLevel(state.targetLevel + 1);
  else if (accuracy <= FAIL_RATE) nextLevel = clampLevel(state.targetLevel - 1);

  const levelUnchanged = nextLevel === state.targetLevel;
  const stableStages = levelUnchanged ? state.stableStages + 1 : 0;

  const settled =
    state.allAnswers.length >= MIN_ANSWERS_FOR_EARLY_FINISH &&
    stableStages >= STABLE_STAGES_FOR_EARLY_FINISH;
  const outOfStages = state.stage >= MAX_STAGES;

  const next = {
    ...state,
    stage: state.stage + 1,
    targetLevel: nextLevel,
    stageAnswers: [],
    stableStages,
  };

  if (settled || outOfStages) {
    return { ...next, completed: true, resultLevel: computeResultLevel({ ...state, targetLevel: nextLevel }) };
  }
  return next;
};

/**
 * 全回答履歴から最終レベルを決める。
 *
 * 落ち着いたレベル（最後に到達したレベル）を基準にし、
 * そのレベルでの正答率が極端な場合だけ1段ずらす。
 * 同じ履歴なら必ず同じ値になる。
 */
export const computeResultLevel = (state) => {
  if (state.allAnswers.length === 0) return clampLevel(state.targetLevel);

  const settledLevel = state.targetLevel;
  const atSettledLevel = state.allAnswers.filter((answer) => answer.level === settledLevel);
  const sample = atSettledLevel.length > 0 ? atSettledLevel : state.allAnswers;
  const accuracy = sample.filter((answer) => answer.isCorrect).length / sample.length;

  if (accuracy >= 0.9) return clampLevel(settledLevel + 1);
  if (accuracy <= 0.2) return clampLevel(settledLevel - 1);
  return clampLevel(settledLevel);
};

/**
 * 推定語彙数。永続IDのユニーク件数から出す（計画書11.6）。
 * 同じ単語が複数の教材に入っていても二重に数えない。
 */
export const estimateVocabulary = (words, level) => {
  const ids = new Set();
  for (const word of words || []) {
    if (!word || (word.level ?? 0) > level) continue;
    ids.add(word.id || `${word.word}|${word.partOfSpeech}|${word.meaning}`);
  }
  return ids.size;
};
