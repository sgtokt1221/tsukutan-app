import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaArrowLeft, FaMicrophone, FaStop, FaPlay, FaStar } from 'react-icons/fa';
import ReadingView, { READING_MODES } from './ReadingView';
import {
  loadReading, loadReadingIndex, readingEnglish, speechPlanFor,
} from '../../logic/readingContent';
import { readingGradeFor, EIKEN_LABELS } from '../../logic/readingLevel';
import { speakSequence, stopSpeaking } from '../../logic/speechUtils';
import { canRecord, useRecorder } from '../../logic/useRecorder';
import { transcribeSpeaking } from '../../logic/transcribeApi';
import logger from '../../logic/logger';
import { loadWordMaster } from '../../logic/wordMaster';
import { buildWordIndex, buildPhraseIndex, findWord } from '../../logic/wordLookup';
import { useBookmarks } from '../../logic/useBookmarks';
import { useReadingZoom, MIN_ZOOM, MAX_ZOOM } from '../../logic/useReadingZoom';
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

export default function ReadingPanel({ schoolGrade, abilityLevel, goalTargets, userId }) {
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

  // 長押しで「毎日みる」に入れるための照合。本文の語は活用しているので、
  // 単語カードのデータと突き合わせてから登録する。
  const [wordIndex, setWordIndex] = useState(null);
  const [phraseIndex, setPhraseIndex] = useState(null);
  const [picked, setPicked] = useState(null);
  const { isBookmarked, toggle: toggleBookmark } = useBookmarks(userId);

  useEffect(() => {
    loadWordMaster()
      .then((master) => { setWordIndex(buildWordIndex(master)); setPhraseIndex(buildPhraseIndex(master)); })
      .catch((loadError) => logger.warn('単語カードを読めませんでした', loadError));
  }, []);

  /**
   * 本文を長押ししたとき。熟語のまとまりならその熟語を、そうでなければ
   * 語をカードから引いて登録する。引けなければ登録しない。
   */
  const holdWord = useCallback((token, { phrase, at } = {}) => {
    const word = phrase || findWord(token, wordIndex);
    if (!word) {
      setPicked({ token, at, missing: true });
      return;
    }
    toggleBookmark(word);
    setPicked({ token, at, word, added: !isBookmarked(word) });
  }, [wordIndex, toggleBookmark, isBookmarked]);

  /** その語が登録済みか。本文の見た目に印を付ける。 */
  const markedWord = useCallback((token, phrase) => {
    const word = phrase || findWord(token, wordIndex);
    return Boolean(word) && isBookmarked(word);
  }, [wordIndex, isBookmarked]);

  // ふきだしは少し置いて消す。押しっぱなしにすると本文が隠れる。
  useEffect(() => {
    if (!picked) return undefined;
    const id = setTimeout(() => setPicked(null), 2200);
    return () => clearTimeout(id);
  }, [picked]);

  const [zoom, setZoom] = useReadingZoom();

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

  // 通しで読み上げている最中か。止める口を出すのに使う。
  const [readingAll, setReadingAll] = useState(false);

  /** 通しで読み上げる。和訳モードなら日本語も混ぜる。 */
  const readAll = useCallback(() => {
    if (!reading) return;
    stopSpeaking();
    setSpeakingIndex(null);
    setReadingAll(true);
    const plan = reading.sentences.flatMap((sentence) => speechPlanFor(sentence, mode === 'ja'));
    // speakSequence は Promise を返さない。読み終わりは onDone で受ける。
    speakSequence(plan, { onDone: () => setReadingAll(false) });
  }, [reading, mode]);

  const stopAll = useCallback(() => {
    stopSpeaking();
    setReadingAll(false);
    setSpeakingIndex(null);
  }, []);

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

        {/* 文字サイズ。長文は読むものなので、単語帳とは別に持つ。 */}
        <label className="reading-zoom">
          <span className="reading-zoom__mark" aria-hidden="true">A</span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step="10"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label={`文字の大きさ ${zoom}%`}
          />
          <span className="reading-zoom__mark reading-zoom__mark--large" aria-hidden="true">A</span>
        </label>

        <p className="reading-note">語を長押しすると「毎日みる」に入ります。</p>

        <div className="reading-scale" style={{ '--reading-zoom': zoom / 100 }}>
        <ReadingView
          reading={reading}
          mode={mode}
          speakingIndex={speakingIndex}
          onSpeak={speak}
          onStop={stop}
          phrases={phraseIndex}
          isMarked={markedWord}
          onHold={holdWord}
        />

        </div>

        {/* 長押しの結果。押した指のすぐ上に出す。画面の下に置くと、
            スクロール位置によっては見えないまま消える。 */}
        {picked?.at && (
          <p
            className={picked.missing ? 'reading-picked is-missing' : 'reading-picked'}
            role="status"
            style={{ left: picked.at.x, top: picked.at.y }}
          >
            {picked.missing
              ? `「${picked.token}」は単語カードにありません`
              : (
                <>
                  <FaStar aria-hidden="true" />{' '}
                  {picked.word.word}
                  {picked.added ? ' を毎日みるに入れました' : ' を毎日みるから外しました'}
                </>
              )}
          </p>
        )}

        {/* 音読の結果。操作そのものは下に浮かせたボタンへ移した。 */}
        {(aloud || recorder.state === 'recording') && (
          <div className="reading-aloud">
            <p className="home-section-eyebrow">音読</p>
            {recorder.state === 'recording' && <p className="reading-note">読み終わったら、下のボタンで止めてください。</p>}
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

      {/* 読み上げと音読は、本文のどこを読んでいても押せるように浮かせる。
          本文の一番下に置くと、長い読みものでは毎回スクロールして戻ることになる。 */}
      <div className="reading-dock">
        <button
          type="button"
          className={readingAll ? 'reading-dock__button is-active' : 'reading-dock__button'}
          onClick={readingAll ? stopAll : readAll}
          aria-label={readingAll ? '読み上げを止める' : '読み上げる'}
        >
          {readingAll ? <FaStop aria-hidden="true" /> : <FaPlay aria-hidden="true" />}
          <span>読み上げ</span>
        </button>

        {canRecord() && (
          <button
            type="button"
            className={recorder.state === 'recording'
              ? 'reading-dock__button is-recording'
              : 'reading-dock__button'}
            onClick={() => {
              if (recorder.state === 'recording') { stopRecorder(); return; }
              stop();
              setAloud(null);
              handledBlobRef.current = null;
              recorder.start();
            }}
            aria-label={recorder.state === 'recording' ? '音読を止める' : '音読する'}
          >
            {recorder.state === 'recording' ? <FaStop aria-hidden="true" /> : <FaMicrophone aria-hidden="true" />}
            <span>音読</span>
          </button>
        )}
      </div>
    </div>
  );
}
