import { DISCLAIMER, RANKS_VERSION, getRank, rankForScore } from './rankLogic';

/**
 * 英検・TOEIC の参考換算。
 * ASSESSMENT_RANK_SYSTEM_PLAN.md 7章。
 *
 * 単語テストだけで公式スコアを断定しない（計画書2.2）。
 * 表示は必ず「相当の目安」「参考レンジ」にし、断定表現を作らない。
 */

export { DISCLAIMER };

/** 信頼度。段階1（CEFR経由の暫定換算）は low 〜 medium まで。 */
export const CONFIDENCE = {
  low: { id: 'low', label: '参考換算・低信頼度' },
  medium: { id: 'medium', label: '参考換算・中信頼度' },
};

/** TOEIC は5点刻みで丸める（計画書13.4）。 */
export const roundToeic = (value) => Math.round(value / 5) * 5;

/**
 * 換算結果を作る。
 *
 * @param {object} params
 * @param {number} params.score 能力スコア
 * @param {'low'|'medium'} [params.confidence] 換算の信頼度
 * @returns {object|null} 未測定なら null
 */
export const buildEquivalency = ({ score, confidence = 'low' } = {}) => {
  const rank = rankForScore(score);
  if (!rank) return null;

  // ロック中のランクの換算は出さない。
  // 「英検1級相当」を根拠なく見せないため（計画書13.4）。
  if (rank.locked) {
    return {
      rankId: rank.id,
      locked: true,
      cefr: null,
      eiken: null,
      toeic: null,
      confidence: CONFIDENCE.low,
      tableVersion: RANKS_VERSION,
      disclaimer: DISCLAIMER,
    };
  }

  return {
    rankId: rank.id,
    locked: false,
    cefr: rank.cefr,
    eiken: rank.eiken,
    toeic: {
      min: roundToeic(rank.toeic.min),
      max: roundToeic(rank.toeic.max),
      label: `TOEIC L&R ${roundToeic(rank.toeic.min)}〜${roundToeic(rank.toeic.max)}点の参考レンジ`,
    },
    confidence: CONFIDENCE[confidence] || CONFIDENCE.low,
    tableVersion: RANKS_VERSION,
    disclaimer: DISCLAIMER,
    // 測っていない技能を明示する（計画書7.3）
    notMeasured: ['Speaking', 'Writing'],
  };
};

/**
 * 信頼区間からランク表示の文言を作る。
 * 境界付近で精度が低いときは断定せず範囲で伝える（計画書3.3）。
 */
export const rankRangeLabel = ({ score, confidenceLow, confidenceHigh }) => {
  const rank = rankForScore(score);
  if (!rank) return '未測定';

  const low = getRank(rankForScore(confidenceLow)?.id)?.id;
  const high = getRank(rankForScore(confidenceHigh)?.id)?.id;

  if (low && high && low !== high) return `${low}〜${high}`;
  return rank.id;
};
