import { useEffect, useRef } from 'react';

/**
 * 手が空いたときに1回走らせる。requestIdleCallback が無い端末（iOS Safari）では次の番に回す。
 * 戻り値で取り消せる。
 */
export const runWhenIdle = (fn, { timeout = 2000, win = typeof window !== 'undefined' ? window : undefined } = {}) => {
  if (win && typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(() => fn(), { timeout });
    return () => win.cancelIdleCallback?.(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
};

/**
 * `ready` になってから、手が空いたときに `start` を1回だけ走らせる。
 *
 * 大きな読み込み（単語マスター）を、ホームのデータ取得と回線を取り合わない
 * ように後ろへ回すためのもの。**使う画面ではその場で待つ形を残すこと**
 * （ここは先読みでしかない）。`now` が立っていれば手が空くのを待たずに走らせる。
 */
export const useStartWhenIdle = (ready, start, { now = false } = {}) => {
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !(ready || now)) return undefined;
    const run = () => {
      if (started.current) return;
      started.current = true;
      start();
    };
    if (now) {
      run();
      return undefined;
    }
    return runWhenIdle(run);
  }, [ready, now, start]);
};
