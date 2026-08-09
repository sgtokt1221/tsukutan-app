import React, { useState, useEffect } from 'react';
import { auth, db } from './firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';
import { updateProgressPercentage } from './logic/progressLogic';

// やる気レベル別設定
const MOTIVATION_LEVELS = {
  low: {
    name: 'そこそこ',
    description: '無理せず続けたい',
    easeFactorMultiplier: 1.2,
    intervalMultiplier: 1.5,
    masteredThreshold: 3,
    dailyReviewQuota: 2,
    adjacentWordsQuota: 5,
    newWordsQuota: 15
  },
  normal: {
    name: '普通',
    description: 'バランスよく学習したい',
    easeFactorMultiplier: 1.0,
    intervalMultiplier: 1.0,
    masteredThreshold: 5,
    dailyReviewQuota: 3,
    adjacentWordsQuota: 10,
    newWordsQuota: 20
  },
  high: {
    name: 'やる気満々',
    description: '確実に覚えたい',
    easeFactorMultiplier: 0.8,
    intervalMultiplier: 0.7,
    masteredThreshold: 7,
    dailyReviewQuota: 5,
    adjacentWordsQuota: 15,
    newWordsQuota: 30
  }
};

export default function GoalSetter({ onGoalSet, onGoalReset }) {
  const [goals, setGoals] = useState({});
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [targetDate, setTargetDate] = useState('');
  const [motivationLevel, setMotivationLevel] = useState('normal');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // テスト用のデータ
        const testGoals = {
          '英検': [
            { goalId: 'eiken_5', displayName: '英検5級 合格', requiredVocabulary: 600 },
            { goalId: 'eiken_4', displayName: '英検4級 合格', requiredVocabulary: 1300 },
            { goalId: 'eiken_3', displayName: '英検3級 合格', requiredVocabulary: 2100 },
            { goalId: 'eiken_pre2', displayName: '英検準2級 合格', requiredVocabulary: 3600 },
            { goalId: 'eiken_2', displayName: '英検2級 合格', requiredVocabulary: 5100 },
            { goalId: 'eiken_pre1', displayName: '英検準1級 合格', requiredVocabulary: 8000 },
            { goalId: 'eiken_1', displayName: '英検1級 合格', requiredVocabulary: 12000 }
          ],
          '高校入試': [
            { goalId: 'hs_45', displayName: '高校入試（偏差値45）合格', requiredVocabulary: 1500 },
            { goalId: 'hs_50', displayName: '高校入試（偏差値50）合格', requiredVocabulary: 2000 },
            { goalId: 'hs_60', displayName: '高校入試（偏差値60）合格', requiredVocabulary: 3000 },
            { goalId: 'hs_top', displayName: '高校入試（最難関）合格', requiredVocabulary: 4000 }
          ],
          '大学入試': [
            { goalId: 'uni_50', displayName: '大学入試（偏差値50）合格', requiredVocabulary: 4000 },
            { goalId: 'uni_60', displayName: '大学入試（偏差値60）合格', requiredVocabulary: 5500 },
            { goalId: 'uni_top', displayName: '大学入試（最難関）合格', requiredVocabulary: 7000 }
          ]
        };
        
        setGoals(testGoals);
      } catch (err) {
        console.error('データの読み込みに失敗しました:', err);
        setError(`データの読み込みに失敗しました: ${err.message}`);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const toggleGoalSelection = (goal) => {
    setSelectedGoals(prev =>
      prev.some(g => g.goalId === goal.goalId)
        ? prev.filter(g => g.goalId !== goal.goalId)
        : [...prev, { goalId: goal.goalId, displayName: goal.displayName }]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedGoals.length === 0 || !targetDate) {
      alert('目標と達成日を両方選択してください。');
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userDocRef, {
        'goal.targets': selectedGoals,
        'goal.targetDate': targetDate,
        'goal.motivationLevel': motivationLevel,
        'goal.isSet': true,
      }, { merge: true });

      await updateProgressPercentage(user.uid);
      alert('目標が設定されました！');
      if (onGoalSet) onGoalSet();
    } catch (err) {
      console.error('目標設定に失敗しました:', err);
      alert('目標の設定に失敗しました。');
    }
  };

  const handleReset = async () => {
    if (!window.confirm('現在の目標をリセットしてもよろしいですか？')) return;
    const user = auth.currentUser;
    if (!user) {
      alert('ログインしていません。');
      return;
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        goal: {
          targets: [],
          targetDate: null,
          motivationLevel: 'normal',
          isSet: false,
        }
      });
      
      setSelectedGoals([]);
      setTargetDate('');
      setMotivationLevel('normal');
      
      if (onGoalReset) {
        onGoalReset();
      }
      
      alert('目標がリセットされました。新しい目標を設定してください。');
    } catch (err) {
      console.error('目標のリセットに失敗しました:', err);
      alert(`目標のリセットに失敗しました: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="loading-placeholder">読み込み中...</div>;
  }

  if (error) {
    return <div className="error-banner">{error}</div>;
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <form className="goal-screen" onSubmit={handleSubmit}>
      <header className="goal-hero">
        <h1>ゴールを決めよう</h1>
        <p>目標と達成日を登録すると、学習プランが自動で作成されます。</p>
        <button type="button" className="ghost-button" onClick={handleReset}>
          目標をリセットする
        </button>
      </header>
      
      <section className="section-card">
        <h2 className="section-title">達成日を設定</h2>
        <input
          type="date"
          min={today}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </section>

      <section className="section-card">
        <h2 className="section-title">やる気レベルを選択</h2>
        <p className="section-description">学習のペースを決めましょう</p>
        
        <div className="motivation-options">
          {Object.entries(MOTIVATION_LEVELS).map(([key, config]) => {
            const totalWords = config.newWordsQuota + (config.dailyReviewQuota + config.adjacentWordsQuota);
            const estimatedMinutes = Math.round((config.newWordsQuota * 60 + (config.dailyReviewQuota + config.adjacentWordsQuota) * 15) / 60);
            
            return (
              <button
                key={key}
                type="button"
                className={`motivation-option ${motivationLevel === key ? 'active' : ''}`}
                onClick={() => {
                  console.log('やる気レベル選択:', key);
                  setMotivationLevel(key);
                }}
              >
                <div className="motivation-header">
                  <span className="motivation-title">{config.name}</span>
                  <span className="motivation-time">約{estimatedMinutes}分/日</span>
                </div>
                <p className="motivation-description">{config.description}</p>
                <div className="motivation-details">
                  <span>新規: {config.newWordsQuota}語/日</span>
                  <span>復習: {config.dailyReviewQuota + config.adjacentWordsQuota}語/日</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {Object.entries(goals).map(([category, goalList]) => (
        <section className="section-card" key={category}>
          <div className="tile-header">
            <h2 className="section-title">{category}</h2>
          </div>
          <div className="goal-options">
            {goalList.map(goal => {
              const isActive = selectedGoals.some(g => g.goalId === goal.goalId);
              return (
                <button
                  type="button"
                  key={goal.goalId}
                  className={`goal-chip ${isActive ? 'selected' : ''}`}
                  onClick={() => toggleGoalSelection(goal)}
                >
                  <span className="goal-name">{goal.displayName}</span>
                  <span className="goal-desc">目安: {(goal.requiredVocabulary || 0).toLocaleString()}語</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <footer className="goal-footer">
        <button type="submit" className="primary-action">目標を設定する</button>
      </footer>
    </form>
  );
}