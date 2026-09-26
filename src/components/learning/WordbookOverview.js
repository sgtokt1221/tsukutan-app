import React from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import './WordbookOverview.css';

/**
 * 単語帳の上に置く「一覧の地図」（2026-09-26）。単語帳の売りは一覧性なので、それをもう一段。
 *
 * - 全部の語を小さなマスで並べ、答え合わせの色（わかった／もう一度／まだ）を塗る。
 *   押すとその語へ飛ぶ。どこまで確かめたか・どこが苦手かが、スクロールしなくても見える
 * - 絞り込み：すべて／まだ／もう一度。払い終えたら「もう一度」だけで見直せる
 * - 赤シートをまとめて開く／隠す
 */

export const WORDBOOK_FILTERS = [
  { id: 'all', label: 'すべて' },
  { id: 'unchecked', label: 'まだ' },
  { id: 'again', label: 'もう一度' },
];

/** その語を今の絞り込みで出すか */
export const matchesFilter = (filter, judgement) => {
  if (filter === 'unchecked') return !judgement;
  if (filter === 'again') return judgement === 'incorrect';
  return true;
};

export default function WordbookOverview({
  words, judgementOf, filter, onFilter, onJump, allRevealed, onToggleReveal,
}) {
  const marks = words.map((word) => judgementOf(word) || null);
  const good = marks.filter((m) => m === 'correct').length;
  const again = marks.filter((m) => m === 'incorrect').length;
  const counts = { all: words.length, unchecked: words.length - good - again, again };

  return (
    <div className="wb-overview">
      <div className="wb-overview__row">
        <div className="wb-overview__filters" role="group" aria-label="絞り込み">
          {WORDBOOK_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={filter === f.id ? 'wb-chip is-on' : 'wb-chip'}
              aria-pressed={filter === f.id}
              onClick={() => onFilter(f.id)}
            >
              {f.label}
              <span className="wb-chip__count">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="wb-reveal"
          onClick={onToggleReveal}
          aria-label={allRevealed ? '答えをまとめて隠す' : '答えをまとめて見る'}
          title={allRevealed ? '答えをまとめて隠す' : '答えをまとめて見る'}
        >
          {allRevealed ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}
        </button>
      </div>

      {/* 一覧の地図。1マス＝1語 */}
      <div className="wb-map" aria-label={`わかった ${good}語・もう一度 ${again}語・まだ ${counts.unchecked}語`} role="img">
        {marks.map((mark, index) => (
          <button
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            type="button"
            tabIndex={-1}
            className={`wb-map__cell${mark ? ` is-${mark}` : ''}`}
            onClick={() => onJump(index)}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
