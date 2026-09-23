/**
 * 単語カードの記録（`onSaveLog` に渡すもの）の形。**正本はここだけ。**
 *
 * ## 形が2種類ある（2026-09-23 時点。わざと残している）
 * 新規は `duration`（ms）、復習の途中終了は `durationInSeconds`。
 * 管理画面（`AdminDashboard.js`）は `durationInSeconds` しか読まないので、
 * **新規の時間は管理画面の合計に入っていない**。そろえると管理画面の数字が変わるので、
 * 部品を1つにまとめたときは形を変えずに持ち越した（別の判断にする）。
 */

/**
 * 最後の1語まで終えたとき。
 *
 * @param {'learning'|'review'} schema
 * @param {object} p
 * @param {object} p.sessionInfo
 * @param {number} p.index 最後に出していた位置
 * @param {number} p.activeMs 測った時間
 * @param {number} p.graduatedCount 復習で「わかった」と「もう覚えた」の数
 */
export function finishedLog(schema, { sessionInfo, index, activeMs, graduatedCount }) {
  const log = { ...sessionInfo, index, timestamp: new Date(), duration: activeMs };
  if (schema === 'review') log.graduatedCount = graduatedCount;
  return log;
}

/**
 * 途中で「終了」を押したとき。**記録しないときは null。**
 *
 * - 新規：最後の1語より手前で閉じたときだけ（続きの位置を残すため）
 * - 復習：5秒を超えて、1語以上進んだか外したときだけ
 */
export function leftLog(schema, { sessionInfo, index, total, activeMs, graduatedCount }) {
  if (schema === 'review') {
    const seconds = activeMs / 1000;
    if (seconds <= 5 || (index === 0 && graduatedCount === 0)) return null;
    return {
      ...sessionInfo,
      wordsReviewed: index + 1,
      wordsGraduated: graduatedCount,
      durationInSeconds: Math.round(seconds),
      timestamp: new Date(),
    };
  }
  if (!sessionInfo || index >= total - 1) return null;
  return { ...sessionInfo, index, timestamp: new Date(), duration: activeMs };
}
