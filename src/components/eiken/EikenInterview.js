import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaVolumeUp, FaPlay, FaRedo, FaEye, FaCheck, FaTimes, FaMicrophone, FaStop } from 'react-icons/fa';
import SessionHeader from '../learning/SessionHeader';
import {
  INTERVIEW_GRADES,
  buildBeats,
  cardViewFor,
  illustrationUrl,
  loadInterviewCard,
  loadInterviewFlow,
  loadInterviewIndex,
  speakingFor,
  speechTextsFor,
  tipsFor,
} from '../../logic/interviewContent';
import { speakSequence, stopSpeaking } from '../../logic/speechUtils';
import { prefetchClips } from '../../logic/audioLibrary';
import SpeakingPanel from './SpeakingPanel';
import InterviewResultModal from './InterviewResultModal';
import InterviewWaiting from './InterviewWaiting';
import { canRecord, useRecorder } from '../../logic/useRecorder';
import { reviewAnswer, transcribeSpeaking } from '../../logic/transcribeApi';
import logger from '../../logic/logger';
import './EikenInterview.css';

const gradeLabel = (grade) => INTERVIEW_GRADES.find((entry) => entry.id === grade)?.label || grade;

/** 結果の一覧に出す場面の名前。番号だけだと、あとで見て何の答えか分からない。 */
const labelFor = (beat) => {
  if (beat.stepId === 'read-aloud') return '音読';
  if (beat.stepId === 'narration') return 'ナレーション';
  return `No.${beat.question?.no ?? ''}`;
};

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
  // 話した場面ぶんの記録。採点は最後にまとめて出すので、ここに貯めていく。
  const [answers, setAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  // 採点が一度そろったか。そろったあとは、文字起こしを直して採点し直しても
  // 待ち画面へ戻さない（入力中に画面が入れ替わる）。
  const [resultReady, setResultReady] = useState(false);
  const bodyRef = useRef(null);
  // 録音は画面下のボタンが受け持つので、状態は親が持つ。
  const recorder = useRecorder();
  // 録音を始めた時点の場面。文字起こしが返るころには次の場面へ進んでいることがある。
  const recordingRef = useRef(null);
  const handledBlobRef = useRef(null);
  // 結果画面で聞き返すための URL。recorder のものは録り直しで消えるので別に持つ。
  const clipUrlsRef = useRef([]);

  const updateAnswer = useCallback((key, patch) => {
    setAnswers((current) => current.map(
      (entry) => (entry.key === key ? { ...entry, ...patch } : entry)
    ));
  }, []);

  const dropClips = useCallback(() => {
    clipUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    clipUrlsRef.current = [];
  }, []);

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
        setAnswers([]);
    setResultReady(false);
        setShowResult(false);
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

  // 録音を掴んだままにしない。結果画面を閉じるまでは要るので、ここは離脱時だけ。
  useEffect(() => dropClips, [dropClips]);

  // 毎回新しい配列を作ると、これを見ている useMemo が毎描画で走り直す。
  const beats = useMemo(() => session?.beats || [], [session]);
  const beat = beats[position] || null;

  const speak = useCallback((text) => {
    if (text) speakSequence([{ text, lang: 'en-US' }]);
  }, []);

  // 場面が変わったら面接委員のセリフを読み上げる。本番は耳から入る。
  const { reset: resetRecorder, stop: stopRecorder } = recorder;
  useEffect(() => {
    if (!beat) return;
    setRevealed(false);
    setBranch(null);
    // 前の場面の録音を持ち越さない。違う質問の答えを見てしまう。
    resetRecorder();
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    speakSequence([{ text: beat.speech, lang: 'en-US' }]);
  }, [beat, speak, resetRecorder]);

  const cardView = useMemo(() => cardViewFor(beat), [beat]);
  const card = session?.card;
  const tips = useMemo(() => tipsFor(session?.flow, beat), [session, beat]);
  // まだ文字起こし中／採点待ちの件数。0 になるまで結果を出さない。
  const pending = answers.filter((entry) => entry.status === 'working'
    || entry.reviewing
    || (entry.status === 'done' && !entry.review && !entry.reviewFailed)).length;

  // 声を出す場面すべて。答えなかった場面も結果の分母に入れるために渡す。
  const speakingPlaces = useMemo(() => beats
    .map((entry) => ({ entry, speaking: speakingFor(entry, card) }))
    .filter(({ speaking: place }) => place)
    .map(({ entry, speaking: place }) => ({
      key: entry.key,
      label: labelFor(entry),
      mode: place.mode,
    })), [beats, card]);
  const speaking = useMemo(() => speakingFor(beat, card, branch), [beat, card, branch]);
  // Yes / No を選び直したら別の答えとして扱う。前の枝の答えと混ぜない。
  const speakingKey = beat ? `${beat.key}-${branch || ''}` : null;
  const answer = answers.find((entry) => entry.key === speakingKey) || null;

  /** 録音を始める。いまどの場面かをここで写し取る。 */
  const startRecording = () => {
    recordingRef.current = {
      key: speakingKey,
      // 枝（Yes / No）を含まない場面のキー。結果で「答えていない場面」と
      // 突き合わせるのに使う。
      beatKey: beat.key,
      order: position,
      label: labelFor(beat),
      mode: speaking.mode,
      referenceText: speaking.referenceText || null,
      question: speaking.question || null,
      modelAnswer: speaking.modelAnswer || null,
    };
    recorder.start();
  };

  // 録り終えたら、押させずに文字にする。返るまでに次の場面へ進んでも困らない
  // よう、送る材料は録音を始めたときの写し（recordingRef）を使う。
  const { blob: recordedBlob, seconds: recordedSeconds } = recorder;
  useEffect(() => {
    if (!recordedBlob || recordedBlob === handledBlobRef.current) return;
    handledBlobRef.current = recordedBlob;

    const context = recordingRef.current;
    if (!context) return;

    const url = URL.createObjectURL(recordedBlob);
    clipUrlsRef.current.push(url);

    setAnswers((current) => {
      // 録り直したら前の録音は結果から外す（URL はセッションの終わりにまとめて捨てる）。
      const entry = {
        ...context,
        url,
        seconds: recordedSeconds,
        status: 'working',
        transcript: '',
        edited: false,
        review: null,
      };
      return [...current.filter((item) => item.key !== context.key), entry]
        .sort((a, b) => a.order - b.order);
    });

    transcribeSpeaking(recordedBlob, { mode: context.mode, referenceText: context.referenceText })
      .then(({ transcript }) => updateAnswer(context.key, { transcript, status: 'done' }))
      .catch((transcribeError) => {
        logger.warn('文字起こしできませんでした', transcribeError);
        updateAnswer(context.key, { status: 'failed', failure: transcribeError.message });
      });

    // 言い終えたら次の場面へ。本番の面接は待ってくれないし、文字起こしを
    // 眺めて待つ時間が練習の邪魔になる。文字起こしは裏で進み、直すのは
    // 結果画面でできる（送る材料は上の写しなので、進んでも取り違えない）。
    setPosition((value) => Math.min(beats.length - 1, value + 1));
  }, [recordedBlob, recordedSeconds, updateAnswer, beats.length]);

  // 一度そろったら、以後は待ち画面へ戻さない。
  useEffect(() => {
    if (showResult && pending === 0) setResultReady(true);
  }, [showResult, pending]);

  // 結果を開いたら、まだ見てもらっていない答えを判定にかける。
  // 直したあとの文で判定するので、録音した時点ではなくここで呼ぶ。
  useEffect(() => {
    if (!showResult) return;
    for (const entry of answers) {
      // 失敗した答えをここで数え直すと、失敗するたびに投げ直して止まらなくなる。
      // 直せば（editTranscript が印を消す）もう一度かかる。
      if (entry.status !== 'done' || entry.review || entry.reviewing || entry.reviewFailed) continue;
      updateAnswer(entry.key, { reviewing: true, failure: null });
      reviewAnswer({
        mode: entry.mode,
        transcript: entry.transcript,
        referenceText: entry.referenceText,
        question: entry.question,
        modelAnswer: entry.modelAnswer,
        grade,
      })
        .then((review) => updateAnswer(entry.key, { review: review || {}, reviewing: false }))
        .catch((reviewError) => {
          logger.warn('答えを見てもらえませんでした', reviewError);
          updateAnswer(entry.key, {
            reviewing: false,
            reviewFailed: true,
            failure: reviewError.message,
          });
        });
    }
  }, [showResult, answers, grade, updateAnswer]);

  /** 文字起こしを直す。判定はやり直しになるので捨てる。 */
  const editTranscript = (key, transcript) => {
    updateAnswer(key, {
      transcript, edited: true, review: null, reviewFailed: false,
    });
  };

  const exitSession = () => {
    stopSpeaking();
    dropClips();
    setAnswers([]);
    setResultReady(false);
    setShowResult(false);
    setSession(null);
    setCardId(null);
  };

  /** 同じカードを頭から。前の録音と判定は残さない。 */
  const restartSession = () => {
    stopSpeaking();
    dropClips();
    setAnswers([]);
    setResultReady(false);
    setShowResult(false);
    setPosition(0);
    setRevealed(false);
    setBranch(null);
    resetRecorder();
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

        {/* 心得はそれが要る場面に出す。話す前に目に入る位置（録音の上）に置く。 */}
        {tips.length > 0 && (
          <ul className="interview-tips">
            {tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        )}

        {/* 録音したものは本文の下に置く。読む英文や絵を押しのけると、
            話している途中で本文を見失う。 */}
        {speaking && (
          <SpeakingPanel
            recorder={recorder}
            answer={answer}
            onEditTranscript={editTranscript}
          />
        )}

      </div>

      {/* 操作は下にまとめる。話す場面では真ん中にマイクが出る。 */}
      <div className="interview-footer">
        <button
          type="button"
          className="ghost-button interview-footer__step"
          onClick={() => setPosition((value) => Math.max(0, value - 1))}
          disabled={position === 0}
        >
          前へ
        </button>

        {speaking && canRecord() && (
          recorder.state === 'recording' ? (
            <button
              type="button"
              className="interview-mic is-recording"
              onClick={stopRecorder}
              aria-label="録音を止める"
            >
              <FaStop aria-hidden="true" />
              <span className="interview-mic__time">{formatSeconds(recorder.seconds)}</span>
            </button>
          ) : (
            <button
              type="button"
              className="interview-mic"
              onClick={startRecording}
              aria-label={recorder.blob ? '録り直す' : '録音する'}
            >
              <FaMicrophone aria-hidden="true" />
            </button>
          )
        )}

        {isLast ? (
          <button
            type="button"
            className="primary-action interview-footer__step"
            onClick={answers.length > 0 ? () => { stopSpeaking(); setShowResult(true); } : exitSession}
          >
            {answers.length > 0 ? '結果を見る' : '終わる'}
          </button>
        ) : (
          <button
            type="button"
            className="primary-action interview-footer__step"
            onClick={() => setPosition((value) => Math.min(beats.length - 1, value + 1))}
          >
            次へ
          </button>
        )}
      </div>

      {showResult && !resultReady && (
        <InterviewWaiting
          tips={(session.flow.tips || []).map((tip) => tip.text)}
          done={answers.length - pending}
          total={answers.length}
        />
      )}

      {showResult && resultReady && (
        <InterviewResultModal
          title={`${gradeLabel(grade)} ${card?.title || ''}`}
          answers={answers}
          places={speakingPlaces}
          onSpeak={speak}
          onEditTranscript={editTranscript}
          onClose={() => setShowResult(false)}
          onRestart={restartSession}
          onExit={exitSession}
        />
      )}
    </div>
  );
}
