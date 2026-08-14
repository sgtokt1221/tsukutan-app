import LEVELS from '../config/levels.json';

/**
 * 復習の卒業ぐあいから、いまのレベルを見積もる。
 *
 * users/{uid}.level は語彙力チェックテストでしか動かない。テストを受け直す
 * までは、どれだけ覚えても表示が古いままになる。そこで別に見積もりを持ち、
 * 「テストを受け直しませんか」と促すのに使う。
 *
 * **出題には効かせない。** 見積もりを外したまま新規語の範囲を広げると、
 * 生徒は理由が分からないまま急に難しくなって手が止まる。測った値（level）は
 * そのまま残し、こちらは表示だけに使う。
 *
 * 分母はマスターに実在する語数を数える（levels.json の wordsRequired は
 * 目標値であって、収録語数ではない）。
 */

const MAX_LEVEL = Math.max(...LEVELS.map((entry) => entry.level));

/** このレベルは越えた、と見なす卒業割合。 */
export const CLEAR_RATIO = 0.8;

/**
 * @param {object}   params
 * @param {Array}    params.master     単語マスター（level を持つ）
 * @param {Array}    params.reviewWords users/{uid}/reviewWords の中身
 * @returns {{ estimated: number|null, cleared: number, ratios: object, nextRatio: number }}
 *   estimated 見積もったレベル。まだどのレベルも越えていなければ null
 *   cleared   越えたと見なせる一番上のレベル
 *   ratios    レベルごとの卒業割合（0〜1）
 *   nextRatio 次のレベルの卒業割合。あと少しかを見せるのに使う
 */
export const estimateLevel = ({ master = [], reviewWords = [] } = {}) => {
  const total = {};
  for (const word of master) {
    const level = word?.level;
    if (level) total[level] = (total[level] || 0) + 1;
  }

  const mastered = {};
  for (const word of reviewWords) {
    if (word?.status !== 'mastered') continue;
    const level = word?.level;
    if (level) mastered[level] = (mastered[level] || 0) + 1;
  }

  const ratios = {};
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const denominator = total[level] || 0;
    ratios[level] = denominator === 0 ? 0 : (mastered[level] || 0) / denominator;
  }

  // 下から順に見て、途切れたところで止める。レベル3を飛ばして5だけ
  // 覚えていても「レベル6相当」とは言えない。
  let cleared = 0;
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    if ((total[level] || 0) === 0) break;
    if (ratios[level] < CLEAR_RATIO) break;
    cleared = level;
  }

  return {
    estimated: cleared === 0 ? null : Math.min(cleared + 1, MAX_LEVEL),
    cleared,
    ratios,
    nextRatio: ratios[Math.min(cleared + 1, MAX_LEVEL)] || 0,
  };
};

/**
 * 見積もりのほうが上か。テストを促すかどうかの判断。
 * 同じか下なら、わざわざ言うことは無い。
 */
export const isAheadOfAssessment = (estimated, assessedLevel) =>
  Boolean(estimated) && estimated > (assessedLevel || 0);
