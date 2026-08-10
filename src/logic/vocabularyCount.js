/**
 * 「到達語数」の数え方。
 *
 * これまでは
 *   実力テスト完了時に「判定レベル以下の語を全部知っている」として一括計上し、
 *   さらに新規学習のたびに increment で足していた。
 * この足し算のせいで、アプリ収録のユニーク語数6,491語を超える7,952語が
 * 表示されていた（LEARNING_LOGIC_FIX_PLAN.md §2.3 / §5.2 の二重加算）。
 *
 * 到達語数は「和集合」で数える。足さない。
 *
 *   到達 = 実力テストで大丈夫とみなした語 ∪ 復習完了まで到達した語
 *
 * 復習完了（status: mastered）の語の多くは判定レベル以下にあり、
 * すでに前者へ含まれている。二重に数えないよう、判定レベルより上の
 * 語だけを足す。
 */

/**
 * 判定レベル以下の語数。実力テストが「大丈夫だろう」とみなす範囲。
 *
 * @param {Array} master 単語マスター
 * @param {number} assessedLevel 実力テストの判定レベル（1〜7、0や未測定は0語）
 */
export const assessedWordCount = (master = [], assessedLevel = 0) => {
  if (!Number.isFinite(assessedLevel) || assessedLevel <= 0) return 0;
  const ids = new Set();
  for (const word of master) {
    if (!word || (word.level ?? 0) > assessedLevel) continue;
    ids.add(word.id || `${word.word}|${word.partOfSpeech}|${word.meaning}`);
  }
  return ids.size;
};

/**
 * 復習完了のうち、判定レベルより上にある語の数。
 * 判定レベル以下のものは assessedWordCount に含まれているので足さない。
 *
 * @param {Array} reviewWords users/{uid}/reviewWords の中身
 * @param {number} assessedLevel 実力テストの判定レベル
 */
export const masteredBeyondAssessment = (reviewWords = [], assessedLevel = 0) => {
  const level = Number.isFinite(assessedLevel) ? assessedLevel : 0;
  const ids = new Set();
  for (const word of reviewWords) {
    if (!word || word.migratedTo) continue;
    if (word.status !== 'mastered') continue;
    if ((word.level ?? 0) <= level) continue;
    ids.add(word.id || word.word);
  }
  return ids.size;
};

/**
 * 到達語数。実力テストの範囲と、そこから外れた復習完了語の和。
 *
 * @returns {{assessed:number, masteredBeyond:number, total:number}}
 */
export const reachedWordCount = ({ master = [], reviewWords = [], assessedLevel = 0 } = {}) => {
  const assessed = assessedWordCount(master, assessedLevel);
  const beyond = masteredBeyondAssessment(reviewWords, assessedLevel);
  return { assessed, masteredBeyond: beyond, total: assessed + beyond };
};

/** 達成率。100%を超えないよう頭打ちにする。 */
export const achievementPercentage = (reached, target) => {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.round((reached / target) * 100));
};
