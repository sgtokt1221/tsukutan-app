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

/**
 * 新しい単語（今日の新規・おかわり・毎日みる単語）で「外す」とみなす上への距離。px
 *
 * 2026-09-23 に「指が少し上に流れただけで外れる」ので新規では上スワイプを切ったが、
 * 2026-09-27 に「戻して」と言われた。**はっきり上へ払ったときだけ**効かせる:
 * 普通より長く（160px）、しかも横の2倍以上は上へ動いていること。迷う動きは何もしない。
 */
export const STRICT_UP_SWIPE = 160;

/**
 * 上へ払ったとみなせるか。`mode` は studyMode の `swipeUp`（true／'strict'／false）。
 * **判定・札・色・手応えの4か所が同じこの関数を見る**（食い違うと「黄色なのに外れない」になる）
 */
export function upSwipeReached(dx, dy, mode, dist = mode === 'strict' ? STRICT_UP_SWIPE : FLASHCARD_SWIPE) {
  return isUpward(dx, dy, mode) && Math.abs(dy) > dist;
}

/** 上へ向かっているか（距離は見ない）。strict は横の2倍以上 */
export function isUpward(dx, dy, mode) {
  if (!mode || dy >= 0) return false;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return mode === 'strict' ? ay > ax * 2 : ay > ax;
}

/** 単語力チェックテストで、答えとみなす距離。px（横にしか動かない） */
export const TEST_SWIPE = 50;

/** 単語帳の一覧で、採点とみなす距離。px（一覧は縦にたぐるので短め） */
export const WORDBOOK_SWIPE = 50;

/**
 * フラッシュカード（1枚ずつ）で指を離したとき。
 *
 * @param {number} dx 横の移動量（右が正）
 * @param {number} dy 縦の移動量（下が正）
 * @param {boolean|'strict'} allowSwipeUp 上スワイプで外すモードか（→ logic/studyMode.js）
 * @returns {'good'|'again'|'remove'|'flip'|null}
 */
export function flashcardGesture(dx, dy, allowSwipeUp) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > ay && ax > FLASHCARD_SWIPE) return dx > 0 ? 'good' : 'again';
  if (upSwipeReached(dx, dy, allowSwipeUp)) return 'remove';
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
