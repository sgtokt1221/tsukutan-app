import React, { useEffect, useMemo, useState } from 'react';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import {
  addMissedWordsToReview, answerOf, buildChoices, promptOf, saveQuizResult,
} from '../../logic/assignedQuiz';
import { loadSunshineCards } from '../../logic/textbookPages';
import logger from '../../logic/logger';
import './AssignedQuiz.css';

/**
 * 先生が出した小テストを解く画面。**4択を1問ずつ。**
 *
 * - 答えたら正解・不正解をその場で見せ、「次へ」で進む（見直す間を取る）
 * - 最後の問題を答えたら結果を保存する。**保存に失敗したら、そう言ってやり直せるようにする**
 *   （黙って閉じると、先生の画面ではいつまでも「まだ」のままになる）
 * - 途中でやめたら何も保存しない（ホームのカードは残る）
 */
export default function AssignedQuiz({ quiz, uid, onExit, onFinished }) {
  const direction = quiz.direction === 'ja-en' ? 'ja-en' : 'en-ja';
  const words = useMemo(() => quiz.words || [], [quiz]);
  const [extraPool, setExtraPool] = useState([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [saving, setSaving] = useState('idle'); // idle | saving | saved | error
  const [result, setResult] = useState(null);

  // ひっかけが足りないとき用に、教科書の同じ学年の語（読めなくても小テストは進める）。
  // 苦手な単語から出した小テストは学年を持たないので、教科書の全部から選ぶ
  useEffect(() => {
    loadSunshineCards()
      .then((cards) => setExtraPool(quiz.grade ? cards.filter((c) => c.grade === quiz.grade) : cards))
      .catch((error) => logger.warn('教科書の単語を読めませんでした（ひっかけは小テストの語だけで作ります）', error));
  }, [quiz.grade]);

  const word = words[index];
  // 選択肢は問題ごとに1回だけ作る（描き直すたびに並びが変わらないように）
  const choices = useMemo(
    () => (word ? buildChoices(word, words, extraPool, direction) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, words, extraPool.length > 0, direction],
  );

  const save = async (finalAnswers) => {
    setSaving('saving');
    try {
      const saved = await saveQuizResult(uid, quiz, finalAnswers);
      setResult(saved);
      setSaving('saved');
      const missed = words.filter((w) => finalAnswers.some((a) => a.id === w.id && !a.correct));
      addMissedWordsToReview(uid, missed).catch((error) => logger.warn('間違えた語を復習に入れられませんでした', error));
    } catch (error) {
      logger.warn('小テストの結果を保存できませんでした', error);
      setSaving('error');
    }
  };

  const choose = (choice) => {
    if (picked !== null) return;
    setPicked(choice);
    setAnswers((prev) => [...prev, { id: word.id, correct: choice === answerOf(word, direction) }]);
  };

  const next = () => {
    if (index + 1 < words.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    save(answers);
  };

  if (words.length === 0) {
    return (
      <div className="assigned-quiz">
        <p className="assigned-quiz__note">この小テストには問題がありません。先生に伝えてください。</p>
        <button type="button" className="assigned-quiz__primary" onClick={onExit}>ホームに戻る</button>
      </div>
    );
  }

  if (saving !== 'idle') {
    const missed = words.filter((w) => answers.some((a) => a.id === w.id && !a.correct));
    return (
      <div className="assigned-quiz">
        <p className="assigned-quiz__eyebrow">{quiz.title}</p>
        {saving === 'saving' && <p className="assigned-quiz__note">結果を送っています…</p>}
        {saving === 'error' && (
          <div className="assigned-quiz__error" role="alert">
            <p>結果を送れませんでした。電波の良いところで、もう一度押してください。</p>
            <button type="button" className="assigned-quiz__primary" onClick={() => save(answers)}>もう一度送る</button>
          </div>
        )}
        {saving === 'saved' && result && (
          <>
            <p className="assigned-quiz__score">
              <strong>{result.score}</strong>
              <span> / {result.total} 問正解</span>
            </p>
            {missed.length > 0 ? (
              <>
                <p className="assigned-quiz__note">まちがえた単語（復習に入れました）</p>
                <ul className="assigned-quiz__missed">
                  {missed.map((w) => (
                    <li key={w.id}><span className="assigned-quiz__missed-word">{w.word}</span>{w.meaning}</li>
                  ))}
                </ul>
              </>
            ) : <p className="assigned-quiz__note">全問正解です。</p>}
            <button type="button" className="assigned-quiz__primary" onClick={onFinished}>ホームに戻る</button>
          </>
        )}
      </div>
    );
  }

  const correctText = answerOf(word, direction);
  return (
    <div className="assigned-quiz">
      <div className="assigned-quiz__head">
        <p className="assigned-quiz__eyebrow">{quiz.title}</p>
        <p className="assigned-quiz__progress">{index + 1} / {words.length}</p>
      </div>
      <p className={`assigned-quiz__prompt${direction === 'ja-en' ? ' is-ja' : ''}`}>{promptOf(word, direction)}</p>
      <div className="assigned-quiz__choices">
        {choices.map((choice) => {
          const state = picked === null ? ''
            : choice === correctText ? ' is-correct'
              : choice === picked ? ' is-wrong' : ' is-dim';
          return (
            <button key={choice} type="button" className={`assigned-quiz__choice${state}`} onClick={() => choose(choice)} disabled={picked !== null}>
              {picked !== null && choice === correctText && <FaCheckCircle aria-hidden="true" />}
              {picked !== null && choice === picked && choice !== correctText && <FaTimesCircle aria-hidden="true" />}
              <span>{choice}</span>
            </button>
          );
        })}
      </div>
      <div className="assigned-quiz__foot">
        <button type="button" className="assigned-quiz__quit" onClick={onExit}>やめる</button>
        {picked !== null && (
          <button type="button" className="assigned-quiz__primary" onClick={next}>
            {index + 1 < words.length ? '次へ' : '結果を見る'}
          </button>
        )}
      </div>
    </div>
  );
}
