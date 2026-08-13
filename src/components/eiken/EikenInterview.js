import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaVolumeUp, FaPlay, FaRedo, FaEye, FaCheck, FaTimes } from 'react-icons/fa';
import SessionHeader from '../learning/SessionHeader';
import {
  INTERVIEW_GRADES,
  buildBeats,
  cardViewFor,
  illustrationUrl,
  loadInterviewCard,
  loadInterviewFlow,
  loadInterviewIndex,
  speechTextsFor,
} from '../../logic/interviewContent';
import { speakSequence, stopSpeaking } from '../../logic/speechUtils';
import { prefetchClips } from '../../logic/audioLibrary';
import logger from '../../logic/logger';
import './EikenInterview.css';

const gradeLabel = (grade) => INTERVIEW_GRADES.find((entry) => entry.id === grade)?.label || grade;

/** 秒を mm:ss に。黙読20秒・ナレーション2分まで扱えればよい。 */
const formatSeconds = (seconds) => {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

/**
 * 面接の場面ひとつぶん。
 *
 * 面接委員のセリフを出して読み上げ、必要なら答え方の見本を見せる。
 * 見本は押さないと出さない。先に見えていると自分で考えなくなる。
 */
function Beat({ beat, revealed, onReveal, onSpeak, branch, onBranch }) {
  const question = beat.question;
  const followUp = question?.followUp;
  const branchAnswer = followUp && branch ? followUp[branch] : null;

  return (
    <div className="interview-beat">
      <p className="interview-beat__role">面接委員</p>
      <p className="interview-beat__line">
        {beat.display}
        <button
          type="button"
          className="interview-speak"
          onClick={() => onSpeak(beat.speech)}
          aria-label="読み上げる"
        >
          <FaVolumeUp aria-hidden="true" />
        </button>
      </p>
      {beat.alt && <p className="interview-beat__alt">または {beat.alt}</p>}
      {beat.ja && <p className="interview-beat__ja">{beat.ja}</p>}

      {followUp && (
        <div className="interview-branch">
          <p className="interview-beat__role">どちらで答える？</p>
          <div className="interview-branch__buttons">
            <button
              type="button"
              className={branch === 'yes' ? 'interview-chip is-active' : 'interview-chip'}
              onClick={() => onBranch('yes')}
            >
              <FaCheck aria-hidden="true" /> Yes
            </button>
            <button
              type="button"
              className={branch === 'no' ? 'interview-chip is-active' : 'interview-chip'}
              onClick={() => onBranch('no')}
            >
              <FaTimes aria-hidden="true" /> No
            </button>
          </div>
          {branchAnswer && (
            <p className="interview-beat__line interview-beat__line--small">
              {branchAnswer.prompt}
              <button
                type="button"
                className="interview-speak"
                onClick={() => onSpeak(branchAnswer.prompt)}
                aria-label="読み上げる"
              >
                <FaVolumeUp aria-hidden="true" />
              </button>
            </p>
          )}
        </div>
      )}

      {(beat.expected || question) && (
        revealed ? (
          <div className="interview-answer">
            <p className="interview-beat__role">答え方の見本</p>
            <p className="interview-answer__text">
              {branchAnswer?.modelAnswer || question?.modelAnswer || beat.expected
                || 'この場面は自分の言葉で答えます。'}
            </p>
            {(branchAnswer?.modelAnswer || question?.modelAnswer || beat.expected) && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => onSpeak(branchAnswer?.modelAnswer || question?.modelAnswer || beat.expected)}
              >
                <FaVolumeUp aria-hidden="true" /> 見本を聞く
              </button>
            )}
          </div>
        ) : (
          <button type="button" className="ghost-button interview-reveal" onClick={onReveal}>
            <FaEye aria-hidden="true" /> 答え方を見る
          </button>
        )
      )}
    </div>
  );
}

/** 黙読・準備・ナレーションの時間を計る。 */
function BeatTimer({ seconds, beatKey }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(false);

  // 場面が変わったら計り直す
  useEffect(() => {
    setRemaining(seconds);
    setRunning(false);
  }, [seconds, beatKey]);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          clearInterval(id);
          setRunning(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div className="interview-timer">
      <span className={remaining === 0 ? 'interview-timer__value is-done' : 'interview-timer__value'}>
        {formatSeconds(remaining)}
      </span>
      <button type="button" className="ghost-button" onClick={() => { setRemaining(seconds); setRunning(true); }}>
        {running ? <><FaRedo aria-hidden="true" /> はじめから</> : <><FaPlay aria-hidden="true" /> はかる</>}
      </button>
    </div>
  );
}

/**
 * 英検二次試験（面接）の練習。
 *
 * 入室から退室までを1場面ずつ進める。素材は public/eiken-interview/。
 * 読み上げは事前生成の音声を先に探し、無ければ端末の読み上げに戻る
 * （speakSequence がその判断をする）。
 */
export default function EikenInterview({ grade, onExit }) {
  const [cards, setCards] = useState(null);
  const [cardId, setCardId] = useState(null);
  const [session, setSession] = useState(null); // { flow, card, beats }
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [branch, setBranch] = useState(null);
  const [error, setError] = useState(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadInterviewIndex()
      .then((index) => {
        if (cancelled) return;
        setCards(index.grades.find((entry) => entry.id === grade)?.cards || []);
      })
      .catch((loadError) => {
        if (cancelled) return;
        logger.warn('面接の一覧を読めませんでした', loadError);
        setError('問題の一覧を読み込めませんでした。通信を確かめてもう一度お試しください。');
      });
    return () => { cancelled = true; };
  }, [grade]);

  useEffect(() => {
    if (!cardId) return undefined;
    let cancelled = false;

    Promise.all([loadInterviewFlow(grade), loadInterviewCard(grade, cardId)])
      .then(([flow, card]) => {
        if (cancelled) return;
        setSession({ flow, card, beats: buildBeats(flow, card) });
        setPosition(0);
        setRevealed(false);
        setBranch(null);
        // セッションの頭でまとめて先読みする。無ければ端末の読み上げに戻るだけ。
        prefetchClips(speechTextsFor(flow, card).map((text) => ({ text, lang: 'en-US' })))
          .catch(() => {});
      })
      .catch((loadError) => {
        if (cancelled) return;
        logger.warn('面接カードを読めませんでした', loadError);
        setError('この問題を読み込めませんでした。ひとつ前に戻ってやり直してください。');
      });

    return () => { cancelled = true; };
  }, [grade, cardId]);

  // 画面を離れるときに読み上げを止める。次の画面に声が残らないように。
  useEffect(() => stopSpeaking, []);

  const beats = session?.beats || [];
  const beat = beats[position] || null;

  const speak = useCallback((text) => {
    if (text) speakSequence([{ text, lang: 'en-US' }]);
  }, []);

  // 場面が変わったら面接委員のセリフを読み上げる。本番は耳から入る。
  useEffect(() => {
    if (!beat) return;
    setRevealed(false);
    setBranch(null);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    speakSequence([{ text: beat.speech, lang: 'en-US' }]);
  }, [beat, speak]);

  const cardView = useMemo(() => cardViewFor(beat), [beat]);
  const card = session?.card;

  const exitSession = () => {
    stopSpeaking();
    setSession(null);
    setCardId(null);
  };

  if (error) {
    return (
      <div className="interview-screen">
        <SessionHeader title={`${gradeLabel(grade)} 二次試験`} current={0} total={0} onBack={onExit} />
        <div className="interview-body">
          <p className="interview-error">{error}</p>
        </div>
      </div>
    );
  }

  // 問題カードを選ぶ
  if (!session) {
    return (
      <div className="interview-screen">
        <SessionHeader title={`${gradeLabel(grade)} 二次試験`} current={0} total={0} onBack={onExit} />
        <div className="interview-body" ref={bodyRef}>
          <p className="interview-lead">
            入室から退室までを通しで練習します。面接委員の言うことは全部英語です。
          </p>
          {cards === null ? (
            <p className="interview-lead">読み込んでいます…</p>
          ) : (
            <div className="list-group">
              {cards.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  className="tile-button"
                  onClick={() => setCardId(entry.id)}
                >
                  <span className="tile-button__label">カード {index + 1}</span>
                  <span className="tile-button__count">{entry.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const isLast = position >= beats.length - 1;

  return (
    <div className="interview-screen">
      <SessionHeader
        title={`${gradeLabel(grade)} 二次試験`}
        current={position + 1}
        total={beats.length}
        onBack={exitSession}
        backLabel="問題を選ぶ"
      />

      <div className="interview-body" ref={bodyRef}>
        {beat && <Beat
          beat={beat}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          onSpeak={speak}
          branch={branch}
          onBranch={setBranch}
        />}

        {beat?.kind === 'timer' && (
          <BeatTimer seconds={beat.timerSeconds} beatKey={beat.key} />
        )}

        {cardView === 'passage' && card?.passage && (
          <div className="interview-card-panel">
            <p className="interview-card-panel__label">問題カード</p>
            <p className="interview-passage">{card.passage.text}</p>
            {beat?.recordsStudent && (
              <button type="button" className="ghost-button" onClick={() => speak(card.passage.text)}>
                <FaVolumeUp aria-hidden="true" /> 見本の音読を聞く
              </button>
            )}
          </div>
        )}

        {cardView === 'illustration' && card?.illustrations?.length > 0 && (
          <div className="interview-card-panel">
            <p className="interview-card-panel__label">問題カード</p>
            {card.narration?.storyLine && (
              <p className="interview-narration">{card.narration.storyLine}</p>
            )}
            {card.narration?.openingSentence && (
              <p className="interview-narration interview-narration--opening">
                {card.narration.openingSentence}
                <button
                  type="button"
                  className="interview-speak"
                  onClick={() => speak(card.narration.openingSentence)}
                  aria-label="読み上げる"
                >
                  <FaVolumeUp aria-hidden="true" />
                </button>
              </p>
            )}
            {card.illustrations.map((illustration) => (
              <figure key={illustration.id} className="interview-figure">
                {/* 見出しは絵の上。下に置くと次の絵の見出しに見える（準2級はA・Bが縦に並ぶ） */}
                {card.illustrations.length > 1 && (
                  <figcaption>Picture {illustration.id.toUpperCase()}</figcaption>
                )}
                <img
                  src={illustrationUrl(illustration.file)}
                  alt={`問題カードのイラスト ${illustration.id.toUpperCase()}`}
                  loading="lazy"
                />
              </figure>
            ))}
          </div>
        )}

        {cardView === 'none' && beat?.phase === 'questions' && beat.kind === 'question' && (
          <p className="interview-note">カードは裏返してあります。見ずに答えます。</p>
        )}

        {session.flow.tips?.length > 0 && position === 0 && (
          <ul className="interview-tips">
            {session.flow.tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        )}
      </div>

      <div className="interview-footer">
        <button
          type="button"
          className="ghost-button"
          onClick={() => setPosition((value) => Math.max(0, value - 1))}
          disabled={position === 0}
        >
          前へ
        </button>
        {isLast ? (
          <button type="button" className="primary-action" onClick={exitSession}>
            終わる
          </button>
        ) : (
          <button
            type="button"
            className="primary-action"
            onClick={() => setPosition((value) => Math.min(beats.length - 1, value + 1))}
          >
            次へ
          </button>
        )}
      </div>
    </div>
  );
}
