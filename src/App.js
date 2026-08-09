import React, { useState, useEffect } from 'react';
import './App.css';
import { auth, db } from './firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

// Component Imports
import LoginPage from './LoginPage.js';
import StudentDashboard from './StudentDashboard.js';
import AdminDashboard from './AdminDashboard.js';

function AppContent() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isGoalSet, setIsGoalSet] = useState(false);
  const [selectedMotivationLevel, setSelectedMotivationLevel] = useState('low');
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [targetDate, setTargetDate] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [retryToken, setRetryToken] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    setAuthError(null);

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        setCurrentUser(user);
        try {
          if (user) {
            const isAdmin = user.email === 'tsukasafoods@gmail.com';
            const role = isAdmin ? 'admin' : 'student';
            setUserRole(role);

            if (!isAdmin) {
              const userDocRef = doc(db, 'users', user.uid);
              const userDoc = await getDoc(userDocRef);
              if (userDoc.exists() && userDoc.data().goal && userDoc.data().goal.isSet) {
                setIsGoalSet(true);
              } else {
                setIsGoalSet(false);
              }
            }
          } else {
            setUserRole(null);
            setIsGoalSet(false);
          }
        } catch (error) {
          // ここで throw すると setLoading(false) に到達せず無限ローディングになるため、
          // 画面側で再試行できるエラー状態へ落とす。
          console.error('ユーザー情報の読み込みに失敗しました:', error);
          setAuthError('ユーザー情報を読み込めませんでした。通信状態を確認してください。');
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error('認証状態の監視に失敗しました:', error);
        setAuthError('ログイン状態を確認できませんでした。通信状態を確認してください。');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [retryToken]);

  useEffect(() => {
    if (userRole === 'student') {
      if (isGoalSet) {
      navigate('/student-dashboard');
      } else {
        navigate('/set-goal');
      }
    }
  }, [isGoalSet, userRole, navigate]);

  const handleGoalSet = async () => {
    if (!currentUser) return;
    
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const goalData = {
        targets: selectedGoals,
        isSet: true,
        targetDate: targetDate || null,
        motivationLevel: selectedMotivationLevel,
        setAt: new Date().toISOString()
      };
      
      await updateDoc(userDocRef, { goal: goalData });
      setIsGoalSet(true);
      navigate('/student-dashboard');
    } catch (error) {
      console.error('目標設定の保存に失敗しました:', error);
      alert('目標設定の保存に失敗しました。もう一度お試しください。');
    }
  };

  const toggleGoalSelection = (goalId, goalName) => {
    setSelectedGoals(prev => {
      const isSelected = prev.some(goal => goal.goalId === goalId);
      if (isSelected) {
        return prev.filter(goal => goal.goalId !== goalId);
      } else {
        return [...prev, { goalId, displayName: goalName }];
      }
    });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="loading-container">
        <div className="app-status-card">
          <h1 className="app-status-title">つくたんを開けませんでした</h1>
          <p className="app-status-message">{authError}</p>
          <button
            type="button"
            className="primary-action"
            onClick={() => setRetryToken((token) => token + 1)}
          >
            再試行する
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <Routes>
        <Route path="/" element={
          !currentUser ? (
            <Navigate to="/login" />
          ) : userRole === 'admin' ? (
            <Navigate to="/admin-dashboard" />
          ) : isGoalSet ? (
            <Navigate to="/student-dashboard" />
          ) : (
            <Navigate to="/set-goal" />
          )
        } />
        <Route path="/login" element={!currentUser ? <LoginPage /> : <Navigate to="/" />} />
        <Route path="/admin-dashboard" element={userRole === 'admin' ? <AdminDashboard /> : <Navigate to="/" />} />
        <Route path="/student-dashboard" element={userRole === 'student' ? <StudentDashboard /> : <Navigate to="/" />} />
        <Route path="/set-goal" element={
          userRole === 'student' ? (
            <div className="goal-screen">
                <header className="goal-hero">
                  <h1>ゴールを決めよう</h1>
                  <p>目標と達成日を登録すると、学習プランが自動で作成されます。</p>
                </header>
                
                <section className="section-card">
                  <h2 className="section-title">達成日を設定</h2>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={targetDate}
                    onChange={(e) => {
                      setTargetDate(e.target.value);
                      console.log('達成日設定:', e.target.value);
                    }}
                  />
                </section>

                <section className="section-card">
                  <h2 className="section-title">やる気レベルを選択</h2>
                  <p className="section-description">学習のペースを決めましょう</p>
                  
                  <div className="motivation-options">
                    <button
                      type="button"
                      className={`motivation-option ${selectedMotivationLevel === 'low' ? 'active' : ''}`}
                      onClick={() => {
                        console.log('やる気レベル選択: low');
                        setSelectedMotivationLevel('low');
                        alert('やる気レベル: そこそこ を選択しました');
                      }}
                    >
                      <div className="motivation-header">
                        <span className="motivation-title">そこそこ</span>
                        <span className="motivation-time">約17分/日</span>
                      </div>
                      <p className="motivation-description">無理せず続けたい</p>
                      <div className="motivation-details">
                        <span>新規: 15語/日</span>
                        <span>復習: 7語/日</span>
                      </div>
                    </button>
                    
                    <button
                      type="button"
                      className={`motivation-option ${selectedMotivationLevel === 'normal' ? 'active' : ''}`}
                      onClick={() => {
                        console.log('やる気レベル選択: normal');
                        setSelectedMotivationLevel('normal');
                        alert('やる気レベル: 普通 を選択しました');
                      }}
                    >
                      <div className="motivation-header">
                        <span className="motivation-title">普通</span>
                        <span className="motivation-time">約22分/日</span>
                      </div>
                      <p className="motivation-description">バランスよく学習したい</p>
                      <div className="motivation-details">
                        <span>新規: 20語/日</span>
                        <span>復習: 13語/日</span>
                      </div>
                    </button>
                    
                    <button
                      type="button"
                      className={`motivation-option ${selectedMotivationLevel === 'high' ? 'active' : ''}`}
                      onClick={() => {
                        console.log('やる気レベル選択: high');
                        setSelectedMotivationLevel('high');
                        alert('やる気レベル: やる気満々 を選択しました');
                      }}
                    >
                      <div className="motivation-header">
                        <span className="motivation-title">やる気満々</span>
                        <span className="motivation-time">約32分/日</span>
                      </div>
                      <p className="motivation-description">確実に覚えたい</p>
                      <div className="motivation-details">
                        <span>新規: 30語/日</span>
                        <span>復習: 20語/日</span>
                      </div>
                    </button>
                  </div>
                </section>

                <section className="section-card">
                  <h2 className="section-title">英検</h2>
                  <div className="goal-options">
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'eiken_5') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('eiken_5', '英検5級 合格')}
                    >
                      <span className="goal-name">英検5級 合格</span>
                      <span className="goal-desc">目安: 600語</span>
                    </button>
                    
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'eiken_4') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('eiken_4', '英検4級 合格')}
                    >
                      <span className="goal-name">英検4級 合格</span>
                      <span className="goal-desc">目安: 1,300語</span>
                    </button>
                    
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'eiken_3') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('eiken_3', '英検3級 合格')}
                    >
                      <span className="goal-name">英検3級 合格</span>
                      <span className="goal-desc">目安: 2,100語</span>
                    </button>
                    
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'eiken_pre2') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('eiken_pre2', '英検準2級 合格')}
                    >
                      <span className="goal-name">英検準2級 合格</span>
                      <span className="goal-desc">目安: 3,600語</span>
                    </button>
                    
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'eiken_2') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('eiken_2', '英検2級 合格')}
                    >
                      <span className="goal-name">英検2級 合格</span>
                      <span className="goal-desc">目安: 5,100語</span>
                    </button>
                    
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'eiken_pre1') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('eiken_pre1', '英検準1級 合格')}
                    >
                      <span className="goal-name">英検準1級 合格</span>
                      <span className="goal-desc">目安: 8,000語</span>
                    </button>
                    
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'eiken_1') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('eiken_1', '英検1級 合格')}
                    >
                      <span className="goal-name">英検1級 合格</span>
                      <span className="goal-desc">目安: 12,000語</span>
                    </button>
                  </div>
                </section>

                <section className="section-card">
                  <h2 className="section-title">高校入試</h2>
                  <div className="goal-options">
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'hs_45') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('hs_45', '高校入試（偏差値45）合格')}
                    >
                      <span className="goal-name">高校入試（偏差値45）合格</span>
                      <span className="goal-desc">目安: 1,500語</span>
                    </button>
                    
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'hs_50') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('hs_50', '高校入試（偏差値50）合格')}
                    >
                      <span className="goal-name">高校入試（偏差値50）合格</span>
                      <span className="goal-desc">目安: 2,000語</span>
                    </button>
                    
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'hs_60') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('hs_60', '高校入試（偏差値60）合格')}
                    >
                      <span className="goal-name">高校入試（偏差値60）合格</span>
                      <span className="goal-desc">目安: 3,000語</span>
                    </button>
                    
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'hs_top') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('hs_top', '高校入試（最難関）合格')}
                    >
                      <span className="goal-name">高校入試（最難関）合格</span>
                      <span className="goal-desc">目安: 4,000語</span>
                    </button>
                  </div>
                </section>

                <section className="section-card">
                  <h2 className="section-title">大学入試</h2>
                  <div className="goal-options">
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'uni_50') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('uni_50', '大学入試（偏差値50）合格')}
                    >
                      <span className="goal-name">大学入試（偏差値50）合格</span>
                      <span className="goal-desc">目安: 4,000語</span>
                    </button>
                    
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'uni_60') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('uni_60', '大学入試（偏差値60）合格')}
                    >
                      <span className="goal-name">大学入試（偏差値60）合格</span>
                      <span className="goal-desc">目安: 5,500語</span>
                    </button>
                    
                    <button
                      type="button"
                      className={`goal-chip ${selectedGoals.some(g => g.goalId === 'uni_top') ? 'selected' : ''}`}
                      onClick={() => toggleGoalSelection('uni_top', '大学入試（最難関）合格')}
                    >
                      <span className="goal-name">大学入試（最難関）合格</span>
                      <span className="goal-desc">目安: 7,000語</span>
                    </button>
                  </div>
                </section>

                <footer className="goal-footer">
                  <button 
                    type="button" 
                    className="primary-action"
                    onClick={handleGoalSet}
                  >
                    目標を設定する
                  </button>
                </footer>
              </div>
          ) : (
            <Navigate to="/" />
          )
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;