/**
 * src/logic/dailyPlanMath.js
 *
 * 日次計画の算数だけを切り出したモジュール。Firebase に触らないのでそのままテストできる。
 * IMPLEMENTATION_PLAN.md 8.4 / 10.2。
 */

// 1日に提案する新規語数の上限。これを超える必要がある期限は「達成困難」として扱う。
// 最もやる気が高い設定（30語/日）の倍を上限にしている。
export const MAX_NEW_WORDS_PER_DAY = 60;

// 復習語が多いときに1セッションへ詰め込む上限
export const REVIEW_SESSION_SIZE = 30;

/**
 * その日の新規語数を決める。
 *
 * 期限達成に必要な語数 = ceil(残り語数 / 残り日数)
 * 希望語数             = やる気レベルの設定値
 * 実際の提案値         = max(必要語数, 希望語数) を上限で頭打ち
 *
 * @returns {{preferredNewWords:number, requiredNewWords:number, plannedNewWords:number, isFeasible:boolean}}
 */
export const computeNewWordsQuota = ({
  remainingWords = 0,
  remainingDays = 0,
  preferredNewWords = 0,
  maxPerDay = MAX_NEW_WORDS_PER_DAY,
}) => {
  const words = Math.max(0, Math.floor(remainingWords));
  const days = Math.max(0, Math.floor(remainingDays));
  const preferred = Math.max(0, Math.floor(preferredNewWords));

  // 残り日数が0以下なら「今日中に全部」とみなす
  const requiredNewWords = words === 0 ? 0 : Math.ceil(words / Math.max(1, days));

  const desired = Math.max(requiredNewWords, preferred);
  const plannedNewWords = Math.min(desired, maxPerDay);

  return {
    preferredNewWords: preferred,
    requiredNewWords,
    plannedNewWords,
    isFeasible: requiredNewWords <= maxPerDay,
  };
};

/**
 * 期限までの残り日数。
 * 学習の締め切りは目標日の1ヶ月前。それが過ぎていれば目標日そのものを締め切りにする。
 *
 * @param {Date} today            日本時間の今日0時
 * @param {Date|null} targetDate  日本時間の目標日0時
 */
export const computeRemainingDays = (today, targetDate) => {
  if (!targetDate || Number.isNaN(targetDate.getTime())) return null;

  const deadline = new Date(targetDate);
  deadline.setMonth(deadline.getMonth() - 1);
  if (deadline < today) deadline.setTime(targetDate.getTime());

  const days = Math.ceil((deadline - today) / 86400000);
  // 期限が過去でも0では割れないので最低1日にする
  return Math.max(1, days);
};

/**
 * 複数のリストを順に見て、既出のIDを落とす。
 * 新規・復習・隣接語へ同じ単語が二重に入るのを防ぐ（計画書10.2.7）。
 *
 * @param {...Array} lists 優先度の高い順
 * @returns {Array[]} 入力と同じ数の配列。後のリストから重複が除かれている。
 */
export const dedupeAcross = (...lists) => {
  const seen = new Set();
  return lists.map((list) =>
    (list || []).filter((item) => {
      const id = item?.id;
      if (!id) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
  );
};

/**
 * 復習語が多いときにセッションへ分割する（計画書10.2.8）。
 * 1セッション分だけ渡して、残りは次のセッションへ回す。
 */
export const splitIntoSessions = (words = [], size = REVIEW_SESSION_SIZE) => {
  const chunkSize = Math.max(1, size);
  const sessions = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    sessions.push(words.slice(i, i + chunkSize));
  }
  return sessions;
};

/**
 * 復習候補を並べる。期日を過ぎたものを必ず先に置き、その中で忘却度の高い順にする
 * （計画書10.2.6）。
 */
export const sortReviewCandidates = (entries = []) =>
  [...entries].sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return (b.forgettingScore || 0) - (a.forgettingScore || 0);
  });
