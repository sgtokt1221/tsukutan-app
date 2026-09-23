import React from 'react';
import { FaVolumeUp, FaStop } from 'react-icons/fa';
import { speechPlanFor } from '../../logic/readingContent';
import { slashGroups } from '../../logic/slashReading';
import { useLongPress } from '../../logic/useLongPress';
import { splitIntoUnits } from '../../logic/wordLookup';

/**
 * 読みもの本文。同じ素材を3通りに見せる。
 *
 *   plain   英語だけ。まずは英語のまま読ませる
 *   ja      1文ずつ和訳を添える
 *   slash   SVOCM の切れ目で / を入れ、要素ごとに S/V/O/C/M の札を載せる。
 *           まとまりごとに訳を下へ添える
 *
 * **スラッシュと SVOC は1画面にした**（2026-09-23）。スラッシュを SVOCM の切れ目で
 * 必ず切るようにしたので、2つは同じ区切りを見ていた。別々のタブにしておくと、
 * 同じものを2回読ませることになる。区切り方の正本は `logic/slashReading.js` の
 * `slashGroups`。
 */

export const READING_MODES = [
  { id: 'plain', label: '英語' },
  { id: 'ja', label: '和訳' },
  { id: 'slash', label: 'スラッシュ' },
];

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

/**
 * スラッシュ読み。**SVOCM の要素（組）ごとに札を1つ載せ、小片ごとに訳を添える。**
 *
 *   組と組の間   … 太い `/`（SVOCM の切れ目。塾で教えている切り方）
 *   組の中の小片 … 細い `/`（長い主語・修飾語を読みやすく割っただけ）
 *
 * 太さを分けないと、どこが SVOCM の切れ目なのかを札の位置からしか読めない。
 *
 * 押して初めて訳が出る作りだと、どこが分からなかったのかを自分で決めてから
 * でないと読めない。最初から並べておけば、目が英語と日本語を往復できる。
 */
function SlashSentence({ sentence, phrases, isMarked, onHold }) {
  const groups = slashGroups(sentence.chunks);
  /*
    **スラッシュは直前のまとまりにくっつける。** 独立した部品にすると、折り返した
    ときにスラッシュだけが次の行の頭に落ちる（「／ you」）。紙に引くときと同じく
    行末に残す。（このコメントに「*」と「/」を続けて書かない。コメントが閉じる）
  */
  return (
    <p className="reading-sentence reading-sentence--slash">
      {groups.map((group, index) => (
        <span key={index} className="reading-slash-unit">
          <span className={`reading-svoc is-${group.role.toLowerCase()}`}>
            <span className="reading-svoc__role">{group.role}</span>
            <span className="reading-svoc__pieces">
              {group.pieces.map((piece, pi) => (
                <span key={pi} className="reading-slash-unit">
                  <span className="reading-chunk">
                    <span className="reading-chunk__en">
                      <Words text={piece.en} phrases={phrases} isMarked={isMarked} onHold={onHold} />
                    </span>
                    <span className="reading-chunk__ja">{piece.ja}</span>
                  </span>
                  {pi < group.pieces.length - 1 && <span className="reading-slash reading-slash--inner" aria-hidden="true">/</span>}
                </span>
              ))}
            </span>
          </span>
          {index < groups.length - 1 && <span className="reading-slash" aria-hidden="true">/</span>}
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
