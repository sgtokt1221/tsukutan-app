/**
 * 単語カードを動かしている最中に「離すとどうなるか」を決める。
 *
 * **決まるかどうかは `flashcardGesture` に聞く。** ここで距離を別に持つと、
 * 札は「決まり」と言っているのに離しても何も起きない、が起きる。
 *
 * 「次は何日後」は、離したときに実際に書く計算（`nextSchedule`）と同じもので出す。
 * やる気のペースも、採点するときに渡すのと同じもの（`motivationLevel`）で計算する。
 * **元にするのは保存済みの記録（reviewWords の文書）。カードの語ではない**
 * （→ `useNextInterval`）。自由学習や毎日みる単語のカードは記録を持っていないので、
 * カードで計算すると、17日後に書くのに「明日」と出ていた（2026-09-26）。
 */
import { flashcardGesture, TAP_SLOP, TEST_SWIPE, isUpward, STRICT_UP_SWIPE } from './cardGestures';
import { ANSWER_QUALITY, nextSchedule } from './reviewScheduling';
import { getMotivationConfig } from '../config';

/** これより動かしたら札を出す。タップのぶれで出さない */
const SHOW_FROM = TAP_SLOP * 2;

/** 決まるまでの距離（`flashcardGesture` の閾値と同じ）。円の埋まり具合に使うだけ */
const COMMIT_AT = 100;

/**
 * @returns {{ kind: 'good'|'again'|'remove', progress: number, locked: boolean } | null}
 */
export function swipeIntentAt(dx, dy, allowSwipeUp) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let kind = null;
  let dist = 0;
  if (ax > ay && ax >= SHOW_FROM) {
    kind = dx > 0 ? 'good' : 'again';
    dist = ax;
  } else if (isUpward(dx, dy, allowSwipeUp) && ay >= SHOW_FROM) {
    kind = 'remove';
    dist = ay;
  }
  if (!kind) return null;
  const locked = flashcardGesture(dx, dy, allowSwipeUp) === kind;
  // 新しい単語の上スワイプは長く払う（→ STRICT_UP_SWIPE）。札の満ち方もそれに合わせる
  const commitAt = kind === 'remove' && allowSwipeUp === 'strict' ? STRICT_UP_SWIPE : COMMIT_AT;
  return { kind, progress: locked ? 1 : Math.min(0.95, dist / commitAt), locked };
}

/**
 * 単語力チェックテストの札。横にしか動かず、`TEST_SWIPE` 以上で答えになる
 * （VocabularyCheckTest の handleDragEnd と同じ閾値）。
 */
export function testIntentAt(dx) {
  const ax = Math.abs(dx);
  if (ax < SHOW_FROM) return null;
  const locked = ax >= TEST_SWIPE;
  return { kind: dx > 0 ? 'good' : 'again', progress: locked ? 1 : Math.min(0.95, ax / TEST_SWIPE), locked };
}

/**
 * 「わかった」にしたら、次に出るのは何日後か。
 * @param {object|null} saved 保存済みの記録（reviewWords の文書）。無ければはじめての語
 * @param {string} [motivationLevel] 生徒のペース。無ければ普通（updateUserWordProgress と同じ）
 */
export function nextIntervalDays(saved, motivationLevel) {
  const { interval } = nextSchedule(saved || {}, ANSWER_QUALITY.good, getMotivationConfig(motivationLevel));
  return interval;
}

/**
 * 何度も「わかった」を続けたとき、間がどう伸びるか（初回の案内の図に使う）。
 * @param {number} count 何回ぶん
 * @returns {number[]} 例：普通なら [1, 6, 17, 48]
 */
export function reviewGaps(count, motivationLevel) {
  const config = getMotivationConfig(motivationLevel);
  const gaps = [];
  let state = { interval: 0, repetitions: 0, easeFactor: 2.5 };
  for (let i = 0; i < count; i++) {
    state = nextSchedule(state, ANSWER_QUALITY.good, config);
    gaps.push(state.interval);
  }
  return gaps;
}

/** 日数を言葉に。まだ分からない（記録を読んでいる）ときは日数を言わない */
export const daysText = (days) => {
  if (!Number.isFinite(days)) return '次に出るまでの間があく';
  return days <= 1 ? '明日また出る' : `${days}日後にまた出る`;
};

/**
 * 札の文言。
 * @param {'good'|'again'|'remove'} kind
 * @param {{ days: number|null, policy: { removeShort: string, removePlainHint: string } }} ctx
 */
export function intentText(kind, { days, policy }) {
  if (kind === 'good') return { title: 'わかった', detail: daysText(days) };
  if (kind === 'again') return { title: 'もう一度', detail: '今日のうちに、また出る' };
  return { title: policy.removeShort, detail: policy.removePlainHint };
}

/** 単語力チェックテストの札の文言 */
export function testIntentText(kind) {
  return kind === 'good'
    ? { title: 'わかる', detail: '答えを見て、次の問題へ' }
    : { title: 'わからない', detail: '答えを見て、次の問題へ' };
}
