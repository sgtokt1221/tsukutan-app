import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { FaArrowLeft, FaTimes } from 'react-icons/fa';
import { db } from '../../../firebaseConfig';
import { WRITING_GRADES, loadWritingCard, loadWritingPrompts, splitUnderline, tasksOf } from '../../../logic/writingContent';
import { countWords, findContractions, lengthState } from '../../../logic/writingText';
import { scoreWritingAnswer } from '../../../logic/writingApi';
import { useSeenOnce } from '../../../logic/useSeenOnce';
import CoachModal from '../../learning/CoachModal';
import CheatCard from './CheatCard';
import WritingResult from './WritingResult';
import './Writing.css';

/**
 * 英検ライティング（2026-09-26）。えらぶ → 英検 → ライティング → 級。
 *
 * 一覧（タスク別の問題とベスト点）→ 解く（本番と同じ形式・右からカンペ）→ 結果（点数だけ）。
 * 採点は Jev（サーバの scoreWriting）。結果の保存もサーバがする。
 */

const gradeLabel = (grade) => WRITING_GRADES.find((g) => g.id === grade)?.label || grade;

const elapsedText = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** 問題の中身（Eメールは下線、要約は本文、意見は QUESTION と POINTS） */
function PromptView({ task, item }) {
  if (task === 'email') {
    return (
      <div className="wr-prompt__mail">
        {String(item.body || '').split('\n\n').map((para, pi) => (
          // eslint-disable-next-line react/no-array-index-key
          <p key={pi}>
            {splitUnderline(para).map((part, i) => (part.underline
              // eslint-disable-next-line react/no-array-index-key
              ? <u key={i}>{part.text}</u>
              // eslint-disable-next-line react/no-array-index-key
              : <React.Fragment key={i}>{part.text.split('\n').map((line, li, all) => (
                // eslint-disable-next-line react/no-array-index-key
                <React.Fragment key={li}>{line}{li < all.length - 1 && <br />}</React.Fragment>
              ))}</React.Fragment>))}
          </p>
        ))}
      </div>
    );
  }
  if (task === 'summary') {
    return (
      <div className="wr-prompt__passage">
        {item.title && <p className="wr-prompt__title">{item.title}</p>}
        {(item.passage || []).map((para, i) => <p key={i}>{para}</p>)}
      </div>
    );
  }
  return (
    <div className="wr-prompt__question">
      <p className="wr-prompt__q">{item.question}</p>
      {item.points?.length > 0 && (
        <div className="wr-prompt__points">
          <span className="wr-prompt__points-label">POINTS</span>
          {item.points.map((p) => <span key={p} className="wr-point">{p}</span>)}
        </div>
      )}
    </div>
  );
}

/** 解く画面。全面・1画面（単語力チェックテストと同じ枠） */
function WritingExam({ grade, task, spec, item, card, onQuit, onScored }) {
  const [answer, setAnswer] = useState('');
  const [cardOpen, setCardOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const words = countWords(answer);
  const state = lengthState(words, spec.minWords, spec.maxWords);
  const contractions = findContractions(answer);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await scoreWritingAnswer({ grade, task, prompt: item, answer });
      onScored(result, answer);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="wr-exam" data-testid="writing-exam">
      <div className="wr-exam__top">
        <button type="button" className="vct-icon-btn" onClick={onQuit} aria-label="やめる">
          <FaTimes aria-hidden="true" />
        </button>
        <span className="wr-exam__task">{gradeLabel(grade)} {spec.label}</span>
        <span className="wr-exam__time" aria-label="経過時間">{elapsedText(seconds)}</span>
      </div>

      <section className={promptOpen ? 'wr-prompt' : 'wr-prompt is-folded'}>
        <button type="button" className="wr-prompt__toggle" onClick={() => setPromptOpen((v) => !v)} aria-expanded={promptOpen}>
          {promptOpen ? '問題をたたむ' : '問題を見る'}
        </button>
        {promptOpen && (
          <>
            <ul className="wr-prompt__instructions">
              {(spec.instructions || []).map((line) => <li key={line}>{line}</li>)}
            </ul>
            <PromptView task={task} item={item} />
          </>
        )}
      </section>

      <div className="wr-editor">
        <textarea
          className="wr-editor__area"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="ここに英語で書きましょう"
          aria-label="解答"
          spellCheck={false}
          autoCapitalize="sentences"
        />
        <div className="wr-editor__bar">
          <span className={`wr-count is-${state}`} data-testid="word-count">
            {words}語 <span className="wr-count__range">（{spec.minWords}〜{spec.maxWords}語）</span>
          </span>
          {contractions.length > 0 && (
            <span className="wr-warn">短縮形 {contractions.length}つ：{contractions.slice(0, 3).join(', ')}</span>
          )}
        </div>
      </div>

      {error && <p className="wr-error" role="alert">{error}</p>}
      <button
        type="button"
        className="wr-submit"
        onClick={submit}
        disabled={submitting || words === 0}
      >
        {submitting ? '採点しています…' : '提出して採点'}
      </button>

      <CheatCard card={card} open={cardOpen} onOpen={() => setCardOpen(true)} onClose={() => setCardOpen(false)} />
    </div>
  );
}

export default function EikenWriting({ grade, onExit }) {
  const [prompts, setPrompts] = useState(null);
  const [card, setCard] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [taskTab, setTaskTab] = useState(null);
  const [current, setCurrent] = useState(null); // { task, item }
  const [result, setResult] = useState(null); // { result, answer }
  const [coachSeen, markCoachSeen] = useSeenOnce('writing');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    Promise.all([loadWritingPrompts(grade), loadWritingCard(grade)])
      .then(([p, c]) => {
        if (!alive.current) return;
        setPrompts(p);
        setCard(c);
        setTaskTab(tasksOf(p)[0] || null);
      })
      .catch((e) => alive.current && setLoadError(e.message));
    const uid = getAuth().currentUser?.uid;
    if (uid) {
      getDocs(collection(db, 'users', uid, 'writingAttempts'))
        .then((snap) => alive.current && setAttempts(snap.docs.map((d) => d.data()).filter((a) => a.grade === grade)))
        .catch(() => {});
    }
    return () => { alive.current = false; };
  }, [grade]);

  /** 問題ごとのベスト点 */
  const best = useMemo(() => {
    const map = new Map();
    for (const a of attempts) {
      const key = `${a.task}:${a.promptId}`;
      if (!map.has(key) || map.get(key).total < a.total) map.set(key, a);
    }
    return map;
  }, [attempts]);

  if (loadError) {
    return (
      <div className="wr-list">
        <p className="wr-error">{loadError}</p>
        <button type="button" className="wr-btn" onClick={onExit}>戻る</button>
      </div>
    );
  }
  if (!prompts) return <p className="interview-lead">読み込んでいます…</p>;

  if (current && result) {
    const spec = prompts.tasks[current.task];
    return (
      <div className="wr-exam wr-exam--result">
        <div className="wr-exam__top">
          <button type="button" className="vct-icon-btn" onClick={() => { setResult(null); setCurrent(null); }} aria-label="問題の一覧へ">
            <FaArrowLeft aria-hidden="true" />
          </button>
          <span className="wr-exam__task">{gradeLabel(grade)} {spec.label} の結果</span>
          <span />
        </div>
        <WritingResult
          result={result.result}
          answer={result.answer}
          onRetry={() => setResult(null)}
          onBack={() => { setResult(null); setCurrent(null); }}
        />
      </div>
    );
  }

  if (current) {
    return (
      <>
        <WritingExam
          grade={grade}
          task={current.task}
          spec={prompts.tasks[current.task]}
          item={current.item}
          card={card}
          onQuit={() => setCurrent(null)}
          onScored={(r, answer) => {
            setResult({ result: r, answer });
            setAttempts((prev) => [...prev, { ...r, grade, task: current.task, promptId: current.item.id }]);
          }}
        />
        {!coachSeen && <CoachModal kind="writing" onClose={markCoachSeen} />}
      </>
    );
  }

  const tasks = tasksOf(prompts);
  const spec = prompts.tasks[taskTab];
  return (
    <div className="wr-list">
      <div className="wr-list__head">
        <button type="button" className="vct-icon-btn" onClick={onExit} aria-label="戻る">
          <FaArrowLeft aria-hidden="true" />
        </button>
        <h2 className="wr-list__title">{gradeLabel(grade)} ライティング</h2>
      </div>
      <div className="wr-tabs" role="tablist" aria-label="問題の種類">
        {tasks.map((task) => (
          <button
            key={task}
            type="button"
            role="tab"
            aria-selected={task === taskTab}
            className={task === taskTab ? 'wr-tab is-on' : 'wr-tab'}
            onClick={() => setTaskTab(task)}
          >
            {prompts.tasks[task].label}
            <span className="wr-tab__words">{prompts.tasks[task].minWords}〜{prompts.tasks[task].maxWords}語</span>
          </button>
        ))}
      </div>
      <ul className="wr-items">
        {(spec?.items || []).map((item) => {
          const b = best.get(`${taskTab}:${item.id}`);
          // Eメールは書き出しの「Hi,」を除いて中身から見せる
          const text = item.question || item.title || String(item.body || '')
            .replace(/\[\[|\]\]/g, '').replace(/^\s*Hi[^,\n]*,\s*/i, '').replace(/\s+/g, ' ').slice(0, 80);
          return (
            <li key={item.id}>
              <button type="button" className="wr-item" onClick={() => setCurrent({ task: taskTab, item })}>
                <span className="wr-item__theme">{item.theme}</span>
                <span className="wr-item__text">{text}</span>
                {b ? (
                  <span className="wr-item__best">{b.total}<small>/{b.max}</small></span>
                ) : (
                  <span className="wr-item__best is-none">未</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
