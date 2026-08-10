import React, { useState, useEffect, Suspense, lazy } from 'react';
import './App.css';
import { auth, db } from './firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

// Component Imports
// ダッシュボードは遅延読み込みにする。Chart.js は AdminDashboard からしか
// 使わないので、管理者がその画面を開くまで取りに行かない（計画書13.5）。
import LoginPage from './LoginPage.js';
const StudentDashboard = lazy(() => import('./StudentDashboard.js'));
const AdminDashboard = lazy(() => import('./AdminDashboard.js'));
const GoalSetter = lazy(() => import('./GoalSetter.js'));

const RouteFallback = () => (
  <div className="loading-container">
    <p>読み込み中...</p>
  </div>
);

function AppContent() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isGoalSet, setIsGoalSet] = useState(false);
  
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

  // 保存そのものは GoalSetter が行う。ここではルーティングの状態だけ更新する。
  const handleGoalSet = () => {
    setIsGoalSet(true);
    navigate('/student-dashboard');
  };

  const handleGoalReset = () => {
    setIsGoalSet(false);
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
      <Suspense fallback={<RouteFallback />}>
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
            <GoalSetter onGoalSet={handleGoalSet} onGoalReset={handleGoalReset} />
          ) : (
            <Navigate to="/" />
          )
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
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
