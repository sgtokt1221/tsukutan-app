import React from 'react';

/**
 * 生徒が声を出したあとの表示。聞き返しと、文字起こし。
 *
 * 録音そのものは画面下のマイクボタン（EikenInterview）が受け持ち、
 * 文字起こしは録り終えた時点で自動で走る。押させるボタンは無い。
 *
 * 採点と講評はここには出さない。本番の面接委員は途中で講評しないし、
 * 1場面ごとに点が出ると、そこで気持ちが切れる。最後の結果画面にまとめる。
 *
 * 文字起こしは直せるようにしてある。日本語なまりの英語は取り違えられる
 * ことがあり、そのまま判定にかけると「言えていたのに低い点」になる。
 */
export default function SpeakingPanel({ recorder, answer, onEditTranscript }) {
  if (recorder.error) return <p className="speaking-error">{recorder.error}</p>;
  if (!answer || recorder.state === 'recording') return null;

  return (
    <div className="speaking-panel">
      {/* 自分の声を聞くのが一番効く。文字より先に置く。 */}
      <audio className="speaking-audio" src={answer.url} controls preload="metadata">
        <track kind="captions" />
      </audio>

      {answer.status === 'working' && <p className="speaking-note">聞き取っています…</p>}

      {answer.status === 'failed' && (
        <p className="speaking-error">
          {answer.failure || '聞き取れませんでした。'}録音は残っているので、聞き返せます。
        </p>
      )}

      {answer.status === 'done' && (
        <label className="speaking-transcript">
          <span className="speaking-transcript__label">
            言えていた内容{answer.edited && <span className="speaking-transcript__edited">直しました</span>}
          </span>
          <textarea
            className="speaking-transcript__input"
            value={answer.transcript}
            rows={3}
            onChange={(event) => onEditTranscript(answer.key, event.target.value)}
            placeholder="聞き取れませんでした。言ったとおりに書き直せます。"
          />
          <span className="speaking-note">聞き間違いがあれば直してください。直した文で採点します。</span>
        </label>
      )}
    </div>
  );
}
