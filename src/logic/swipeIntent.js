/**
 * 単語カードを動かしている最中に「離すとどうなるか」を決める。
 *
 * **決まるかどうかは `flashcardGesture` に聞く。** ここで距離を別に持つと、
 * 札は「決まり」と言っているのに離しても何も起きない、が起きる。
 *
 * 「次は何日後」は、離したときに実際に書く計算（`nextSchedule`）と同じもので出す。
 * 学習画面は `updateUserWordProgress` をやる気レベル無しで呼ぶので、ここも普通で計算する。
 * カードの語が間隔の記録を持っていない（新しい語）ときは「はじめて」として計算する。
 */
import { flashcardGesture, TAP_SLOP } from './cardGestures';
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
  } else if (allowSwipeUp && dy < 0 && ay > ax && ay >= SHOW_FROM) {
    kind = 'remove';
    dist = ay;
  }
  if (!kind) return null;
  const locked = flashcardGesture(dx, dy, allowSwipeUp) === kind;
  return { kind, progress: locked ? 1 : Math.min(0.95, dist / COMMIT_AT), locked };
}

/** 「わかった」にしたら、次に出るのは何日後か */
export function nextIntervalDays(word) {
  const { interval } = nextSchedule(word || {}, ANSWER_QUALITY.good, getMotivationConfig());
  return interval;
}

/**
 * 何度も「わかった」を続けたとき、間がどう伸びるか（初回の案内の図に使う）。
 * @param {number} count 何回ぶん
 * @returns {number[]} 例：普通なら [1, 6, 17, 48]
 */
export function reviewGaps(count) {
  const config = getMotivationConfig();
  const gaps = [];
  let state = { interval: 0, repetitions: 0, easeFactor: 2.5 };
  for (let i = 0; i < count; i++) {
    state = nextSchedule(state, ANSWER_QUALITY.good, config);
    gaps.push(state.interval);
  }
  return gaps;
}

/** 日数を言葉に */
export const daysText = (days) => (days <= 1 ? '明日また出る' : `${days}日後にまた出る`);

/**
 * 札の文言。
 * @param {'good'|'again'|'remove'} kind
 * @param {{ word?: object, policy: { removeShort: string, removePlainHint: string } }} ctx
 */
export function intentText(kind, { word, policy }) {
  if (kind === 'good') return { title: 'わかった', detail: daysText(nextIntervalDays(word)) };
  if (kind === 'again') return { title: 'もう一度', detail: '今日のうちに、また出る' };
  return { title: policy.removeShort, detail: policy.removePlainHint };
}
