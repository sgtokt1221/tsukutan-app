/**
 * src/config/index.js
 *
 * 目標定義とやる気レベルの正本。画面・ロジック・マスターデータ投入は
 * すべてここを経由する。同じ定義を複数ファイルへ手書きで複製しない。
 */

import goalsJson from './goals.json';
import motivationJson from './motivation.json';
import levelsJson from './levels.json';

export const GOALS = goalsJson;
export const MOTIVATION_LEVELS = motivationJson;

export const GOAL_IDS = GOALS.map((goal) => goal.id);
export const MOTIVATION_KEYS = Object.keys(MOTIVATION_LEVELS);
export const DEFAULT_MOTIVATION_LEVEL = 'normal';

const GOALS_BY_ID = new Map(GOALS.map((goal) => [goal.id, goal]));

export const getGoal = (goalId) => GOALS_BY_ID.get(goalId) || null;

export const getMotivationConfig = (motivationLevel) =>
  MOTIVATION_LEVELS[motivationLevel] || MOTIVATION_LEVELS[DEFAULT_MOTIVATION_LEVEL];

/** 表示用にカテゴリ順でまとめる。カテゴリの並びは goals.json の出現順。 */
export const getGoalsByCategory = () => {
  const grouped = new Map();
  for (const goal of GOALS) {
    if (!grouped.has(goal.category)) grouped.set(goal.category, []);
    grouped.get(goal.category).push(goal);
  }
  return [...grouped.entries()].map(([category, goals]) => ({ category, goals }));
};

/** 選択された目標のうち、最も多くの語彙を要求するものを目標値とする。 */
export const getRequiredVocabulary = (goalIds = []) =>
  goalIds.reduce((max, goalId) => {
    const goal = getGoal(goalId);
    return goal ? Math.max(max, goal.requiredVocabulary) : max;
  }, 0);

/** 選択された目標から到達すべき単語レベル（1〜7）を求める。 */
export const getTargetLevel = (goalIds = []) =>
  goalIds.reduce((max, goalId) => {
    const goal = getGoal(goalId);
    return goal ? Math.max(max, goal.targetLevel) : max;
  }, 0);

/** 選択された目標に紐づく推奨教材IDを重複なしで返す。 */
export const getRecommendedTextbooks = (goalIds = []) => {
  const textbooks = new Set();
  for (const goalId of goalIds) {
    const goal = getGoal(goalId);
    if (!goal) continue;
    for (const textbookId of goal.recommendedTextbooks || []) {
      textbooks.add(textbookId);
    }
  }
  return [...textbooks];
};

/** goal.targets（[{goalId, displayName}]）から goalId の配列を取り出す。 */
export const toGoalIds = (targets = []) =>
  targets.map((target) => (typeof target === 'string' ? target : target?.goalId)).filter(Boolean);

/* ===== 単語レベル =====
 *
 * 単語データの level は 1〜7 しかない。8以上のレベルには単語が0語で、
 * eikenLevels に「1級」は一度も現れない（実データで確認済み）。
 * 以前は LevelBadge / TestResult / StudentDashboard / AdminDashboard の
 * 4箇所に別々の対応表があり、同じレベル7を「英検準1級」と「英検1級」で
 * 食い違って表示していた。ここを唯一の出どころにする。
 */

export const LEVELS = levelsJson;
export const MIN_WORD_LEVEL = 1;
export const MAX_WORD_LEVEL = LEVELS.length;

const LEVELS_BY_NUMBER = new Map(LEVELS.map((entry) => [entry.level, entry]));

export const getLevel = (level) => LEVELS_BY_NUMBER.get(Number(level)) || null;

/** 1〜7へ丸める */
export const clampLevel = (level) =>
  Math.min(MAX_WORD_LEVEL, Math.max(MIN_WORD_LEVEL, Math.round(Number(level) || MIN_WORD_LEVEL)));

/** 「中学標準」など。未測定は null。 */
export const getLevelLabel = (level) => getLevel(level)?.label ?? null;

/** 「英検4級 / A1」形式 */
export const getLevelEquivalent = (level) => {
  const entry = getLevel(level);
  return entry ? `${entry.eiken} / ${entry.cefr}` : '';
};
