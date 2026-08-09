import React from 'react';
import './ModeTabs.css';

/**
 * 学習画面の表示モード切り替え。フラッシュカード / 単語帳。
 *
 * ボタンを1つ置いて「別モードへ行く」形にすると、今どちらにいるのかが
 * 分からない。タブにして選択中を下線で示す。
 *
 * children には、そのモードでだけ使う小さな操作（単語帳の文字サイズなど）を
 * 渡す。行を増やさないため、タブと同じ行の右端に置く。
 */

const MODES = [
  { id: 'flashcard', label: 'フラッシュカード' },
  { id: 'wordbook', label: '単語帳' },
];

export default function ModeTabs({ value, onChange, children }) {
  return (
    <div className="mode-tabs">
      <div className="mode-tabs__list" role="tablist" aria-label="表示モード">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={value === mode.id}
            className="mode-tabs__tab"
            onClick={() => value !== mode.id && onChange(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
