import React, { useState } from 'react';
import { FaVolumeUp, FaStop } from 'react-icons/fa';
import { sentenceEnglish, speechPlanFor } from '../../logic/readingContent';

/**
 * 読みもの本文。同じ素材を4通りに見せる。
 *
 *   plain   英語だけ。まずは英語のまま読ませる
 *   ja      1文ずつ和訳を添える
 *   slash   意味のまとまりで / を入れる。押すとそのまとまりの訳が出る
 *   svoc    同じまとまりに S/V/O/C/M の札を付ける
 *
 * スラッシュとSVOCは同じ chunks を見ている。区切りを2つ持つと、片方だけ
 * 直したときにズレても画面は普通に動いてしまう（docs/reading-format.md）。
 */

export const READING_MODES = [
  { id: 'plain', label: '英語' },
  { id: 'ja', label: '和訳' },
  { id: 'slash', label: 'スラッシュ' },
  { id: 'svoc', label: 'SVOC' },
];

const ROLE_LABELS = { S: 'S', V: 'V', O: 'O', C: 'C', M: 'M' };

/** スラッシュ読み。押したまとまりだけ訳を出す。 */
function SlashSentence({ sentence }) {
  const [opened, setOpened] = useState(null);

  return (
    <p className="reading-sentence reading-sentence--slash">
      {sentence.chunks.map((chunk, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="reading-slash" aria-hidden="true">/</span>}
          <button
            type="button"
            className={opened === index ? 'reading-chunk is-open' : 'reading-chunk'}
            onClick={() => setOpened(opened === index ? null : index)}
          >
            <span className="reading-chunk__en">{chunk.en}</span>
            {opened === index && <span className="reading-chunk__ja">{chunk.ja}</span>}
          </button>
        </React.Fragment>
      ))}
    </p>
  );
}

/** SVOC。まとまりの上に札を付ける。修飾語（M）は控えめに。 */
function SvocSentence({ sentence }) {
  return (
    <p className="reading-sentence reading-sentence--svoc">
      {sentence.chunks.map((chunk, index) => (
        <span key={index} className={`reading-svoc is-${chunk.role.toLowerCase()}`}>
          <span className="reading-svoc__role">{ROLE_LABELS[chunk.role]}</span>
          <span className="reading-svoc__en">{chunk.en}</span>
        </span>
      ))}
    </p>
  );
}

export default function ReadingView({ reading, mode, speakingIndex, onSpeak, onStop }) {
  return (
    <div className="reading-body">
      {reading.sentences.map((sentence, index) => {
        const speaking = speakingIndex === index;
        return (
          <div key={index} className={speaking ? 'reading-line is-speaking' : 'reading-line'}>
            <button
              type="button"
              className="reading-line__speak"
              onClick={() => (speaking ? onStop() : onSpeak(index, speechPlanFor(sentence, mode === 'ja')))}
              aria-label={speaking ? '読み上げを止める' : `${index + 1}文目を読み上げる`}
            >
              {speaking ? <FaStop aria-hidden="true" /> : <FaVolumeUp aria-hidden="true" />}
            </button>

            <div className="reading-line__text">
              {mode === 'slash' && <SlashSentence sentence={sentence} />}
              {mode === 'svoc' && <SvocSentence sentence={sentence} />}
              {(mode === 'plain' || mode === 'ja') && (
                <p className="reading-sentence">{sentenceEnglish(sentence)}</p>
              )}
              {mode === 'ja' && <p className="reading-sentence__ja">{sentence.ja}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
