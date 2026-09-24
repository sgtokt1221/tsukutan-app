import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { db, auth } from './firebaseConfig';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateUserWordProgress } from './logic/reviewLogic';
import { logStudySession } from './logic/studyLogger';
import { initialize, speakSequence, stopSpeaking } from './logic/speechUtils';
import { updateProgressPercentage } from './logic/progressLogic';
import { FaUndo, FaArrowLeft } from 'react-icons/fa';
import {
  MAX_STAGES,
  createInitialState,
  selectQuestions,
  recordAnswer,
  undoLastAnswer,
  isStageComplete,
  completeStage,
  questionsForStage,
  totalScore,
  computeResultLevel,
  estimateVocabulary,
} from './logic/placementTestEngine';

/** 読み終えてから次のカードへ進むまでの間（ミリ秒） */
export const REVEAL_PAUSE_MS = 600;
/** 読み上げが返らない端末でも止まらないための上限（ミリ秒） */
export const REVEAL_MAX_MS = 8000;

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
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
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
  const cardColor = useTransform(x, [-100, 0, 100], ['#fecaca', '#ffffff', '#d9f99d']);

  useEffect(() => {
    initialize().catch((error) => console.error('Speech initialization failed:', error));
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  }, []);

  // 画面を離れるときは読み上げと待ちを止める
  useEffect(() => () => { clearTimers(); stopSpeaking(); }, [clearTimers]);

  // ステージが変わったときだけ問題を組み直す。
  // 依存を stage / targetLevel に絞ってあるので、回答のたびに作り直されることはない。
  useEffect(() => {
    if (words.length === 0 || engine.completed) return;
    const picked = selectQuestions(
      words,
      engine.targetLevel,
      questionsForStage(engine.stage),
      engine.askedIds
    );
    setQuestions(picked);
    setQuestionIndex(0);
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

    // 推定語彙数は永続IDのユニーク件数から出す（計画書11.6）
    const estimatedVocabulary = estimateVocabulary(words, finalLevel);
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
        onTestComplete(finalLevel, answers, estimatedVocabulary);
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

  /** 読み上げが終わった（または上限が来た）。少し置いて次へ進む。**1回だけ** */
  const finishReveal = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || pending.finishing) return;
    pending.finishing = true;
    clearTimers();
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
    // 答える前には見られないので、見たかどうかの印は常に false
    const next = recordAnswer(engine, {
      wordId: currentWord.id,
      isCorrect,
      responseTime,
      revealed: false,
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

    // めくって、英語 → 意味を読み上げる（答え合わせ）
    setLastAnswer(isCorrect);
    setPhase('reveal');
    setIsFlipped(true);
    x.set(0);
    y.set(0);
    const meaning = currentWord.meaning || currentWord.japanese;
    speakSequence(
      [{ text: currentWord.word, lang: 'en-US' }, { text: meaning, lang: 'ja-JP' }],
      { onDone: finishReveal },
    );
    // 読み上げが返らない端末（音声が出ない・止められた）でも止まらない
    timersRef.current.push(setTimeout(finishReveal, REVEAL_MAX_MS));
  }, [questions, questionIndex, engine, questionStartTime, isSaving, finishReveal, x, y]);

  const handleDragEnd = (event, info) => {
    if (Math.abs(info.offset.x) < 50) {
      x.set(0);
      return;
    }
    answerCurrent(info.offset.x > 0);
  };

  // 前の問題へ戻る。直前の回答は取り消すが、同じ単語は再出題しない。
  const handlePrevQuestion = () => {
    if (questionIndex === 0 || phase !== 'ask') return;
    setEngine((prev) => undoLastAnswer(prev));
    setQuestionIndex((prev) => Math.max(0, prev - 1));
    setIsFlipped(false);
    setQuestionStartTime(Date.now());
    x.set(0);
    y.set(0);
  };

  const handleLeave = () => {
    clearTimers();
    stopSpeaking();
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
  const answeredCount = engine.allAnswers.length;
  const accuracy = answeredCount > 0 ? Math.round((totalScore(engine) / answeredCount) * 100) : 0;

  return (
    <>
      <div className="test-header">
        <h3>単語力チェックテスト (ステージ {engine.stage} / {MAX_STAGES})</h3>
        <p className="test-header-note">
          出題レベル: {engine.targetLevel} / 7　これまでの正答率: {accuracy}%（{answeredCount}問）
        </p>
        <p>わかる→右へスワイプ / わからない→左へスワイプ</p>
        <p>答えるとカードがめくれて、答えを読み上げます。</p>
      </div>

      <div id="flashcard-container">
        <motion.div
          key={currentWord.id}
          id="flashcard"
          drag={phase === 'ask' ? 'x' : false}
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          style={{ x, y, rotate, backgroundColor: cardColor }}
          onDragEnd={handleDragEnd}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="card-face card-front" style={{ backgroundColor: 'transparent' }}>
            <p id="card-front-text">{currentWord.word}</p>
          </div>
          <div className="card-face card-back" style={{ backgroundColor: 'transparent' }}>
            {lastAnswer !== null && (
              <p className={lastAnswer ? 'test-your-answer is-yes' : 'test-your-answer is-no'} data-testid="your-answer">
                あなたの答え：{lastAnswer ? 'わかる' : 'わからない'}
              </p>
            )}
            <h3 id="card-back-word">{currentWord.word}</h3>
            <p id="card-back-meaning">{currentWord.meaning || currentWord.japanese}</p>
            {(currentWord.example || currentWord.exampleJa) && <hr />}
            <p className="example-text">{currentWord.example}</p>
            <p className="example-text-ja">{currentWord.exampleJa}</p>
          </div>
        </motion.div>
      </div>

      <div className="test-progress">
        <div className="test-progress-labels">
          <span>{questionIndex + 1} / {questions.length}</span>
          <span>ステージ {engine.stage} / {MAX_STAGES}</span>
        </div>
        <div className="test-progress-bar">
          <div
            className="test-progress-fill"
            style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* スワイプできない環境でも進められるようにボタンを置く（計画書13.3） */}
      <div className="test-answer-buttons">
        <button type="button" className="test-answer-btn incorrect" onClick={() => answerCurrent(false)} disabled={phase !== 'ask'}>
          わからない
        </button>
        <button type="button" className="test-answer-btn correct" onClick={() => answerCurrent(true)} disabled={phase !== 'ask'}>
          わかる
        </button>
      </div>

      <div className="test-nav-buttons">
        <button
          type="button"
          className="test-nav-btn"
          onClick={handlePrevQuestion}
          disabled={questionIndex === 0 || phase !== 'ask'}
        >
          <FaUndo /> 前の問題
        </button>
        <button type="button" className="test-nav-btn leave" onClick={handleLeave}>
          <FaArrowLeft /> 前の画面に戻る
        </button>
      </div>
    </>
  );
}
