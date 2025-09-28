import React, { useState, useEffect } from 'react';
import { auth, db } from './firebaseConfig';
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { updateProgressPercentage } from './logic/progressLogic';

export default function GoalSetter({ onGoalSet, onGoalReset }) {
  const [goals, setGoals] = useState({});
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [targetDate, setTargetDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const goalsCollection = collection(db, 'goalsMaster');
        const goalsSnapshot = await getDocs(goalsCollection);

        const convertedGoals = {};
        goalsSnapshot.forEach(goalDoc => {
          const goalData = goalDoc.data();
          convertedGoals[goalDoc.id] = goalData;
        });

        const groupedGoals = Object.entries(convertedGoals).reduce((acc, [goalId, goalData]) => {
          let category = 'その他';
          if (goalId.startsWith('eiken')) category = '英検';
          else if (goalId.startsWith('hs')) category = '高校入試';
          else if (goalId.startsWith('uni')) category = '大学入試';

          if (!acc[category]) acc[category] = [];
          acc[category].push({ goalId, ...goalData });
          return acc;
        }, {});

        Object.values(groupedGoals).forEach(goalList => {
          goalList.sort((a, b) => (a.requiredVocabulary || 0) - (b.requiredVocabulary || 0));
        });

        setGoals(groupedGoals);

        const user = auth.currentUser;
        if (user) {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists() && userDoc.data().goal) {
            const userGoal = userDoc.data().goal;
            if (userGoal.targets) {
              setSelectedGoals(userGoal.targets);
            }
            if (userGoal.targetDate) {
              setTargetDate(userGoal.targetDate);
            }
          }
        }
      } catch (err) {
        console.error('データの読み込みに失敗しました:', err);
        setError(err.message);
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
    if (!user) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        goal: {
          targets: [],
          targetDate: null,
          isSet: false,
        }
      }, { merge: true });
      setSelectedGoals([]);
      setTargetDate('');
      if (onGoalReset) onGoalReset();
    } catch (err) {
      console.error('目標のリセットに失敗しました:', err);
      alert('目標のリセットに失敗しました。');
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