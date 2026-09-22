/**
 * 音読の結果。
 *
 * **読み終わったら区切りを付ける。** 以前は本文の下に静かに出していたので、
 * スクロールして戻らないと気づけず、「音読しても何も起きない」に見えた。
 *
 * 出すのは「どこまで読み進んだか」と「本文のどこが聞き取れたか」の2つだけ。
 * 発音の良し悪しは測っていない（→ `logic/transcribeApi.js`）ので言わない。
 *
 * **読み飛ばした語の一覧はやめた**（2026-09-22）。語だけ並べても本文のどこ
 * だったか分からず、読み直す場所を探せなかった。**本文をそのまま並べて色を
 * 付ける**——飛ばしたところがその場で見える。
 */
import React from 'react';
import './ReadAloudResult.css';

/**
 * 進み具合に応じた一言。**数字だけ出して黙らない**
 *
 * 言うのは「どこまで読んだか」だけ。**うまさには触れない**——
 * 聞き取りは発音に引きずられるので、そこを責めると声を出さなくなる。
 */
const commentFor = (reach) => {
  if (reach === null) return '聞き取れませんでした。もう一度どうぞ。';
  if (reach >= 95) return '最後まで読み進めました。';
  if (reach >= 80) return 'よく読み進めました。';
  if (reach >= 50) return '半分より先まで進みました。最後まで声に出してみましょう。';
  return 'まずは最後まで声に出してみましょう。つかえても大丈夫です。';
};

/**
 * @param parts 色を付けた本文（`logic/readAloudMarks.js` の `markPassage`）。
 *   **ここで作り直さない**——点と色が別の計算から出ると、静かに食い違う
 * @param reach どこまで読み進んだか（`readAloudReach`）。**うまさではない**
 * @param pass 「音読した日」に数える下限（`ALOUD_PASS`）。届いたかを本人に出す
 */
export default function ReadAloudResult({
  working = false, reach, parts = [], pass = null, failure = '', onClose, onRetry,
}) {
  const done = !working && failure === '' && reach !== null;
  const marked = done ? parts : [];
  // 届いたかどうか。**黙って落とさない**——「やったのに○が付かない」になる
  const counted = done && pass !== null ? reach >= pass : null;

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
              <span className="aloud-result__value">{reach === null ? '—' : reach}</span>
              <span className="aloud-result__unit">% 読み進めました</span>
            </p>
            <p className="aloud-result__comment">{commentFor(reach)}</p>
            {/*
              **塾に「音読した日」として出る線を、本人にも見せる**（2026-09-22）。
              黙って落とすと「やったのに数えられていない」になり、
              こちらからは気づけない。
            */}
            {counted !== null && (
              <p className={counted ? 'aloud-result__counted is-ok' : 'aloud-result__counted'}>
                {counted
                  ? `文章の ${pass}% 以上を読んだので「音読した日」になりました`
                  : `文章の ${pass}% 以上まで読み進めると「音読した日」になります`}
              </p>
            )}
            {marked.length > 0 && (
              <div className="aloud-result__passage" data-testid="aloud-passage">
                {/*
                  **「読み飛ばし」と言わない**（2026-09-22）。赤は飛ばしたところ
                  とは限らない——声に出していても、発音のせいで聞き取れなかった
                  だけのことがある。**読んでいないと決めつけない**。

                  **色だけに頼らない**（→ dads）。赤には下線も引き、
                  上に何色が何を指すかを置く。
                */}
                <p className="aloud-result__legend">
                  <span className="aloud-word is-read">聞き取れた</span>
                  <span className="aloud-word is-missed">聞き取れなかった</span>
                </p>
                <p className="aloud-result__text">
                  {marked.map((part, i) => (part.word ? (
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
