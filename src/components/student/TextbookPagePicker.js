import React, { useState } from 'react';
import { pagesOf, pageLabel, wordsInPages } from '../../logic/textbookPages';
import './TextbookPagePicker.css';

/**
 * 教科書のページの範囲を選ぶ。**はじめのページ → おわりのページの順に2回押す。**
 *
 * 教科書を開いている生徒が「今日は p.30〜45」と決めて覚える形にしたい（2026-09-24）。
 * 番号の帯のように固定の区切りにすると、学校の進み方と合わない。
 * 1回押しただけでも、その1ページで始められる（下のボタンは常に出す）。
 *
 * 語の無いページは出さない（語彙一覧に載っている＝新しい語が出てくるページだけ）。
 */
export default function TextbookPagePicker({ cards, grade, onStart }) {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const pages = pagesOf(cards, grade);

  const pick = (page) => {
    // 範囲が決まっているところで押したら、そこから選び直す
    if (from === null || to !== null) {
      setFrom(page);
      setTo(null);
      return;
    }
    setTo(page);
  };

  const end = to ?? from;
  const lo = from === null ? null : Math.min(from, end);
  const hi = from === null ? null : Math.max(from, end);
  const count = from === null ? 0 : wordsInPages(cards, grade, lo, hi).length;

  return (
    <div className="page-picker">
      <p className="page-picker__hint" aria-live="polite">
        {from === null && 'はじめのページを押してください'}
        {from !== null && to === null && `${pageLabel(from, from)} から。おわりのページを押してください（このページだけでも始められます）`}
        {from !== null && to !== null && `${pageLabel(lo, hi)} を選んでいます`}
      </p>
      <div className="page-picker__grid">
        {pages.map(({ page, count: n }) => {
          const inRange = lo !== null && page >= lo && page <= hi;
          const isEdge = page === from || page === to;
          return (
            <button
              key={page}
              type="button"
              className={`page-chip${inRange ? ' is-in-range' : ''}${isEdge ? ' is-edge' : ''}`}
              aria-pressed={inRange}
              onClick={() => pick(page)}
            >
              <span className="page-chip__page">p.{page}</span>
              <span className="page-chip__count">{n}語</span>
            </button>
          );
        })}
      </div>
      <div className="page-picker__actions">
        <button
          type="button"
          className="page-picker__start"
          disabled={from === null}
          onClick={() => onStart(grade, lo, hi)}
        >
          {from === null ? 'ページを選ぶと始められます' : `${pageLabel(lo, hi)} の ${count}語を覚える`}
        </button>
      </div>
    </div>
  );
}
