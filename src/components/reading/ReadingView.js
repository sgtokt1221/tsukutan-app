import React, { useState } from 'react';
import { FaVolumeUp, FaStop } from 'react-icons/fa';
import { speechPlanFor } from '../../logic/readingContent';
import { useLongPress } from '../../logic/useLongPress';
import { splitIntoUnits } from '../../logic/wordLookup';

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

/**
 * 本文の1語。長押しで「毎日みる」に登録する。
 *
 * 短く押したときは何もしない。スラッシュ読みでは、親のまとまりを押すと
 * 訳が出る作りなので、そちらへ通す。
 */
function Word({ text, phrase, marked, onHold }) {
  const { handlers } = useLongPress((at) => onHold(text, { phrase, at }));
  const className = [
    'reading-word',
    phrase ? 'is-phrase' : '',
    marked ? 'is-marked' : '',
  ].filter(Boolean).join(' ');
  return <span className={className} {...handlers}>{text}</span>;
}

/**
 * 語ごとに割る。熟語になっているところはまとまりのまま1つにする。
 * "a lot of" の lot だけを登録しても意味が無い。
 */
function Words({ text, phrases, isMarked, onHold }) {
  return splitIntoUnits(text, phrases).map((unit, index) => (
    unit.space
      ? <React.Fragment key={index}>{unit.text}</React.Fragment>
      : (
        <Word
          key={index}
          text={unit.text}
          phrase={unit.phrase}
          marked={isMarked(unit.text, unit.phrase)}
          onHold={onHold}
        />
      )
  ));
}

/** スラッシュ読み。押したまとまりだけ訳を出す。 */
function SlashSentence({ sentence, phrases, isMarked, onHold }) {
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
            <span className="reading-chunk__en">
              <Words text={chunk.en} phrases={phrases} isMarked={isMarked} onHold={onHold} />
            </span>
            {opened === index && <span className="reading-chunk__ja">{chunk.ja}</span>}
          </button>
        </React.Fragment>
      ))}
    </p>
  );
}

/** SVOC。まとまりの上に札を付ける。修飾語（M）は控えめに。 */
function SvocSentence({ sentence, phrases, isMarked, onHold }) {
  return (
    <p className="reading-sentence reading-sentence--svoc">
      {sentence.chunks.map((chunk, index) => (
        <span key={index} className={`reading-svoc is-${chunk.role.toLowerCase()}`}>
          <span className="reading-svoc__role">{ROLE_LABELS[chunk.role]}</span>
          <span className="reading-svoc__en">
            <Words text={chunk.en} phrases={phrases} isMarked={isMarked} onHold={onHold} />
          </span>
        </span>
      ))}
    </p>
  );
}

export default function ReadingView({ reading, mode, speakingIndex, onSpeak, onStop, phrases, isMarked, onHold }) {
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
              {mode === 'slash' && <SlashSentence sentence={sentence} phrases={phrases} isMarked={isMarked} onHold={onHold} />}
              {mode === 'svoc' && <SvocSentence sentence={sentence} phrases={phrases} isMarked={isMarked} onHold={onHold} />}
              {(mode === 'plain' || mode === 'ja') && (
                <p className="reading-sentence">
                  {sentence.chunks.map((chunk, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && ' '}
                      <Words text={chunk.en} phrases={phrases} isMarked={isMarked} onHold={onHold} />
                    </React.Fragment>
                  ))}
                </p>
              )}
              {mode === 'ja' && <p className="reading-sentence__ja">{sentence.ja}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
