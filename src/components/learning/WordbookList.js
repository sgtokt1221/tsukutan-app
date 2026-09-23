import React from 'react';
import { motion } from 'framer-motion';
import { FaCheck } from 'react-icons/fa';
import BookmarkButton from './BookmarkButton';
import { inlinePronunciation } from '../../logic/usePronunciation';

/**
 * 単語帳（一覧で並べる見せ方）のカード群。
 *
 * **採点の色と赤シートは単語で覚える**（`judgementOf(word)` / `isRevealed(word)`）。
 * 以前は並びの番号で覚えていたので、1語外すと後ろが繰り上がり、
 * 色と「答えを見る」が隣のカードへずれていた（2026-09-23 に直した）。
 *
 * `data-card-index` は指の動きから「どのカードを掴んだか」を引くためだけに使う。
 */
export default function WordbookList({
  words,
  startIndex,
  isJaToEn,
  policy,
  getPronunciation,
  judgementOf,
  isRevealed,
  onReveal,
  onHide,
  onRemove,
  onSpeak,
  isBookmarked,
  onToggleBookmark,
  gestureHandlers,
  // 自動再生で読んでいるカードの番号（読んでいなければ -1）
  playingIndex = -1,
}) {
  return (
    <div className="wordbook-list">
      <div className="wordbook-list__grid">
        {words.slice(startIndex).map((word, offset) => {
          const index = startIndex + offset;
          const judgement = judgementOf(word);
          const revealed = isRevealed(word);
          const pronunciation = word.pronunciation || getPronunciation(word.word);
          const showPronunciation = inlinePronunciation(word.word, pronunciation);
          const playing = index === playingIndex;
          return (
            <motion.div
              key={word.id || index}
              data-card-index={index}
              className={`wordbook-card${judgement ? ` wordbook-card--${judgement}` : ''}${playing ? ' is-playing' : ''}`}
              aria-current={playing ? 'true' : undefined}
              {...gestureHandlers}
            >
              <div className="wordbook-card__grid">
                {/* 左側：問題。英→和なら英単語、和→英なら意味 */}
                <div className="wordbook-card__side wordbook-card__left">
                  <div className="wordbook-card__tools">
                    <BookmarkButton
                      size="inline"
                      active={isBookmarked(word)}
                      onToggle={() => onToggleBookmark(word)}
                      label={word.word}
                    />
                    {/* 外す。上スワイプだと一覧のスクロールと取り合いになるので
                        ボタンにしている。何をするかはモードで決まる（→ logic/studyMode.js） */}
                    <button
                      type="button"
                      className="wordbook-graduate"
                      onClick={(e) => { e.stopPropagation(); onRemove(word); }}
                      aria-label={`${word.word}：${policy.removeLabel}。${policy.removeHint}`}
                      title={`${policy.removeLabel}（${policy.removeHint}）`}
                    >
                      <FaCheck aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className={isJaToEn ? 'wordbook-word wordbook-word--ja' : 'wordbook-word'}
                    onClick={() => onSpeak(word)}
                    aria-label={`${isJaToEn ? word.meaning : word.word} を読み上げる`}
                  >
                    <span className="wordbook-word__text">
                      {isJaToEn ? word.meaning : word.word}
                    </span>
                    {/* 発音記号は英単語の手がかりになるので、和→英では隠す。
                        英→和でも、行が増える長い語では出さない。 */}
                    {!isJaToEn && showPronunciation && (
                      <span className="wordbook-pronunciation">[{pronunciation}]</span>
                    )}
                  </button>
                </div>

                {/* 右側：和訳・例文（赤シート）。
                    意味が見えるのと同時に読み上げる。「答えを見る」ボタンの onClick だけだと、
                    カード面の onMouseDown が先に走ってボタンが外れ、click まで届かない */}
                <div
                  className="wordbook-card__side wordbook-card__right"
                  onMouseDown={() => onReveal(word)}
                  onTouchStart={() => onReveal(word)}
                >
                  {/* 赤シート。長押しを必須にせず、押せば開くボタンにする（計画書7.5） */}
                  {!revealed && (
                    <button
                      type="button"
                      className="wordbook-veil"
                      onClick={(e) => { e.stopPropagation(); onReveal(word); }}
                      aria-label={`${word.word} の答えを見る`}
                    >
                      答えを見る
                    </button>
                  )}
                  {revealed && (
                    <button
                      type="button"
                      className="wordbook-veil-hide"
                      onClick={(e) => { e.stopPropagation(); onHide(word); }}
                    >
                      隠す
                    </button>
                  )}

                  <div className={revealed ? 'wordbook-answer' : 'wordbook-answer wordbook-answer--hidden'}>
                    {isJaToEn ? (
                      <div className="wordbook-answer-word">
                        <span className="wordbook-meaning wordbook-meaning--en">{word.word}</span>
                        {showPronunciation && (
                          <span className="wordbook-pronunciation">[{pronunciation}]</span>
                        )}
                      </div>
                    ) : (
                      <div className="wordbook-meaning">{word.meaning}</div>
                    )}

                    {word.example && (
                      <div className="wordbook-example">
                        <div className="wordbook-example__en">{word.example}</div>
                        {word.exampleJa && (
                          <div className="wordbook-example__ja">{word.exampleJa}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
