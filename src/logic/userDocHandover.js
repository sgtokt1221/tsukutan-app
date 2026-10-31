/**
 * App が読んだ `users/{uid}` を、ダッシュボードの最初の1回だけに渡す（2026-10-31）。
 *
 * 以前は App（目標が設定済みかを見る）とダッシュボード（ホームを組む）が
 * 同じ文書を続けて2回読んでいて、ホームが出るまでに往復が1回余分にかかった。
 *
 * - **渡すのは1回きり。** 受け取ったら消す。2回目以降（テストのあと・学習のあと・
 *   再試行）は必ずサーバから読み直す——目標を変えた直後などは最新が要る
 * - **目標が設定済みのときだけ渡す。** 未設定なら目標設定の画面を通ってから
 *   ダッシュボードへ来るので、App が読んだものは古い
 * - 古すぎるもの（`MAX_AGE_MS`）と、別の生徒のものは使わない
 */
export const MAX_AGE_MS = 30 * 1000;

let pending = null;

export const handOverUserDoc = (uid, data, now = Date.now()) => {
  pending = uid && data && data.goal && data.goal.isSet ? { uid, data, at: now } : null;
};

export const dropUserDoc = () => {
  pending = null;
};

export const takeUserDoc = (uid, now = Date.now()) => {
  const p = pending;
  pending = null;
  if (!p || p.uid !== uid || now - p.at > MAX_AGE_MS) return null;
  return p.data;
};
