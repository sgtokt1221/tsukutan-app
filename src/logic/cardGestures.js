/**
 * 単語カードの指の動きを「何をしたか」に読み替える。**判定の正本はここだけ。**
 *
 * 以前は新規と復習の部品にそれぞれ書いてあり、マウスと指でも別々だった。
 * そのせいで「復習はマウスだと上スワイプが効かない」「片方だけ1回タップでめくれない」
 * のような食い違いが何度も出た（2026-09-23 に1つにまとめた）。
 */

/** これより動かなければタップ（めくる）とみなす。px */
export const TAP_SLOP = 10;

/**
 * これだけ押したままなら「長押し」。押している間だけ答えを見せる（2026-09-26）。ミリ秒。
 * 学習カードと単語力チェックテストで同じ値を使う
 */
export const HOLD_MS = 350;

/** フラッシュカードで、採点・外すとみなす距離。px */
export const FLASHCARD_SWIPE = 100;

/** 単語力チェックテストで、答えとみなす距離。px（横にしか動かない） */
export const TEST_SWIPE = 50;

/** 単語帳の一覧で、採点とみなす距離。px（一覧は縦にたぐるので短め） */
export const WORDBOOK_SWIPE = 50;

/**
 * フラッシュカード（1枚ずつ）で指を離したとき。
 *
 * @param {number} dx 横の移動量（右が正）
 * @param {number} dy 縦の移動量（下が正）
 * @param {boolean} allowSwipeUp 上スワイプで外すモードか（→ logic/studyMode.js）
 * @returns {'good'|'again'|'remove'|'flip'|null}
 */
export function flashcardGesture(dx, dy, allowSwipeUp) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > ay && ax > FLASHCARD_SWIPE) return dx > 0 ? 'good' : 'again';
  if (allowSwipeUp && ay > ax && ay > FLASHCARD_SWIPE && dy < 0) return 'remove';
  if (ax < TAP_SLOP && ay < TAP_SLOP) return 'flip';
  return null;
}

/**
 * 単語帳（一覧）で指を離したとき。**縦は一覧のスクロールに使う**ので採点だけ。
 * 外すのはカードの ✓ ボタン。
 *
 * @returns {'good'|'again'|null}
 */
export function wordbookGesture(dx, dy) {
  if (Math.abs(dx) > WORDBOOK_SWIPE && Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'good' : 'again';
  return null;
}

/** その座標にある単語帳カードを返す。掴んだカードを特定するのに使う。 */
export function findCardAtPoint(x, y) {
  for (const card of document.querySelectorAll('[data-card-index]')) {
    const rect = card.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return card;
  }
  return null;
}
