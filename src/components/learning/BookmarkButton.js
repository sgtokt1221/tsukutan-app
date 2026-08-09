import React from 'react';
import { FaStar, FaRegStar } from 'react-icons/fa';

/**
 * 「毎日みたい単語」の登録／解除。
 *
 * 状態はアイコンの塗りと aria-pressed の両方で示す。色や形だけだと
 * 読み上げでは分からないため。
 *
 * size="inline" は単語帳モードのカード内で使う小さい方。
 */
export default function BookmarkButton({ active, onToggle, label, size = 'header' }) {
  return (
    <button
      type="button"
      className={`bookmark-button bookmark-button--${size}${active ? ' is-active' : ''}`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-pressed={active}
      aria-label={active ? `${label} を毎日みる単語から外す` : `${label} を毎日みる単語に登録する`}
      title={active ? '毎日みる単語から外す' : '毎日みる単語に登録'}
    >
      {active ? <FaStar aria-hidden="true" /> : <FaRegStar aria-hidden="true" />}
    </button>
  );
}
