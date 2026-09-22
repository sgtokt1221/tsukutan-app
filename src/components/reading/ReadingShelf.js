import React from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import BookCover from './BookCover';

/**
 * 読みものを選ぶところ。**本棚 → 目次 の2段。**
 *
 *   本棚    6冊（級ごと）。いまの級に印
 *    └ 目次  その級の7〜9本
 *
 * ## 本文はここに持ってこない
 *
 * 本文は `ReadingPanel` が持ったままにする。あちらのアンマウントで
 * `endStudySession()` を呼んでいる（`ReadingPanel.js` の effect）ので、
 * **本文を子へ出すとその effect の寿命が変わり、勉強時間の締めがずれる**。
 *
 * ## 本を開いても勉強時間は測り始めない
 *
 * 測り始めるのは「読みものを選んだ瞬間」だけ（`onSelect` の先の
 * `openReading`）。目次を眺めただけの時間を勉強時間にしない。
 *
 * ## カテゴリで章立てしない
 *
 * 1冊7〜9本に対してカテゴリが6〜9種で、ほぼ1本ずつ。束ねても全部が1件の
 * 見出しになるだけなので、**各行にラベルとして添える**（2026-09-23 に実データで確認）。
 */

/**
 * @param grades `index.json` の `grades`（やさしい順に入っている）
 * @param recommended おすすめの級。印を付けるためだけに使う
 * @param openBook 開いている本の級。`null` なら本棚
 * @param categoryLabel カテゴリid → 表示名
 * @param onOpenBook 本を開く。**勉強時間は測り始めない**
 * @param onCloseBook 本棚へ戻る
 * @param onSelect 読みものを選ぶ。**ここから先で測り始まる**
 */
export default function ReadingShelf({
  grades, recommended, openBook, categoryLabel, onOpenBook, onCloseBook, onSelect,
}) {
  const book = openBook ? grades.find((g) => g.id === openBook) : null;

  if (!book) {
    return (
      <>
        <h2 className="section-title">読みもの</h2>
        <p className="reading-note">読みたい級の本を開いてください。</p>
        <div className="reading-shelf">
          {grades.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="reading-book"
              onClick={() => onOpenBook(entry.id)}
            >
              <BookCover gradeId={entry.id} className="reading-book__art" />
              <span className="reading-book__label">{entry.label}</span>
              <span className="reading-book__count">{entry.readings.length}本</span>
              {entry.id === recommended && (
                /* **色だけに頼らない。** 文字でも「いまの級」と分かるようにする */
                <span className="reading-book__mark">いまの級</span>
              )}
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="reading-head">
        <button type="button" className="free-study-back" onClick={onCloseBook} aria-label="本棚に戻る">
          <FaArrowLeft aria-hidden="true" />
        </button>
        <div>
          <p className="home-section-eyebrow">読みもの</p>
          <p className="reading-title">{book.label}</p>
        </div>
      </div>

      {/* **開いた紙面の上に目次を置く。** 開く動きは CSS（`reading-contents`） */}
      <div className="reading-contents">
        {book.readings.length === 0 && (
          <p className="reading-note">この級の読みものはまだありません。</p>
        )}
        {book.readings.map((entry, i) => (
          <button key={entry.id} type="button" className="reading-item" onClick={() => onSelect(entry)}>
            <span className="reading-item__no">{i + 1}</span>
            <span className="reading-item__body">
              <span className="reading-item__title">{entry.title}</span>
              <span className="reading-item__title-ja">{entry.titleJa}</span>
              <span className="reading-item__category">
                {categoryLabel[entry.category] || entry.category}
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
