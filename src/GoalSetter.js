import React, { useMemo, useState } from 'react';
import { auth, db } from './firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';
import { updateProgressPercentage } from './logic/progressLogic';
import { getGoalsByCategory, getMotivationConfig, MOTIVATION_LEVELS, DEFAULT_MOTIVATION_LEVEL } from './config';
import { getTodayKey } from './logic/dateKeys';

/**
 * 目標設定画面。目標定義とやる気レベルは src/config を正本とする。
 * ここに一覧を手書きしない。
 */
export default function GoalSetter({ onGoalSet, onGoalReset }) {
  const [selectedGoalIds, setSelectedGoalIds] = useState([]);
  const [targetDate, setTargetDate] = useState('');
  const [motivationLevel, setMotivationLevel] = useState(DEFAULT_MOTIVATION_LEVEL);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const categories = useMemo(() => getGoalsByCategory(), []);
  const today = getTodayKey();

  // 保存できる条件: 目標が1件以上、達成日が入力済み、達成日が今日以降
  const isDateValid = Boolean(targetDate) && targetDate >= today;
  const canSubmit = selectedGoalIds.length > 0 && isDateValid && !isSaving;

  const toggleGoalSelection = (goalId) => {
    setSelectedGoalIds((prev) =>
      prev.includes(goalId) ? prev.filter((id) => id !== goalId) : [...prev, goalId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    const user = auth.currentUser;
    if (!user) {
      setError('ログイン状態を確認できませんでした。もう一度ログインしてください。');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    // displayName も保存しておく。共通定義から消えた目標でも管理画面が表示できるように。
    const targets = categories
      .flatMap((entry) => entry.goals)
      .filter((goal) => selectedGoalIds.includes(goal.id))
      .map((goal) => ({ goalId: goal.id, displayName: goal.displayName }));

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        goal: {
          targets,
          targetDate,
          motivationLevel,
          isSet: true,
          setAt: new Date().toISOString(),
        },
      });

      // 目標語彙数と進捗率を保存後に更新する
      await updateProgressPercentage(user.uid);

      setNotice('目標を設定しました。');
      if (onGoalSet) onGoalSet();
    } catch (err) {
      console.error('目標設定に失敗しました:', err);
      setError('目標の保存に失敗しました。通信状態を確認してもう一度お試しください。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (isResetting) return;
    if (!window.confirm('現在の目標をリセットしてもよろしいですか？')) return;

    const user = auth.currentUser;
    if (!user) {
      setError('ログイン状態を確認できませんでした。もう一度ログインしてください。');
      return;
    }

    setIsResetting(true);
    setError(null);
    setNotice(null);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        goal: {
          targets: [],
          targetDate: null,
          motivationLevel: DEFAULT_MOTIVATION_LEVEL,
          isSet: false,
          setAt: null,
        },
      });

      setSelectedGoalIds([]);
      setTargetDate('');
      setMotivationLevel(DEFAULT_MOTIVATION_LEVEL);
      setNotice('目標をリセットしました。新しい目標を設定してください。');
      if (onGoalReset) onGoalReset();
    } catch (err) {
      console.error('目標のリセットに失敗しました:', err);
      setError('目標のリセットに失敗しました。もう一度お試しください。');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <form className="goal-screen" onSubmit={handleSubmit}>
      <header className="goal-hero">
        <h1>ゴールを決めよう</h1>
        <p>目標と達成日を登録すると、学習プランが自動で作成されます。</p>
        <button type="button" className="ghost-button" onClick={handleReset} disabled={isResetting}>
          {isResetting ? 'リセット中...' : '目標をリセットする'}
        </button>
      </header>

      {error && <p className="message-box message-box-error" role="alert">{error}</p>}
      {notice && <p className="message-box message-box-success" role="status">{notice}</p>}

      <section className="section-card">
        <h2 className="section-title">達成日を設定</h2>
        <input
          type="date"
          min={today}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          aria-label="達成日"
        />
        {targetDate && !isDateValid && (
          <p className="field-error">達成日は今日以降を選んでください。</p>
        )}
      </section>

      <section className="section-card">
        <h2 className="section-title">やる気レベルを選択</h2>
        <p className="section-description">学習のペースを決めましょう</p>

        <div className="motivation-options">
          {Object.keys(MOTIVATION_LEVELS).map((key) => {
            const config = getMotivationConfig(key);
            const reviewCount = config.dailyReviewQuota + config.adjacentWordsQuota;
            const isActive = motivationLevel === key;

            return (
              <button
                key={key}
                type="button"
                aria-pressed={isActive}
                className={`motivation-option ${isActive ? 'active' : ''}`}
                onClick={() => setMotivationLevel(key)}
              >
                <div className="motivation-header">
                  <span className="motivation-title">{config.name}</span>
                  <span className="motivation-time">約{config.estimatedMinutesPerDay}分/日</span>
                </div>
                <p className="motivation-description">{config.description}</p>
                <div className="motivation-details">
                  <span>新規: {config.newWordsQuota}語/日</span>
                  <span>復習: {reviewCount}語/日</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {categories.map(({ category, goals }) => (
        <section className="section-card" key={category}>
          <div className="tile-header">
            <h2 className="section-title">{category}</h2>
          </div>
          <div className="goal-options">
            {goals.map((goal) => {
              const isActive = selectedGoalIds.includes(goal.id);
              return (
                <button
                  type="button"
                  key={goal.id}
                  aria-pressed={isActive}
                  className={`goal-chip ${isActive ? 'selected' : ''}`}
                  onClick={() => toggleGoalSelection(goal.id)}
                >
                  <span className="goal-name">{goal.displayName}</span>
                  <span className="goal-desc">目安: {goal.requiredVocabulary.toLocaleString()}語</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <footer className="goal-footer">
        {selectedGoalIds.length === 0 && (
          <p className="field-error">目標を1つ以上選んでください。</p>
        )}
        <button type="submit" className="primary-action" disabled={!canSubmit}>
          {isSaving ? '保存中...' : '目標を設定する'}
        </button>
      </footer>
    </form>
  );
}
