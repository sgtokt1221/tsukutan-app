import { useLayoutEffect } from 'react';

/**
 * 欄に入りきらない文字は、折り返す前にまず縮める（2026-09-26）。
 *
 * `data-fit="12"` を付けた要素を、1行（nowrap）で欄の幅に収まる大きさまで縮める。
 * 数字はそこまでしか縮めない文字の大きさ（px）。読めるかどうかは倍率ではなく実寸で決まるので、
 * 単語帳の文字サイズを大きくしているほど深く縮められる。下限でも入らないときは少ない行数で折り返す（`is-wrap`・`fitScale`）。
 * 大きさは CSS 変数 `--fit` で渡すので、文字の大きさの式は CSS 側に置いたまま掛けるだけ。
 *
 * 1枚ずつ測ると読み書きが交互になって全カードぶんレイアウトが走るので、
 * 「全部を戻す → 全部を測る → 全部に書く」の3段で1回にまとめる。
 */

// 折り返すときは語の切れ目で行末が余るので、そのぶんの見込み
const WRAP_SLACK = 0.9;

/**
 * 行数を先に減らし、その行数で入るいちばん大きい文字にする。
 * 下限まで縮めても1行に入らなければ、下限で入る行数 n を求め、n 行に収まる大きさで折り返す
 * （小さくしたうえに折り返す、がいちばん読みにくいので避ける）。
 */
export const fitScale = (natural, available, floor, reserve = 0) => {
  // reserve：1行目だけ右に空ける幅（「隠す」の下に回り込ませる。2行目からは欄いっぱい使える）
  const first = available - reserve;
  if (!(natural > 0) || !(first > 0) || natural <= first) return { scale: 1, wrap: false };
  const scale = first / natural;
  if (scale >= floor) return { scale, wrap: false };
  const lines = Math.ceil((natural * floor + reserve) / (available * WRAP_SLACK));
  return { scale: Math.max(floor, Math.min(1, (lines * available * WRAP_SLACK - reserve) / natural)), wrap: true, lines };
};

// 測るのは文字そのものの幅と、内側（padding を除いた）幅。scrollWidth は padding の扱いが
// ブラウザで揺れ、右を空けた欄で「入っている」と誤って判定した
const textWidth = (el) => {
  const range = document.createRange();
  // 測れない環境（テストの jsdom など）では縮めない（0 を返すと fitScale がそのままにする）
  if (typeof range.getBoundingClientRect !== 'function') return 0;
  range.selectNodeContents(el);
  // 回り込み用の空き（.wordbook-notch）は文字ではないので測らない
  const notch = el.firstElementChild?.classList.contains('wordbook-notch') ? el.firstElementChild : null;
  if (notch) range.setStartAfter(notch);
  return range.getBoundingClientRect().width;
};

const contentWidth = (el) => {
  const style = getComputedStyle(el);
  return el.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
};

// 英語は語の途中で切らない。1語は下限を越えてでも1行に縮め、句は語の切れ目でだけ折り返す
const LATIN_MIN = 0.3;
const isLatin = (text) => /[A-Za-z]/.test(text) && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(text);

/** 英語の欄：いちばん長い語が1行に入る大きさを上限にする（語は文字数の比で幅を見積もる） */
export const fitLatin = (text, natural, available, floor, reserve = 0) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const longest = Math.max(...words.map((w) => w.length), 1);
  const longestWidth = natural * (longest / Math.max(text.trim().length, 1));
  const cap = (available - reserve) / longestWidth;
  if (words.length <= 1) {
    const scale = Math.min(1, cap);
    return { scale: Math.max(LATIN_MIN, scale), wrap: false };
  }
  const base = fitScale(natural, available, floor, reserve);
  return { ...base, scale: Math.max(LATIN_MIN, Math.min(base.scale, cap)) };
};

export const fitAll = (root) => {
  if (!root) return;
  const els = Array.from(root.querySelectorAll('[data-fit]'));
  els.forEach((el) => {
    el.style.setProperty('--fit', '1');
    el.classList.remove('is-wrap');
  });
  const results = els.map((el) => {
    const sizeEl = el.querySelector('.wordbook-meaning, .wordbook-word__text') || el;
    const fontPx = parseFloat(getComputedStyle(sizeEl).fontSize) || 16;
    const floor = Math.min(1, (Number(el.dataset.fit) || 12) / fontPx);
    const args = [textWidth(el), contentWidth(el), floor, Number(el.dataset.fitReserve) || 0];
    const text = el.textContent || '';
    return { ...(isLatin(text) ? fitLatin(text, ...args) : fitScale(...args)), floor };
  });
  els.forEach((el, i) => {
    const { scale, wrap } = results[i];
    if (scale !== 1) el.style.setProperty('--fit', scale.toFixed(3));
    if (wrap) el.classList.add('is-wrap');
  });
  // 折り返したものは、見込んだ行数に本当に収まったかを数える。
  // 語の切れ目・禁則・「隠す」の回り込みで見込みより1行増えることがあるので、そのときは少しずつ縮める
  let pending = els
    .map((el, i) => ({ el, ...results[i], planned: plannedLines(results[i]) }))
    .filter((r) => r.wrap && r.planned > 0);
  for (let round = 0; round < 6 && pending.length > 0; round += 1) {
    const over = pending.filter((r) => linesOf(r.el) > r.planned && r.scale > r.floor);
    over.forEach((r) => {
      r.scale = Math.max(r.floor, r.scale * 0.92);
      r.el.style.setProperty('--fit', r.scale.toFixed(3));
    });
    pending = over;
  }
};

const plannedLines = (result) => result.lines || 0;

const linesOf = (el) => {
  const sizeEl = el.querySelector('.wordbook-meaning, .wordbook-word__text') || el;
  const lineHeight = parseFloat(getComputedStyle(sizeEl).lineHeight) || 1;
  const style = getComputedStyle(el);
  const height = el.clientHeight - parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0);
  return Math.round(height / lineHeight);
};

export const useFitText = (ref, deps) => {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    fitAll(root);
    // 幅が変わったとき（回転・文字サイズの倍率）に測り直す。高さだけの変化では測らない
    // （縮めた結果で高さが変わるたびに測り直すと、無駄に回る）
    if (typeof ResizeObserver === 'undefined') return undefined;
    let lastWidth = root.clientWidth;
    let lastFont = getComputedStyle(root).getPropertyValue('--wordbook-zoom');
    let frame = 0;
    const observer = new ResizeObserver(() => {
      const width = root.clientWidth;
      const font = getComputedStyle(root).getPropertyValue('--wordbook-zoom');
      if (width === lastWidth && font === lastFont) return;
      lastWidth = width;
      lastFont = font;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitAll(root));
    });
    observer.observe(root);
    // 書体が後から届くと字の幅が変わる。届いたら測り直す（先に測った幅のままだと、縮め足りずに折れる）
    const refit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitAll(root));
    };
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    fonts?.ready?.then(refit);
    fonts?.addEventListener?.('loadingdone', refit);
    return () => {
      fonts?.removeEventListener?.('loadingdone', refit);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};
