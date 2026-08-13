import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaArrowLeft, FaMicrophone, FaStop, FaPlay } from 'react-icons/fa';
import ReadingView, { READING_MODES } from './ReadingView';
import {
  loadReading, loadReadingIndex, readingEnglish, speechPlanFor,
} from '../../logic/readingContent';
import { readingGradeFor, EIKEN_LABELS } from '../../logic/readingLevel';
import { speakSequence, stopSpeaking } from '../../logic/speechUtils';
import { canRecord, useRecorder } from '../../logic/useRecorder';
import { transcribeSpeaking } from '../../logic/transcribeApi';
import logger from '../../logic/logger';
import './Reading.css';

/**
 * 「長文」タブの読みもの。級ごと・カテゴリごとの作り置きを読む。
 *
 * 級は学年・本人の力・目標から決める（readingLevel.js）。決め打ちにすると、
 * 英検2級を目指している中2に4級の長文が出る。
 *
 * 音読モードは面接の音読と同じ仕組み（scripted）。読み飛ばした語が返るので、
 * 「読めた割合」を出せる。発音は測らない。
 */

export default function ReadingPanel({ schoolGrade, abilityLevel, goalTargets }) {
  const [index, setIndex] = useState(null);
  const [grade, setGrade] = useState(null);
  const [reading, setReading] = useState(null);
  const [mode, setMode] = useState('plain');
  const [error, setError] = useState(null);

  // 読み上げ中の文。押した文だけ光らせる。
  const [speakingIndex, setSpeakingIndex] = useState(null);
  // 音読の結果 { total, missing } / 待ち状態
  const [aloud, setAloud] = useState(null);
  const recorder = useRecorder();
  const handledBlobRef = useRef(null);

  useEffect(() => {
    loadReadingIndex()
      .then(setIndex)
      .catch((loadError) => {
        logger.warn('長文の一覧を読めませんでした', loadError);
        setError('読みものの一覧を読み込めませんでした。通信を確かめてもう一度お試しください。');
      });
  }, []);

  // 用意のある級の中から、その生徒に合う級を選ぶ
  useEffect(() => {
    if (!index || grade) return;
    setGrade(readingGradeFor({
      schoolGrade,
      abilityLevel,
      goalTargets,
      available: index.grades.map((entry) => entry.id),
    }));
  }, [index, grade, schoolGrade, abilityLevel, goalTargets]);

  useEffect(() => stopSpeaking, []);

  const speak = useCallback((sentenceIndex, plan) => {
    stopSpeaking();
    setSpeakingIndex(sentenceIndex);
    speakSequence(plan);
  }, []);

  const stop = useCallback(() => {
    stopSpeaking();
    setSpeakingIndex(null);
  }, []);

  /** 通しで読み上げる。和訳モードなら日本語も混ぜる。 */
  const readAll = useCallback(() => {
    if (!reading) return;
    stopSpeaking();
    setSpeakingIndex(null);
    speakSequence(reading.sentences.flatMap((sentence) => speechPlanFor(sentence, mode === 'ja')));
  }, [reading, mode]);

  // 録り終えたら文字起こしへ送る。押させるボタンは置かない。
  const { blob, stop: stopRecorder, reset: resetRecorder } = recorder;
  useEffect(() => {
    if (!blob || blob === handledBlobRef.current || !reading) return;
    handledBlobRef.current = blob;

    setAloud({ working: true });
    transcribeSpeaking(blob, { mode: 'scripted', referenceText: readingEnglish(reading) })
      .then((result) => setAloud({ ...result, working: false }))
      .catch((transcribeError) => {
        logger.warn('音読を聞き取れませんでした', transcribeError);
        setAloud({ working: false, failure: transcribeError.message });
      });
  }, [blob, reading]);

  const openReading = (entry) => {
    stop();
    setAloud(null);
    resetRecorder();
    handledBlobRef.current = null;
    loadReading(grade, entry.id)
      .then(setReading)
      .catch((loadError) => {
        logger.warn('長文を読めませんでした', loadError);
        setError('読みものを読み込めませんでした。');
      });
  };

  const gradeEntry = useMemo(
    () => index?.grades.find((entry) => entry.id === grade) || null,
    [index, grade]
  );
  const categoryLabel = useMemo(() => Object.fromEntries(
    (index?.categories || []).map((entry) => [entry.id, entry.label])
  ), [index]);

  if (error) return <div className="story-tab-content"><p className="message-box message-box-error">{error}</p></div>;
  if (!index || !grade) return <div className="story-tab-content"><p className="reading-note">読み込んでいます…</p></div>;

  // 一覧
  if (!reading) {
    return (
      <div className="story-tab-content">
        <div className="section-card">
          <h2 className="section-title">読みもの</h2>
          <p className="reading-note">
            いまは <strong>{EIKEN_LABELS[grade]}</strong> の読みものを出しています。
          </p>

          <div className="reading-grades" role="tablist" aria-label="級">
            {index.grades.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === grade}
                className={entry.id === grade ? 'reading-grade is-active' : 'reading-grade'}
                onClick={() => setGrade(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="reading-list">
            {(gradeEntry?.readings || []).map((entry) => (
              <button key={entry.id} type="button" className="reading-item" onClick={() => openReading(entry)}>
                <span className="reading-item__category">{categoryLabel[entry.category] || entry.category}</span>
                <span className="reading-item__title">{entry.title}</span>
                <span className="reading-item__title-ja">{entry.titleJa}</span>
              </button>
            ))}
            {(gradeEntry?.readings || []).length === 0 && (
              <p className="reading-note">この級の読みものはまだありません。</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const readAloudScore = aloud && !aloud.working && aloud.total
    ? Math.round(((aloud.total - (aloud.missing?.length || 0)) / aloud.total) * 100)
    : null;

  // 本文
  return (
    <div className="story-tab-content">
      <div className="section-card">
        <div className="reading-head">
          <button type="button" className="free-study-back" onClick={() => { stop(); setReading(null); }} aria-label="一覧に戻る">
            <FaArrowLeft aria-hidden="true" />
          </button>
          <div>
            <p className="home-section-eyebrow">{EIKEN_LABELS[reading.grade]}</p>
            <p className="reading-title">{reading.title}</p>
            <p className="reading-title-ja">{reading.titleJa}</p>
          </div>
        </div>

        <div className="reading-modes" role="tablist" aria-label="見せ方">
          {READING_MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === mode}
              className={entry.id === mode ? 'reading-mode is-active' : 'reading-mode'}
              onClick={() => { stop(); setMode(entry.id); }}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {mode === 'slash' && <p className="reading-note">まとまりを押すと、そこの訳が出ます。</p>}

        <button type="button" className="ghost-button reading-readall" onClick={readAll}>
          <FaPlay aria-hidden="true" /> 通して読み上げる{mode === 'ja' && '（英語→日本語）'}
        </button>

        <ReadingView
          reading={reading}
          mode={mode}
          speakingIndex={speakingIndex}
          onSpeak={speak}
          onStop={stop}
        />

        {/* 音読。面接の音読と同じ仕組みで、読み飛ばした語を見る。 */}
        {canRecord() && (
          <div className="reading-aloud">
            <p className="home-section-eyebrow">音読</p>
            {recorder.state === 'recording' ? (
              <button type="button" className="reading-aloud__mic is-recording" onClick={stopRecorder}>
                <FaStop aria-hidden="true" /> 読み終わったら止める
              </button>
            ) : (
              <button
                type="button"
                className="reading-aloud__mic"
                onClick={() => { stop(); setAloud(null); handledBlobRef.current = null; recorder.start(); }}
              >
                <FaMicrophone aria-hidden="true" /> {aloud ? 'もう一度読む' : '声に出して読む'}
              </button>
            )}

            {aloud?.working && <p className="reading-note">聞き取っています…</p>}
            {aloud?.failure && <p className="message-box message-box-error">{aloud.failure}</p>}
            {readAloudScore !== null && (
              <>
                <p className="reading-aloud__score">読めた語 {readAloudScore}%</p>
                {aloud.missing?.length > 0 && (
                  <p className="reading-note">読み飛ばした語: {aloud.missing.join(' / ')}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
