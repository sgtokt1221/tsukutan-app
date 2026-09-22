import React from 'react';

/**
 * 読みもの1級ぶんの「本」。
 *
 * **`BrandLogo.js` の `TsukuTsukuMark` と同じ作法**（このリポジトリで唯一の
 * 手書きインラインSVGがあれ）:
 *
 * - `viewBox` だけ持ち、**width / height は持たない**。大きさはCSSが決める
 * - `aria-hidden="true"` + `focusable="false"`。**級名と本数は SVG の外に
 *   HTML で置く**——読み上げに乗せたいし、文字の大きさはCSSで持ちたい
 * - 動かしたいところにクラスを振り、CSS から動かす（`BrandLoader.css` と同じ）
 * - 色はSVG属性に直書き。トークンの生値を書くのは `TsukuTsukuMark` と同じ
 *
 * 表紙（`book__cover`）は**左綴じで開く**。回す中心と角度はCSS側（`Reading.css`）。
 */

/**
 * 級ごとの表紙の色。**やさしい級ほど明るい。**
 *
 * 級の並びは `src/logic/readingLevel.js` の `EIKEN_ORDER` と同じ。
 * ここに無い級は既定色になる（級が増えても本棚は壊れない）。
 */
export const BOOK_COLORS = {
  5: '#7FE3C0',
  4: '#48D7A5',
  3: '#4FB8C9',
  pre2: '#4F78FF',
  2: '#6C5CE7',
  pre1: '#9B59B6',
};

const DEFAULT_COLOR = '#48D7A5';

/**
 * @param gradeId 級（色を引くのに使う）
 * @param className 大きさ・動きをCSSから当てるための追加クラス
 */
export default function BookCover({ gradeId, className = '' }) {
  const color = BOOK_COLORS[gradeId] || DEFAULT_COLOR;
  return (
    <svg
      aria-hidden="true"
      className={`book ${className}`.trim()}
      viewBox="0 0 120 150"
      focusable="false"
    >
      {/* 中の紙。表紙が開くと見える */}
      <g className="book__pages">
        <rect x="16" y="8" width="96" height="134" rx="6" fill="#FFFDF7" stroke="#183153" strokeWidth="2.5" />
        <path
          d="M34 40h60M34 56h60M34 72h44M34 88h60M34 104h38"
          fill="none"
          stroke="#183153"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.28"
        />
      </g>

      {/* 表紙。**左綴じで開く**（回す中心はCSS） */}
      <g className="book__cover">
        <rect x="8" y="8" width="104" height="134" rx="6" fill={color} stroke="#183153" strokeWidth="2.5" />
        {/* 綴じ側の帯 */}
        <rect className="book__spine" x="8" y="8" width="14" height="134" rx="6" fill="#183153" opacity="0.22" />
        {/* 題の置き場に見える白い枠。**文字は入れない**（外のHTMLが持つ） */}
        <rect x="34" y="34" width="62" height="46" rx="5" fill="#FFFDF7" opacity="0.92" />
        <path d="M44 92h42M44 104h28" fill="none" stroke="#FFFDF7" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      </g>
    </svg>
  );
}
