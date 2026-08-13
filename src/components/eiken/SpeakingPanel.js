import React, { useCallback, useEffect, useState } from 'react';
import { FaMicrophone, FaStop, FaRedo, FaPlay, FaCheckCircle } from 'react-icons/fa';
import { canRecord, useRecorder } from '../../logic/useRecorder';
import {
  SCORE_LABELS,
  VERDICT_LABELS,
  assessSpeaking,
  scoreBand,
} from '../../logic/speakingAssessment';
import logger from '../../logic/logger';

/**
 * 生徒が声を出す場面の、録音と採点。
 *
 * 音読は読む英文が決まっているので、読み違えた語まで出せる（scripted）。
 * 質問への答えは何を言うか決まっていないので、発音だけ点にして、
 * 中身は別に「質問に答えているか」を見る（unscripted）。
 *
 * 採点が使えないときも録音と聞き返しはできる。Azure の鍵がまだでも、
 * 自分の声を聞くだけで直せることは多い。
 */

const ORDER = ['PronScore', 'AccuracyScore', 'FluencyScore', 'ProsodyScore', 'CompletenessScore'];

function ScoreBar({ name, value }) {
  const band = scoreBand(value);
  return (
    <div className="speaking-score">
      <span className="speaking-score__label">{SCORE_LABELS[name]}</span>
      <span className="speaking-score__track">
        <span className={`speaking-score__fill is-${band}`} style={{ width: `${value}%` }} />
      </span>
      <span className={`speaking-score__value is-${band}`}>{value}</span>
    </div>
  );
}

export default function SpeakingPanel({ mode, referenceText, question, modelAnswer, grade, resetKey }) {
  const recorder = useRecorder();
  const [result, setResult] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState(null);

  const { reset } = recorder;
  // 場面が変わったら前の録音と点を捨てる。前の答えが残っていると読み違える。
  useEffect(() => {
    reset();
    setResult(null);
    setAssessError(null);
  }, [resetKey, reset]);

  const blob = recorder.blob;

  const runAssessment = useCallback(async () => {
    if (!blob) return;
    setAssessing(true);
    setAssessError(null);
    try {
      setResult(await assessSpeaking(blob, { mode, referenceText, question, modelAnswer, grade }));
    } catch (error) {
      logger.warn('採点できませんでした', error);
      setAssessError(error.message);
    } finally {
      setAssessing(false);
    }
  }, [blob, mode, referenceText, question, modelAnswer, grade]);

  if (!canRecord()) {
    return (
      <p className="interview-note">
        この端末では録音できません。声に出して練習し、「答え方を見る」で見本と比べてください。
      </p>
    );
  }

  const scores = result?.scores;

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
              onClick={runAssessment}
              disabled={assessing}
            >
              {assessing ? <>採点中…</> : <><FaCheckCircle aria-hidden="true" /> 採点する</>}
            </button>
          </>
        )}
      </div>

      {recorder.error && <p className="speaking-error">{recorder.error}</p>}
      {assessError && <p className="speaking-error">{assessError}</p>}

      {result && !result.available && (
        <p className="interview-note">
          採点はまだ使えません。録音を聞き返して、見本と比べてください。
        </p>
      )}

      {result?.available && (
        <div className="speaking-result">
          {scores && ORDER
            .filter((name) => typeof scores[name] === 'number')
            .map((name) => <ScoreBar key={name} name={name} value={scores[name]} />)}

          {result.mispronounced?.length > 0 && (
            <div className="speaking-words">
              <p className="interview-beat__role">気をつける語</p>
              <ul>
                {result.mispronounced.map((word, index) => (
                  <li key={`${word.word}-${index}`}>
                    <span className="speaking-words__word">{word.word}</span>
                    <span className="speaking-words__note">
                      {word.errorType === 'Omission' && '読み飛ばし'}
                      {word.errorType === 'Insertion' && '余計な語'}
                      {word.errorType === 'Mispronunciation' && `発音 ${word.accuracy ?? '-'}`}
                      {word.errorType === 'UnexpectedBreak' && '不要な間'}
                      {word.errorType === 'MissingBreak' && '間が足りない'}
                      {word.errorType === 'Monotone' && '平板'}
                    </span>
                  </li>
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

          {result.transcript && (
            <details className="speaking-transcript">
              <summary>聞き取られた内容</summary>
              <p>{result.transcript}</p>
            </details>
          )}
        </div>
      )}

      {recorder.state === 'idle' && !blob && (
        <p className="speaking-hint">
          <FaPlay aria-hidden="true" /> 録音してから「採点する」を押すと、発音の点が出ます。
        </p>
      )}
      {blob && !result && recorder.state !== 'recording' && !assessing && (
        <p className="speaking-hint">
          <FaRedo aria-hidden="true" /> 納得いくまで録り直せます。
        </p>
      )}
    </div>
  );
}
