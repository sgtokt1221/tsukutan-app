import React, { useState, useEffect } from 'react';
import { db, auth } from './firebaseConfig';
// ▼▼▼ getDoc を追加 ▼▼▼
import { collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function GoalSetter() {
  const [goals, setGoals] = useState({});
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [targetDate, setTargetDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // ▼▼▼ ここから修正 ▼▼▼
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. マスターデータの目標リストを取得
        const goalsCollection = collection(db, 'goalsMaster');
        const goalsSnapshot = await getDocs(goalsCollection);
        if (goalsSnapshot.empty) {
          throw new Error("目標データが見つかりません。");
        }
        const goalsList = goalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const groupedGoals = goalsList.reduce((acc, goal) => {
          let category = 'その他';
          if (goal.id.startsWith('eiken')) category = '英検';
          else if (goal.id.startsWith('hs')) category = '高校入試';
          else if (goal.id.startsWith('uni')) category = '大学入試';
          
          if (!acc[category]) acc[category] = [];
          acc[category].push(goal);
          return acc;
        }, {});

        setGoals(groupedGoals);

        // 2. ログイン中のユーザーの現在の目標設定を読み込む
        const user = auth.currentUser;
        if (user) {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists() && userDoc.data().goal) {
            const userGoal = userDoc.data().goal;
            // 既存の設定があればStateにセットする
            if (userGoal.targets) {
              setSelectedGoals(userGoal.targets);
            }
            if (userGoal.targetDate) {
              setTargetDate(userGoal.targetDate);
            }
          }
        }
      } catch (err) {
        console.error("データの読み込みに失敗しました:", err);
        setError(err.message);
      }
      setLoading(false);
    };
    fetchData();
  }, []);
  // ▲▲▲ ここまで修正 ▲▲▲

  const handleGoalChange = (goal) => {
    setSelectedGoals(prev => 
      prev.some(g => g.goalId === goal.id)
        ? prev.filter(g => g.goalId !== goal.id)
        : [...prev, { goalId: goal.id, displayName: goal.displayName }]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedGoals.length === 0 || !targetDate) {
      alert('目標と達成日を両方選択してください。');
      return;
    }
    const user = auth.currentUser;
    if (user) {
      const userDocRef = doc(db, 'users', user.uid);
      try {
        // updateDoc を使用することで、ドキュメント全体を上書きせず goal フィールドのみを更新
        await updateDoc(userDocRef, {
          'goal.targets': selectedGoals,
          'goal.targetDate': targetDate,
          'goal.isSet': true,
        });
        alert('目標が設定されました！');
        navigate('/');
      } catch (error) {
        console.error("目標の設定に失敗しました: ", error);
        alert('目標の設定に失敗しました。');
      }
    }
  };

  if (loading) return <div className="loading-container"><p>目標を読み込んでいます...</p></div>;
  if (error) return <div className="loading-container"><p>エラー: {error}</p></div>;

  return (
    <div className="goal-setter-container">
      <form onSubmit={handleSubmit} className="goal-form card-style">
        {/* 以下、JSX部分は変更なし */}
        <h2>学習目標を設定</h2>
        <p className="form-description">達成したい目標と期限を決めましょう。</p>
        
        <div className="goals-selection">
          {Object.entries(goals).map(([category, items]) => (
            <div key={category} className="goal-category">
              <h3 className="category-title">{category}</h3>
              {items.sort((a, b) => a.requiredVocabulary - b.requiredVocabulary).map(goal => (
                <label key={goal.id} className="goal-option">
                  <input 
                    type="checkbox"
                    checked={selectedGoals.some(g => g.goalId === goal.id)}
                    onChange={() => handleGoalChange(goal)}
                  />
                  <span className="checkbox-custom"></span>
                  <div className="goal-text">
                    <span className="goal-name">{goal.displayName}</span>
                    <span className="goal-desc">{goal.description}</span>
                  </div>
                </label>
              ))}
            </div>
          ))}
        </div>
        
        <div className="date-picker-section">
          <h3 className="category-title">達成目標日</h3>
          <input 
            type="date"
            className="date-input"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            required
          />
        </div>

        <button type="submit" className="submit-goal-btn" disabled={selectedGoals.length === 0 || !targetDate}>
          学習を始める
        </button>
      </form>
    </div>
  );
};