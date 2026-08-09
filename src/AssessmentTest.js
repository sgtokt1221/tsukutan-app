import React, { useCallback, useEffect, useRef, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import SessionHeader from './components/learning/SessionHeader';
import QuestionRenderer from './components/assessment/QuestionRenderer';
import RankCard from './components/assessment/RankCard';
import { LoadingState, ErrorState } from './components/ui/StateViews';
import { loadAssessmentItems } from './logic/wordMaster';
import {
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  buildResult,
  createSession,
  isComplete,
  recordAnswer,
  selectNextItem,
} from './logic/assessmentEngine';
import { domainScores } from './logic/assessmentScoring';
import { RANKS_VERSION, clampToAwardable, scoreFromLegacyLevel } from './logic/rankLogic';
import { buildEquivalency } from './logic/examEquivalency';
import logger from './logic/logger';
import './components/assessment/AssessmentTest.css';

const DOMAIN_LABELS = { vocabulary: '語彙', context: '文脈' };

/**
 * 新しい実力テスト（客観問題）。
 * ASSESSMENT_RANK_SYSTEM_PLAN.md 4章 / 10章。
 *
 * 今は試験運用。結果は assessmentSessions に保存するが、生徒のランクは
 * 更新しない（計画書フェーズ4の校正が済むまで）。問題の良し悪しが
 * 未検証のままランクを動かさないため。
 */
export default function AssessmentTest({ previousLevel, onBack }) {
  const [bank, setBank] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [state, setState] = useState(() => createSession({ startScore: scoreFromLegacyLevel(previousLevel) }));
  const [item, setItem] = useState(null);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const questionStartedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    loadAssessmentItems()
      .then((payload) => {
        if (cancelled) return;
        setBank(payload.items);
      })
      .catch((error) => {
        logger.error('問題バンクを読み込めませんでした', error);
        if (!cancelled) setLoadError(error);
      });
    return () => { cancelled = true; };
  }, []);

  // 最初の1問
  useEffect(() => {
    if (!bank || item || result) return;
    setItem(selectNextItem(state, bank));
    questionStartedAt.current = Date.now();
  }, [bank, item, result, state]);

  const finish = useCallback(async (finalState) => {
    const summary = buildResult(finalState);
    setResult(summary);

    const user = auth.currentUser;
    if (!user) return;

    setSaveState('saving');
    try {
      await addDoc(collection(db, 'users', user.uid, 'assessmentSessions'), {
        engineVersion: 1,
        itemBankVersion: 1,
        ranksVersion: RANKS_VERSION,
        // 試験運用中は生徒のランクへ反映しない
        appliedToRank: false,
        completedAt: serverTimestamp(),
        abilityScore: summary.score,
        standardError: summary.standardError,
        confidenceLow: summary.confidenceLow,
        confidenceHigh: summary.confidenceHigh,
        rank: clampToAwardable(summary.rankId),
        totalQuestions: summary.totalQuestions,
        correctCount: summary.correctCount,
        skippedCount: summary.skippedCount,
        domainScores: domainScores(summary.answers),
        // 問題ごとの正誤。どの問題が機能していないかを後で調べるために残す。
        answers: summary.answers.map((answer) => ({
          itemId: answer.itemId,
          targetRank: answer.targetRank,
          domain: answer.domain,
          choiceIndex: answer.choiceIndex,
          correct: answer.correct,
          skipped: answer.skipped,
          responseMs: answer.responseMs,
        })),
      });
      setSaveState('saved');
    } catch (error) {
      logger.error('テスト結果を保存できませんでした', error);
      setSaveState('failed');
    }
  }, []);

  const handleAnswer = useCallback((choiceIndex) => {
    if (locked || !item) return;
    setLocked(true);

    const responseMs = Date.now() - questionStartedAt.current;
    const next = recordAnswer(state, item, choiceIndex, responseMs);
    setState(next);

    if (isComplete(next)) {
      setItem(null);
      finish(next);
      setLocked(false);
      return;
    }

    const nextItem = selectNextItem(next, bank);
    if (!nextItem) {
      setItem(null);
      finish(next);
      setLocked(false);
      return;
    }

    setItem(nextItem);
    questionStartedAt.current = Date.now();
    setLocked(false);
  }, [locked, item, state, bank, finish]);

  if (loadError) {
    return (
      <ErrorState
        title="問題を読み込めませんでした"
        description="通信状況を確認して、もう一度お試しください。"
        onRetry={onBack}
        retryLabel="戻る"
      />
    );
  }

  if (!bank) return <LoadingState label="問題を準備しています..." />;

  if (result) {
    const equivalency = buildEquivalency({ score: result.score });
    const scores = domainScores(result.answers);
    const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];

    return (
      <div className="assessment">
        <SessionHeader title="テスト結果" current={result.totalQuestions} total={result.totalQuestions} onBack={onBack} backLabel="戻る" />
        <div className="assessment__result">
          <p className="assessment__trial-note">
            試験運用中のテストです。この結果で今のランクは変わりません。
          </p>

          <div className="section-card">
            <RankCard
              score={result.score}
              confidenceLow={result.confidenceLow}
              confidenceHigh={result.confidenceHigh}
            />
          </div>

          <div className="section-card">
            <h3 className="section-title">内訳</h3>
            <dl className="assessment__stats">
              <div>
                <dt>問題数</dt>
                <dd>{result.totalQuestions} 問</dd>
              </div>
              <div>
                <dt>正解</dt>
                <dd>{result.correctCount} 問</dd>
              </div>
              <div>
                <dt>わからない</dt>
                <dd>{result.skippedCount} 問</dd>
              </div>
              {Object.entries(scores).map(([domain, score]) => (
                <div key={domain}>
                  <dt>{DOMAIN_LABELS[domain] || domain}</dt>
                  <dd>{score}</dd>
                </div>
              ))}
            </dl>
            {weakest && (
              <p className="assessment__next">
                次に伸ばすなら「{DOMAIN_LABELS[weakest[0]] || weakest[0]}」です。
              </p>
            )}
          </div>

          {equivalency && !equivalency.locked && (
            <p className="assessment__disclaimer">{equivalency.disclaimer}</p>
          )}

          {saveState === 'failed' && (
            <p className="message-box message-box-error" role="alert">
              結果を保存できませんでした。ランクには影響しませんが、記録は残っていません。
            </p>
          )}

          <button type="button" className="primary-action" onClick={onBack}>
            ホームへ戻る
          </button>
        </div>
      </div>
    );
  }

  const answered = state.answers.length;
  // 残り時間ではなく、おおよその進み具合を出す（計画書10.2）
  const total = Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, answered + 1));

  return (
    <div className="assessment">
      <SessionHeader
        title="実力テスト"
        current={answered + 1}
        total={total}
        onBack={onBack}
        backLabel="中断"
      />
      <QuestionRenderer item={item} onAnswer={handleAnswer} disabled={locked} />
      <p className="assessment__hint">
        答えは最後にまとめて確認します。戻って変更はできません。
      </p>
    </div>
  );
}
