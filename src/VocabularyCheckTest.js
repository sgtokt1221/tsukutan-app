import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { db, auth } from './firebaseConfig';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateUserWordProgress } from './logic/reviewLogic';
import { logStudySession } from './logic/studyLogger';
import { updateProgressPercentage } from './logic/progressLogic';
import { FaCheck, FaTimes, FaRegCircle } from 'react-icons/fa';
import {
  CheckTestTopBar, DifficultyMeter, StageBanner, Deck, Burst,
} from './components/assessment/CheckTestParts';
import SwipeIntent from './components/learning/SwipeIntent';
import CoachModal from './components/learning/CoachModal';
import { TEST_SWIPE, HOLD_MS, TAP_SLOP } from './logic/cardGestures';
import { testIntentAt, testIntentText } from './logic/swipeIntent';
import { useSeenOnce, TEST_COACH_KEY } from './logic/useSeenOnce';
import {
  createInitialState,
  selectQuestions,
  recordAnswer,
  undoLastAnswer,
  isStageComplete,
  completeStage,
  questionsForStage,
  totalScore,
  computeResultLevel,
  resultAbility,
  estimateRemaining,
} from './logic/placementTestEngine';
import { expectedVocabulary } from './logic/abilityEstimate';

/**
 * めくって答えを見せてから、次のカードへ進むまでの間（ミリ秒）。
 * **読み上げはしない**（2026-09-26）。テストは力を測るもので、ここで覚えさせる必要は無い。
 * 以前は英語→意味を読み終えるまで待っていて、1問ごとに数秒かかっていた。
 */
export const REVEAL_PAUSE_MS = 900;
/** そのうち最後のこれだけの時間で、カードを払った向きへ飛ばす（ミリ秒） */
const LEAVE_MS = 260;

/**
 * 単語力チェックテスト。
 *
 * 判定は src/logic/placementTestEngine.js が持つ。ここは表示と入力だけを扱う。
 * 難易度が動くのはステージを締めたときだけなので、5問目で調整が入っても
 * ステージが作り直されることはない。
 *
 * ## 答えたら毎回めくれて読み上げる（2026-09-24）
 * 1. 表（英単語）だけを見て「わかる／わからない」を答える。**答える前にはめくれない**
 * 2. 答えた瞬間にカードがめくれ、英語 → 意味を読み上げる（答え合わせ）。裏に自分の答えも出す
 * 3. 読み終えたら少し置いて自動で次へ
 * もとは答える前にダブルタップで見られて、見てからの「わかる」を半分として数えていたが、
 * 最終の判定ではその区別が抜けていて満点扱いになり、2回タップすれば印も消えていた。
 * 答え合わせを全問に付けたので、答える前に見る道そのものを無くした。
 */
export default function VocabularyCheckTest({ allWords: passedWords, onTestComplete, onCancel }) {
  const navigate = useNavigate();

  // 単語は呼び出し元が渡す。ここで巨大なJSONを import しない（計画書13.5）。
  const words = useMemo(
    () => (passedWords || []).filter((word) => word && word.id && word.word && (word.meaning || word.japanese)),
    [passedWords]
  );

  const [engine, setEngine] = useState(() => createInitialState());
  const [coachSeen, markCoachSeen] = useSeenOnce(TEST_COACH_KEY);
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  /*
    **長押しの間だけ答えをのぞける**（2026-09-26）。のぞいてから答えたら revealed として記録し、
    「わかる」は半分だけ知っていた扱いにする（placementTestEngine の answerScore / abilityEstimate）。
    のぞけるのに満点で数えると、見てから「わかる」を押すだけでランクが上がる
  */
  const [peeking, setPeeking] = useState(false);
  // 答えたカードが飛んでいく向き（'good' は右、'again' は左）。次の問題で消す
  const [leaving, setLeaving] = useState(null);
  // 「わかる」の花火。数を変えると1回鳴る
  const [burst, setBurst] = useState(0);

  const peekTimerRef = useRef(null);
  const peekedRef = useRef(false);
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [saveError, setSaveError] = useState(null);
  // 回答が少ないまま抜けようとしたときの確認
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // 'ask'（答える）/ 'reveal'（めくって読み上げている）。reveal 中は答えを受け付けない
  const [phase, setPhase] = useState('ask');
  // 裏に出す「あなたの答え」
  const [lastAnswer, setLastAnswer] = useState(null);
  /*
    **答えの受け付けは ref で鍵を掛ける。** state だけだと、同じ瞬間の2回の押下が
    どちらも 'ask' を見てしまい、回答は1件なのに問題が2つ進んでいた（連打で1問飛ぶ）
  */
  const answeringRef = useRef(false);
  // 答えた時点の結果。読み上げが終わってから、これで次へ進める
  const pendingRef = useRef(null);
  const timersRef = useRef([]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  // 答えになる距離（TEST_SWIPE）で色が振り切れる。札の円が一周するのと同じところ
  const cardColor = useTransform(x, [-TEST_SWIPE, 0, TEST_SWIPE], ['#fecaca', '#ffffff', '#d9f99d']);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  }, []);

  // 画面を離れるときは待ちを止める
  useEffect(() => () => { clearTimers(); }, [clearTimers]);

  // ステージごとに出した問題。「前の問題」で前のステージへ戻ったとき、同じ問題を出し直す
  const stageQuestionsRef = useRef({});

  // ステージが変わったときだけ問題を組み直す。
  // 依存を stage / targetLevel に絞ってあるので、回答のたびに作り直されることはない。
  useEffect(() => {
    if (words.length === 0 || engine.completed) return;
    const key = `${engine.stage}:${engine.targetLevel}`;
    const picked = stageQuestionsRef.current[key] || selectQuestions(
      words,
      engine.targetLevel,
      questionsForStage(engine.stage),
      engine.askedIds
    );
    stageQuestionsRef.current[key] = picked;
    setQuestions(picked);
    // 新しいステージなら1問目。前のステージへ戻ったなら、取り消した問題から
    setQuestionIndex(Math.min(engine.stageAnswers.length, Math.max(0, picked.length - 1)));
    setIsFlipped(false);
    setPhase('ask');
    setLastAnswer(null);
    answeringRef.current = false;
    setQuestionStartTime(Date.now());
    x.set(0);
    y.set(0);
    // askedIds はステージ内で増えるが、問題の再生成には使わない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, engine.stage, engine.targetLevel, engine.completed]);

  const finishTestAndSave = useCallback(async (finalState) => {
    const finalLevel = finalState.resultLevel ?? computeResultLevel(finalState);
    const user = auth.currentUser;
    if (!user) {
      setSaveError('ログイン状態を確認できませんでした。もう一度ログインしてください。');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    // 推定語彙数は、推定した力から「各レベルの語数 × 知っていそうな割合」を足して出す。
    // 以前は判定レベル以下を全部知っているとして数え、7通りの数字しか出なかった
    const ability = resultAbility(finalState);
    const estimatedVocabulary = expectedVocabulary(words, ability);
    const answers = finalState.allAnswers;
    const averageResponseTime = answers.length > 0
      ? answers.reduce((sum, answer) => sum + (answer.responseTime || 0), 0) / answers.length
      : 0;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        level: finalLevel,
        // 到達語数そのものは updateProgressPercentage が和集合で数え直す。
        // ここではテストの推定値だけを残す。
        'progress.assessedVocabulary': estimatedVocabulary,
        // ホームの「いま N語」を同じ推定で数えるため（vocabularyCount.js の reachedWordCount）
        'progress.assessedAbility': ability == null ? null : Math.round(ability * 100) / 100,
        'progress.lastCheckedAt': serverTimestamp(),
      });

      await logStudySession(user.uid, {
        sessionType: 'placement_test',
        finalLevel,
        estimatedVocabulary,
        totalQuestions: answers.length,
        correctCount: totalScore(finalState),
        accuracy: answers.length > 0 ? totalScore(finalState) / answers.length : 0,
        averageResponseTime,
        stagesPlayed: finalState.stage - 1,
        responseTimes: answers,
        timestamp: new Date(),
      });

      await updateProgressPercentage(user.uid);

      // 保存に成功したときだけ完了画面へ進む（計画書11.6）
      if (onTestComplete) {
        // 結果画面の「推定語彙数」は、ここで保存した値を出す（目標の語数と食い違っていた）
        onTestComplete(finalLevel, answers, estimatedVocabulary, ability);
      } else {
        navigate('/student-dashboard');
      }
    } catch (error) {
      console.error('テスト結果の保存に失敗しました:', error);
      setSaveError('テスト結果を保存できませんでした。通信状態を確認して、もう一度お試しください。');
    } finally {
      setIsSaving(false);
    }
  }, [words, onTestComplete, navigate]);

  /** 答えを見せた。少し置いて次へ進む。**1回だけ** */
  const finishReveal = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || pending.finishing) return;
    pending.finishing = true;
    clearTimers();
    // 見せ終わる少し前に、払った向きへ飛ばす
    const lastAnswer = pending.next.allAnswers[pending.next.allAnswers.length - 1];
    timersRef.current.push(setTimeout(
      () => setLeaving(lastAnswer?.isCorrect ? 'good' : 'again'),
      Math.max(0, REVEAL_PAUSE_MS - LEAVE_MS),
    ));
    timersRef.current.push(setTimeout(async () => {
      pendingRef.current = null;
      let { next } = pending;
      // 候補が足りずステージの予定問題数に満たないことがあるので、
      // 用意した問題を使い切った時点でもステージを締める。
      if (pending.usedAllQuestions || isStageComplete(next)) {
        next = completeStage(next);
        setEngine(next);
        if (next.completed) {
          // 書き込みを取りこぼさないよう待ってから保存へ進む
          await pending.reviewWrite.catch(() => {});
          await finishTestAndSave(next);
        }
        // 次のステージの問題は、ステージが変わったのを見て組み直す（上の useEffect）
        return;
      }
      setQuestionIndex((prev) => prev + 1);
      setIsFlipped(false);
      setPhase('ask');
      setLastAnswer(null);
      setQuestionStartTime(Date.now());
      x.set(0);
      y.set(0);
      answeringRef.current = false;
    }, REVEAL_PAUSE_MS));
  }, [clearTimers, finishTestAndSave, x, y]);

  const answerCurrent = useCallback((isCorrect) => {
    const currentWord = questions[questionIndex];
    if (!currentWord || isSaving || engine.completed || answeringRef.current) return;
    answeringRef.current = true;

    const responseTime = questionStartTime ? Date.now() - questionStartTime : 0;
    const next = recordAnswer(engine, {
      wordId: currentWord.id,
      wordLevel: currentWord.level,
      isCorrect,
      responseTime,
      // 長押しで答えをのぞいてから答えたか
      revealed: peekedRef.current,
    });
    setEngine(next);

    // 不正解の単語は復習リストへ
    const user = auth.currentUser;
    const reviewWrite = !isCorrect && user
      ? updateUserWordProgress(user.uid, currentWord, false)
      : Promise.resolve();

    pendingRef.current = {
      next,
      reviewWrite,
      usedAllQuestions: questionIndex >= questions.length - 1,
      finishing: false,
    };

    // めくって答えを見せ、すぐ次へ（読み上げはしない）
    if (isCorrect) setBurst((n) => n + 1);
    setLastAnswer(isCorrect);
    setPhase('reveal');
    setIsFlipped(true);
    x.set(0);
    y.set(0);
    finishReveal();
  }, [questions, questionIndex, engine, questionStartTime, isSaving, finishReveal, x, y]);

  const startPeek = () => {
    if (phase !== 'ask') return;
    clearTimeout(peekTimerRef.current);
    peekTimerRef.current = setTimeout(() => {
      peekedRef.current = true;
      setPeeking(true);
    }, HOLD_MS);
  };
  const stopPeek = () => {
    clearTimeout(peekTimerRef.current);
    setPeeking(false);
  };
  // 次の問題（前の問題へ戻ったときも）では、のぞいた印を消す
  useEffect(() => {
    peekedRef.current = false;
    setPeeking(false);
    setLeaving(null);
  }, [questionIndex, questions]);
  useEffect(() => () => clearTimeout(peekTimerRef.current), []);

  // 答えたら札は出さない。離したあとカードが戻る動きで、円が減っていくように見えた
  const intentAt = useCallback((dx) => (phase === 'ask' ? testIntentAt(dx) : null), [phase]);

  const handleDragEnd = (event, info) => {
    // 閾値は札（SwipeIntent）と同じ定数。ずれると札は「決まり」なのに答えにならない
    if (Math.abs(info.offset.x) < TEST_SWIPE) {
      x.set(0);
      return;
    }
    answerCurrent(info.offset.x > 0);
  };

  // 前の問題へ戻る。直前の回答は取り消すが、同じ単語は再出題しない。
  // ステージの1問目なら前のステージの最後の問題へ（位置は上の useEffect が合わせる）
  const canGoBack = questionIndex > 0 || Boolean(engine.previousStage);
  const handlePrevQuestion = () => {
    if (!canGoBack || phase !== 'ask') return;
    setEngine((prev) => undoLastAnswer(prev));
    if (questionIndex > 0) setQuestionIndex((prev) => prev - 1);
    setIsFlipped(false);
    setQuestionStartTime(Date.now());
    x.set(0);
    y.set(0);
  };

  const handleLeave = () => {
    clearTimers();
    // めくっている途中で止めた。「続ける」を選んだら、もう一度次へ進められるようにしておく
    if (pendingRef.current) pendingRef.current.finishing = false;
    /*
      **判定が終わる前に抜けた結果は保存しない**（2026-09-24）。
      以前は15問を超えていれば、その時点の見込みで保存していた。レベル5・6の語を1問も
      出していないのにレベル6として保存され、前回ちゃんと受けた結果を上書きしていた。
      保存するのは最後まで答えたとき（finishReveal → finishTestAndSave）だけ。
    */
    if (engine.allAnswers.length > 0) {
      setConfirmLeave(true);
      return;
    }
    leaveWithoutSaving();
  };

  // テストは画面内のモード切替で表示している。ルートではないため
  // navigate('/student-dashboard') では抜けられない（押しても何も起きなかった）。
  // 親から渡された戻り方を使う。
  const leaveWithoutSaving = () => {
    if (onCancel) onCancel();
    else navigate('/student-dashboard');
  };

  if (confirmLeave) {
    return (
      <div className="loading-container">
        <div className="app-status-card">
          <h1 className="app-status-title">結果は保存されません</h1>
          <p className="app-status-message">
            レベルの判定が終わる前にやめると、途中までの結果は保存されません。
            （今 {engine.allAnswers.length} 問）
            ここでやめると、今のレベルはそのままになります。
          </p>
          <button
            type="button"
            className="primary-action"
            onClick={() => { setConfirmLeave(false); if (phase === 'reveal') finishReveal(); }}
          >
            テストを続ける
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={leaveWithoutSaving}
          >
            結果を破棄して戻る
          </button>
        </div>
      </div>
    );
  }

  if (saveError) {
    return (
      <div className="loading-container">
        <div className="app-status-card">
          <h1 className="app-status-title">結果を保存できませんでした</h1>
          <p className="app-status-message">{saveError}</p>
          <button
            type="button"
            className="primary-action"
            onClick={() => finishTestAndSave({ ...engine, resultLevel: computeResultLevel(engine) })}
          >
            もう一度保存する
          </button>
        </div>
      </div>
    );
  }

  // 判定が終わったら出題画面は畳む。回答ボタンを残すと二重に保存されてしまう。
  if (engine.completed || isSaving) {
    return <div className="loading-container"><p>結果を保存しています...</p></div>;
  }

  if (words.length === 0 || questions.length === 0 || !questions[questionIndex]) {
    return <div className="loading-container"><p>テスト問題を準備中...</p></div>;
  }

  const currentWord = questions[questionIndex];
  const remaining = estimateRemaining(engine);
  const leaveX = leaving === 'good' ? 480 : leaving === 'again' ? -480 : 0;

  return (
    <div
      className="vct"
      data-testid="check-test"
      // 画面に文字では出さない状態。読み上げとテストのために残す
      data-stage={engine.stage}
      data-level={engine.targetLevel}
      data-answered={engine.allAnswers.length}
      data-correct={totalScore(engine)}
    >
      <CheckTestTopBar
        answered={engine.allAnswers.length}
        remaining={remaining}
        onQuit={handleLeave}
        onBack={handlePrevQuestion}
        canGoBack={canGoBack && phase === 'ask'}
      />
      <DifficultyMeter level={engine.targetLevel} />
      {/* 読み上げ用。画面には出さない（文字を減らす） */}
      <span className="visually-hidden" aria-live="polite">{questionIndex + 1} / {questions.length}</span>

      <div id="flashcard-container">
        {/* 動かしている最中の「離すとどうなるか」（学習カードと同じ札） */}
        <SwipeIntent x={x} y={y} intentAt={intentAt} textOf={testIntentText} />
        <div className="vct-stack">
          <Deck remaining={remaining} />
          {/* 飛んでいく・デッキから出てくるのは外の枠。カードの x は指で動かすぶんだけ
              （同じ x で飛ばすと、次のカードが画面の外に置き去りになった） */}
          <motion.div
            key={currentWord.id}
            className="vct-card-wrap"
            initial={{ scale: 0.9, y: 16, opacity: 0 }}
            animate={leaving
              ? { x: leaveX, rotate: leaveX / 24, opacity: 0, scale: 1, y: 0 }
              : { x: 0, rotate: 0, scale: 1, y: 0, opacity: 1 }}
            transition={leaving ? { duration: LEAVE_MS / 1000, ease: 'easeIn' } : { duration: 0.35, ease: [0.22, 0.9, 0.24, 1] }}
          >
          <motion.div
            id="flashcard"
            drag={phase === 'ask' ? 'x' : false}
            /*
              **カードを指と同じだけ動かす**（2026-09-26）。既定の弾性だと指の約1/3しか動かず、
              指は答えの距離を越えているのに、カードの位置を見る札の円が埋まらなかった
            */
            dragElastic={1}
            // 離したら素早く戻す。ゆっくり戻すと、めくれながら横滑りして見える
            dragTransition={{ bounceStiffness: 900, bounceDamping: 60 }}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            style={{ x, y, rotate, backgroundColor: cardColor }}
            onDragEnd={(event, info) => { stopPeek(); handleDragEnd(event, info); }}
            onDrag={(event, info) => { if (Math.abs(info.offset.x) > TAP_SLOP) clearTimeout(peekTimerRef.current); }}
            onPointerDown={startPeek}
            onPointerUp={stopPeek}
            onPointerCancel={stopPeek}
            onPointerLeave={stopPeek}
            animate={{ rotateY: isFlipped || peeking ? 180 : 0 }}
            transition={{ duration: 0.35 }}
            data-peeking={peeking ? 'true' : undefined}
          >
            <div className="card-face card-front" style={{ backgroundColor: 'transparent' }}>
              <p id="card-front-text">{currentWord.word}</p>
            </div>
            <div className="card-face card-back" style={{ backgroundColor: 'transparent' }}>
              {lastAnswer !== null && (
                <p className={lastAnswer ? 'vct-stamp is-yes' : 'vct-stamp is-no'} data-testid="your-answer">
                  {lastAnswer ? <FaRegCircle aria-hidden="true" /> : <FaTimes aria-hidden="true" />}
                  <span className="visually-hidden">あなたの答え：{lastAnswer ? 'わかる' : 'わからない'}</span>
                </p>
              )}
              <h3 id="card-back-word">{currentWord.word}</h3>
              <p id="card-back-meaning">{currentWord.meaning || currentWord.japanese}</p>
              {(currentWord.example || currentWord.exampleJa) && <hr />}
              <p className="example-text">{currentWord.example}</p>
              <p className="example-text-ja">{currentWord.exampleJa}</p>
            </div>
          </motion.div>
          </motion.div>
          <Burst trigger={burst} />
        </div>
        <StageBanner stage={engine.stage} level={engine.targetLevel} />
      </div>

      {/* スワイプできない環境でも進められるようにボタンを置く（計画書13.3） */}
      <div className="vct-answers">
        <button type="button" className="vct-answer vct-answer--no" onClick={() => answerCurrent(false)} disabled={phase !== 'ask'}>
          <span className="vct-answer__circle"><FaTimes aria-hidden="true" /></span>
          わからない
        </button>
        <button type="button" className="vct-answer vct-answer--yes" onClick={() => answerCurrent(true)} disabled={phase !== 'ask'}>
          <span className="vct-answer__circle"><FaCheck aria-hidden="true" /></span>
          わかる
        </button>
      </div>

      {/* 初めて受けるときだけ、受け方をモーダルで出す（学習カードと同じ形） */}
      {!coachSeen && <CoachModal kind="test" onClose={markCoachSeen} />}
    </div>
  );
}
