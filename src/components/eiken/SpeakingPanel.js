import React, { useCallback, useEffect, useState } from 'react';
import { FaFileAlt } from 'react-icons/fa';
import { VERDICT_LABELS, transcribeSpeaking } from '../../logic/transcribeApi';
import logger from '../../logic/logger';

/**
 * 録音したあとに出るもの。聞き返しと、文字起こしの結果。
 *
 * 録音そのものは画面下のマイクボタン（EikenInterview）が受け持つ。
 * 話している最中に本文が動くと落ち着かないので、ここは録り終えてから出す。
 */
export default function SpeakingPanel({ recorder, mode, referenceText, question, modelAnswer, grade, resetKey }) {
  const [result, setResult] = useState(null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState(null);

  // 場面が変わったら前の結果を捨てる。前の答えが残っていると読み違える。
  useEffect(() => {
    setResult(null);
    setFailure(null);
  }, [resetKey]);

  const blob = recorder.blob;

  const run = useCallback(async () => {
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

  if (recorder.error) return <p className="speaking-error">{recorder.error}</p>;
  if (!blob || recorder.state === 'recording') return null;

  return (
    <div className="speaking-panel">
      <div className="speaking-controls">
        <audio className="speaking-audio" src={recorder.url} controls preload="metadata">
          <track kind="captions" />
        </audio>
        <button type="button" className="ghost-button" onClick={run} disabled={working}>
          {working ? '文字にしています…' : <><FaFileAlt aria-hidden="true" /> 文字にする</>}
        </button>
      </div>

      {failure && <p className="speaking-error">{failure}</p>}

      {result && (
        <div className="speaking-result">
          <p className="speaking-transcript-main__text">
            {result.transcript || '聞き取れませんでした。マイクに近づいて、もう一度話してみてください。'}
          </p>

          {result.missing?.length > 0 && (
            <div className="speaking-words">
              <p className="interview-beat__role">読めていなかった語</p>
              <ul>
                {result.missing.map((word) => (
                  <li key={word}><span className="speaking-words__word">{word}</span></li>
                ))}
              </ul>
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
    </div>
  );
}
