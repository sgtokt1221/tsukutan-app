import RANKS from '../config/ranks.json';

/**
 * ランク（E 〜 SS）の判定。
 * ASSESSMENT_RANK_SYSTEM_PLAN.md 3章 / 8.4。
 *
 * ランクは「実力テストで確認できた能力」を表す。学習回数や連続日数では
 * 上がらない（計画書2.1）。
 */

export const RANK_LIST = RANKS.ranks;
export const RANK_IDS = RANK_LIST.map((rank) => rank.id);
export const SCORE_MIN = RANKS.scoreMin;
export const SCORE_MAX = RANKS.scoreMax;
export const DISCLAIMER = RANKS.disclaimer;
export const RANKS_VERSION = RANKS.version;

/** 未受験。ランクには含めない（計画書3.1）。 */
export const UNMEASURED = { id: null, label: '未測定' };

const clampScore = (score) =>
  Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));

/** 能力スコアからランク定義を返す。数値でなければ null（未測定）。 */
export const rankForScore = (score) => {
  if (!Number.isFinite(score)) return null;
  const value = clampScore(score);
  return RANK_LIST.find((rank) => value >= rank.min && value <= rank.max) || null;
};

export const getRank = (rankId) => RANK_LIST.find((rank) => rank.id === rankId) || null;

/** 並び順の添字。比較に使う。未知は -1。 */
export const rankIndex = (rankId) => RANK_IDS.indexOf(rankId);

/** ひとつ上のランク。最上位なら null。 */
export const nextRank = (rankId) => {
  const index = rankIndex(rankId);
  if (index < 0 || index >= RANK_LIST.length - 1) return null;
  return RANK_LIST[index + 1];
};

/**
 * 判定に使えるランクか。
 * SS は C1 問題バンクが未整備なので正式判定しない（計画書2.3）。
 */
export const isAwardable = (rankId) => {
  const rank = getRank(rankId);
  return Boolean(rank) && !rank.locked;
};

/**
 * 正式に付与できる範囲へ丸める。
 * ロックされたランクに届いても、ひとつ下までしか出さない。
 */
export const clampToAwardable = (rankId) => {
  let index = rankIndex(rankId);
  if (index < 0) return null;
  while (index >= 0 && RANK_LIST[index].locked) index -= 1;
  return index >= 0 ? RANK_LIST[index].id : null;
};

/** 次のランクまであと何点か。最上位・未測定なら null。 */
export const pointsToNextRank = (score) => {
  const rank = rankForScore(score);
  if (!rank) return null;
  const next = nextRank(rank.id);
  if (!next) return null;
  return Math.max(0, next.min - clampScore(score));
};

/** 現ランク内の進み具合（0〜1）。 */
export const progressWithinRank = (score) => {
  const rank = rankForScore(score);
  if (!rank) return 0;
  const span = rank.max - rank.min;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (clampScore(score) - rank.min) / span));
};

/**
 * 昇格・維持・降格を決める（計画書8.4）。
 *
 * 昇格は信頼区間の下限が次ランク境界を超えたときだけ。点推定だけで
 * 上げると、1回の当たりで上がって次に下がる。
 * 降格は上限が現ランク下限を下回る結果が2回続いたときだけ。
 *
 * @param {object} params
 * @param {string|null} params.currentRankId 今のランク
 * @param {number} params.score 能力スコア
 * @param {number} params.confidenceLow 信頼区間の下限
 * @param {number} params.confidenceHigh 信頼区間の上限
 * @param {number} params.consecutiveLowResults 現ランク下限を下回った連続回数（今回を含まない）
 */
export const evaluateRankChange = ({
  currentRankId,
  score,
  confidenceLow,
  confidenceHigh,
  consecutiveLowResults = 0,
}) => {
  const measured = rankForScore(score);
  if (!measured) {
    return { rankId: currentRankId, outcome: 'unmeasured', consecutiveLowResults };
  }

  const awardable = clampToAwardable(measured.id);
  const current = getRank(currentRankId);

  // 初回はそのまま付与する
  if (!current) {
    return { rankId: awardable, outcome: 'initial', consecutiveLowResults: 0 };
  }

  const low = Number.isFinite(confidenceLow) ? confidenceLow : score;
  const high = Number.isFinite(confidenceHigh) ? confidenceHigh : score;

  const next = nextRank(current.id);
  if (next && !next.locked && low >= next.min) {
    return { rankId: next.id, outcome: 'promoted', consecutiveLowResults: 0 };
  }

  if (high < current.min) {
    const streak = consecutiveLowResults + 1;
    // 1回の誤差では下げない
    if (streak >= 2) {
      const demoted = rankForScore(high);
      return {
        rankId: clampToAwardable(demoted ? demoted.id : RANK_IDS[0]),
        outcome: 'demoted',
        consecutiveLowResults: 0,
      };
    }
    return { rankId: current.id, outcome: 'held-low', consecutiveLowResults: streak };
  }

  // 次の境界に手が届いている状態
  if (next && !next.locked && high >= next.min) {
    return { rankId: current.id, outcome: 'near-promotion', consecutiveLowResults: 0 };
  }

  return { rankId: current.id, outcome: 'held', consecutiveLowResults: 0 };
};

/** 自己ベストは下がっても消さない（計画書8.4）。 */
export const bestRankOf = (a, b) => {
  const ia = rankIndex(a);
  const ib = rankIndex(b);
  if (ia < 0) return ib < 0 ? null : b;
  if (ib < 0) return a;
  return ia >= ib ? a : b;
};

/**
 * 移行期間用。既存の level(1〜7) を能力スコアの代表値へ写す。
 *
 * 現行テストは自己申告型で、計画書4.1により正式ランク判定には使えない。
 * ランク表示を先に出すための暫定で、信頼度は low 固定。
 */
export const scoreFromLegacyLevel = (level) => {
  const key = String(level);
  const score = RANKS.levelToScore[key];
  return Number.isFinite(score) ? score : null;
};
