import { useEffect, useLayoutEffect, useRef } from 'react';
import { fitTextInBoxes } from './fitTextSize';

/**
 * 単語帳モードの左側（問題の文字）を、カードいっぱいの大きさにする。
 *
 * 学習カードと復習カードで同じ処理なので、ここ1箇所に置く。
 * 対象は data-fit-text を持つ要素。
 *
 * @param {Array} deps 並べ直したら測り直す依存（単語・倍率・向きなど）
 */
export const useFitWordbookText = (deps = []) => {
  const containerRef = useRef(null);

  const run = () => {
    const root = containerRef.current;
    if (!root) return;
    fitTextInBoxes(Array.from(root.querySelectorAll('[data-fit-text]')));
  };

  // 描画直後に合わせる。paint 前に決めたいので useLayoutEffect。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(run, deps);

  // 幅が変わったら測り直す（画面の回転・ウィンドウ幅の変更）
  useEffect(() => {
    const root = containerRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;

    let frame = null;
    const observer = new ResizeObserver(() => {
      // 連続して届くので、次の描画までまとめる
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(run);
    });
    observer.observe(root);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return containerRef;
};

export default useFitWordbookText;
