import React, { useCallback, useEffect, useState } from 'react';
import { FaMicrophone, FaStop, FaRedo, FaPlay, FaFileAlt } from 'react-icons/fa';
import { canRecord, useRecorder } from '../../logic/useRecorder';
import { VERDICT_LABELS, transcribeSpeaking } from '../../logic/transcribeApi';
import logger from '../../logic/logger';

/**
 * 生徒が声を出す場面の、録音と文字起こし。
 *
 * 自分が実際に何と言ったかが文字で見えると、言えたつもりだった箇所が
 * 分かる。音読では読むべき英文と突き合わせて、読み飛ばした語を出す。
 * 質問への答えは、質問に答えられているかを見る。
 *
 * 発音の点は出さない。文字起こしが取れなくても録音と聞き返しはできる。
 */

export default function SpeakingPanel({ mode, referenceText, question, modelAnswer, grade, resetKey }) {
  const recorder = useRecorder();
  const [result, setResult] = useState(null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState(null);

  const { reset } = recorder;
  // 場面が変わったら前の録音と点を捨てる。前の答えが残っていると読み違える。
  useEffect(() => {
    reset();
    setResult(null);
    setFailure(null);
  }, [resetKey, reset]);

  const blob = recorder.blob;

  const runTranscription = useCallback(async () => {
    if (!blob) return;
    setWorking(true);
    setFailure(null);
    try {
      setResult(await transcribeSpeaking(blob, { mode, referenceText, question, modelAnswer, grade }));
    } catch (error) {
      logger.warn('文字起こしできませんでした', error);
      setFailure(error.message);
    } finally {
      setWorking(false);
    }
  }, [blob, mode, referenceText, question, modelAnswer, grade]);

  if (!canRecord()) {
    return (
      <p className="interview-note">
        この端末では録音できません。声に出して練習し、「答え方を見る」で見本と比べてください。
      </p>
    );
  }

  return (
    <div className="speaking-panel">
      <div className="speaking-controls">
        {recorder.state === 'recording' ? (
          <button type="button" className="speaking-button is-recording" onClick={recorder.stop}>
            <FaStop aria-hidden="true" /> 止める
            <span className="speaking-elapsed">
              {Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, '0')}
            </span>
          </button>
        ) : (
          <button type="button" className="speaking-button" onClick={recorder.start}>
            <FaMicrophone aria-hidden="true" /> {blob ? '録り直す' : '録音する'}
          </button>
        )}

        {blob && recorder.state !== 'recording' && (
          <>
            {/* 自分の声を聞くのが一番効く。採点より先に置く。 */}
            <audio className="speaking-audio" src={recorder.url} controls preload="metadata">
              <track kind="captions" />
            </audio>
            <button
              type="button"
              className="ghost-button"
              onClick={runTranscription}
              disabled={working}
            >
              {working ? <>文字にしています…</> : <><FaFileAlt aria-hidden="true" /> 文字にする</>}
            </button>
          </>
        )}
      </div>

      {recorder.error && <p className="speaking-error">{recorder.error}</p>}
      {failure && <p className="speaking-error">{failure}</p>}

      {result && (
        <div className="speaking-result">
          {/* まず自分が何と言ったか。ここが本題。 */}
          <div className="speaking-transcript-main">
            <p className="interview-beat__role">言えていた内容</p>
            <p className="speaking-transcript-main__text">
              {result.transcript || '聞き取れませんでした。マイクに近づいて、もう一度話してみてください。'}
            </p>
          </div>

          {result.missing?.length > 0 && (
            <div className="speaking-words">
              <p className="interview-beat__role">読めていなかった語</p>
              <ul>
                {result.missing.map((word) => (
                  <li key={word}><span className="speaking-words__word">{word}</span></li>
                ))}
              </ul>
              <p className="speaking-hint">
                聞き取りの誤りで出ることもあります。録音を聞き返して確かめてください。
              </p>
            </div>
          )}

          {result.content && (
            <div className={`speaking-content is-${result.content.verdict}`}>
              <p className="speaking-content__verdict">
                {VERDICT_LABELS[result.content.verdict] || result.content.verdict}
              </p>
              {result.content.reasonJa && <p>{result.content.reasonJa}</p>}
              {result.content.missingJa && <p>足すとよいこと: {result.content.missingJa}</p>}
              {result.content.betterAnswer && (
                <p className="speaking-content__better">{result.content.betterAnswer}</p>
              )}
            </div>
          )}

        </div>
      )}

      {recorder.state === 'idle' && !blob && (
        <p className="speaking-hint">
          <FaPlay aria-hidden="true" /> 録音してから「文字にする」を押すと、言えていた内容が出ます。
        </p>
      )}
      {blob && !result && recorder.state !== 'recording' && !working && (
        <p className="speaking-hint">
          <FaRedo aria-hidden="true" /> 納得いくまで録り直せます。
        </p>
      )}
    </div>
  );
}
