/**
 * スワイプ中にカードを塗る色。
 *
 * 右＝わかった / 左＝もう一度 / 上＝復習完了 の3方向。
 * どれも同じ濃さのベタ塗りにする。以前は上だけ #facc15（原色に近い黄）で、
 * 左右より一段強く出ていた。
 *
 * 学習カードと復習カードで同じ色を使う。以前は同じ意味の色が
 * 2つのファイルに計14か所、しかも違う値で書かれていた。
 */

export const SWIPE_FEEDBACK = {
  neutral: { color: '#ffffff', shadow: 'none' },
  // わかった。回答ボタン（わかった）と同じライム。
  correct: { color: '#d9f99d', shadow: '0 4px 12px rgba(132, 204, 22, 0.25)' },
  // もう一度。回答ボタン（もう一度）と同じ淡い赤。
  incorrect: { color: '#fecaca', shadow: '0 4px 12px rgba(239, 68, 68, 0.25)' },
  // 復習完了（上スワイプ）。左右と同じ濃さの淡い黄。
  graduate: { color: '#fef08a', shadow: '0 4px 12px rgba(234, 179, 8, 0.25)' },
};

/**
 * スワイプ量から、どの向きの手応えを見せるかを決める。
 *
 * @param {number} deltaX 横の移動量
 * @param {number} deltaY 縦の移動量
 * @param {boolean} allowGraduate 上スワイプ（復習完了）を使う画面か
 */
export const swipeFeedbackFor = (deltaX, deltaY, allowGraduate = true) => {
  if (allowGraduate && Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -30) {
    return SWIPE_FEEDBACK.graduate;
  }
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    if (deltaX > 30) return SWIPE_FEEDBACK.correct;
    if (deltaX < -30) return SWIPE_FEEDBACK.incorrect;
  }
  return SWIPE_FEEDBACK.neutral;
};

/**
 * カード要素に手応えの色を塗る。
 *
 * 手応えが無いときは指定を消す。白で上書きすると、判定済みの
 * うっすらした色（.wordbook-card--correct など）まで隠れてしまう。
 */
export const paintSwipeFeedback = (element, feedback) => {
  if (!element) return;
  if (feedback === SWIPE_FEEDBACK.neutral) {
    clearSwipeFeedback(element);
    return;
  }
  element.style.setProperty('background-color', feedback.color, 'important');
  element.style.setProperty('box-shadow', feedback.shadow, 'important');
};

/** スワイプ中に塗った色を消して、CSS の指定に戻す。 */
export const clearSwipeFeedback = (element) => {
  if (!element) return;
  element.style.removeProperty('background-color');
  element.style.removeProperty('box-shadow');
};
