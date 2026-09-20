/**
 * 音読の結果。
 *
 * **読み終わったら区切りを付ける。** 以前は本文の下に静かに出していたので、
 * スクロールして戻らないと気づけず、「音読しても何も起きない」に見えた。
 *
 * 出すのは「どれだけ読めたか」と「読み飛ばした語」の2つだけ。
 * 発音の良し悪しは測っていない（→ `logic/transcribeApi.js`）ので言わない。
 */
import React from 'react';
import './ReadAloudResult.css';

/** 点に応じた一言。**数字だけ出して黙らない** */
const commentFor = (score) => {
  if (score === null) return '聞き取れませんでした。もう一度どうぞ。';
  if (score >= 95) return 'ほとんど読めました。';
  if (score >= 80) return 'よく読めました。飛ばした語を確かめましょう。';
  if (score >= 50) return '半分より多く読めました。ゆっくりでいいので全部読んでみましょう。';
  return 'まずは読める語を増やしましょう。区切りごとに声に出すと読みやすくなります。';
};

export default function ReadAloudResult({ working = false, score, missing = [], failure = '', onClose, onRetry }) {
  const done = !working && failure === '' && score !== null;

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
          <p className="aloud-result__comment">聞き取っています…</p>
        ) : failure !== '' ? (
          <p className="message-box message-box-error">{failure}</p>
        ) : (
          <>
            <p className="aloud-result__score">
              <span className="aloud-result__value">{score === null ? '—' : score}</span>
              <span className="aloud-result__unit">% 読めました</span>
            </p>
            <p className="aloud-result__comment">{commentFor(score)}</p>
            {missing.length > 0 && (
              <div className="aloud-result__missing">
                <p className="aloud-result__missing-head">読み飛ばした語</p>
                <p className="aloud-result__missing-body">{missing.join(' / ')}</p>
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
