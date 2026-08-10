import React from 'react';
import './DirectionToggle.css';

/**
 * 出題方向の切り替え。モード切替タブと同じ行の右側に置く。
 *
 * 「和英」「英和」という語は中高生には馴染みが薄いので、
 * 矢印でどちらからどちらへ答えるのかをそのまま見せる。
 */

const OPTIONS = [
  { id: 'en-ja', label: '英→和', description: '英語を見て意味を答える' },
  { id: 'ja-en', label: '和→英', description: '意味を見て英語を答える' },
];

export default function DirectionToggle({ value, onChange }) {
  return (
    <div className="direction-toggle" role="group" aria-label="出題の向き">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className="direction-toggle__option"
          aria-pressed={value === option.id}
          title={option.description}
          onClick={() => value !== option.id && onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
