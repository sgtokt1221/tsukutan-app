/**
 * 音読の結果。
 *
 * **読み終わったら区切りを付ける。** 以前は本文の下に静かに出していたので、
 * スクロールして戻らないと気づけず、「音読しても何も起きない」に見えた。
 *
 * 出すのは「どれだけ読めたか」と「本文のどこを飛ばしたか」の2つだけ。
 * 発音の良し悪しは測っていない（→ `logic/transcribeApi.js`）ので言わない。
 *
 * **読み飛ばした語の一覧はやめた**（2026-09-22）。語だけ並べても本文のどこ
 * だったか分からず、読み直す場所を探せなかった。**本文をそのまま並べて色を
 * 付ける**——飛ばしたところがその場で見える。
 */
import React from 'react';
import { markPassage } from '../../logic/readAloudMarks';
import './ReadAloudResult.css';

/** 点に応じた一言。**数字だけ出して黙らない** */
const commentFor = (score) => {
  if (score === null) return '聞き取れませんでした。もう一度どうぞ。';
  if (score >= 95) return 'ほとんど読めました。';
  if (score >= 80) return 'よく読めました。飛ばした語を確かめましょう。';
  if (score >= 50) return '半分より多く読めました。ゆっくりでいいので全部読んでみましょう。';
  return 'まずは読める語を増やしましょう。区切りごとに声に出すと読みやすくなります。';
};

export default function ReadAloudResult({
  working = false, score, missing = [], referenceText = '', failure = '', onClose, onRetry,
}) {
  const done = !working && failure === '' && score !== null;
  const parts = done ? markPassage(referenceText, missing) : [];

  return (
    <div className="aloud-result-backdrop" role="presentation" onClick={onClose}>
      <div
        className="aloud-result"
        role="dialog"
        aria-modal="true"
        aria-label="音読の結果"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="aloud-result__title">{done ? '音読 完了！' : '音読'}</p>

        {working ? (
          /* **止めた直後から出す。** 結果を本文の下に出していたときは、
             スクロールして戻らないと気づけず「押しても何も起きない」に見えた */
          <>
            <p className="aloud-result__comment">聞き取っています…</p>
            {/*
              **どこまで進んだかは分からない。** 送って、向こうが聞き取って返すまでの
              1往復なので、途中の割合が出てこない。**作り物の数字は出さない**かわりに、
              動き続ける帯で「止まっていない」ことだけを見せる。
              読み上げソフトにも「進行中」とだけ伝える（`aria-valuenow` を付けない）。
            */}
            <div className="aloud-result__progress" role="progressbar" aria-label="聞き取っています">
              <span className="aloud-result__progress-bar" />
            </div>
          </>
        ) : failure !== '' ? (
          <p className="message-box message-box-error">{failure}</p>
        ) : (
          <>
            <p className="aloud-result__score">
              <span className="aloud-result__value">{score === null ? '—' : score}</span>
              <span className="aloud-result__unit">% 読みました</span>
            </p>
            <p className="aloud-result__comment">{commentFor(score)}</p>
            {parts.length > 0 && (
              <div className="aloud-result__passage" data-testid="aloud-passage">
                {/*
                  **色だけに頼らない**（→ dads）。読み飛ばしには下線も引き、
                  上に何色が何を指すかを置く。
                */}
                <p className="aloud-result__legend">
                  <span className="aloud-word is-read">読めた</span>
                  <span className="aloud-word is-missed">読み飛ばし</span>
                </p>
                <p className="aloud-result__text">
                  {parts.map((part, i) => (part.word ? (
                    <span key={i} className={part.read ? 'aloud-word is-read' : 'aloud-word is-missed'}>
                      {part.text}
                    </span>
                  ) : (
                    <React.Fragment key={i}>{part.text}</React.Fragment>
                  )))}
                </p>
              </div>
            )}
          </>
        )}

        <div className="aloud-result__actions">
          {!working && onRetry && (
            <button type="button" className="secondary-action" onClick={onRetry}>もう一度</button>
          )}
          <button type="button" className="primary-action" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
