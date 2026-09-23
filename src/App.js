import React, { useState, useEffect, Suspense, lazy } from 'react';
import './App.css';
import { auth, db } from './firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

// Component Imports
// ダッシュボードは遅延読み込みにする（計画書13.5）。
// 管理者向けは案内だけ。生徒を見る場所はつくばホームの管理者ポータルに一本化した（2026-09-23）
import LoginPage from './LoginPage.js';
import BrandLoader from './components/brand/BrandLoader';
// つくばホームから `#token=` で渡ってきたときの入場。**アカウントを2つ作らない**
import { enterFromTsukubaHome } from './logic/tsukubaEntry.js';
// 勉強時間をつくばホームへ送る。**前回閉じたぶんも、ここで締めて送る**
import { resumeAndFlush } from './logic/studySession.js';
const loadStudentDashboard = () => import('./StudentDashboard.js');
const StudentDashboard = lazy(loadStudentDashboard);
const AdminMoved = lazy(() => import('./AdminMoved.js'));
const GoalSetter = lazy(() => import('./GoalSetter.js'));

const RouteFallback = () => (
  <BrandLoader fullScreen label="画面を準備しています…" />
);

function AppContent() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isGoalSet, setIsGoalSet] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [retryToken, setRetryToken] = useState(0);
  const navigate = useNavigate();

  // 生徒はほぼ必ずここへ来る。認証の復帰を待ってから取りに行くと、
  // その待ち時間ぶん画面が出るのが遅れる（実測で1.5秒）。先に温めておく。
  useEffect(() => {
    loadStudentDashboard();
  }, []);

  /*
    つくばホームから渡ってきたか。**認証の監視より先に済ませる。**

    先に `onAuthStateChanged` が「未ログイン」で確定すると、入場券を使う前に
    ログイン画面へ飛ばしてしまう。トークンがあるあいだは待たせる。
  */
  const [entering, setEntering] = useState(
    typeof window !== 'undefined' && /[#&]token=/.test(window.location.hash || '')
  );
  useEffect(() => {
    if (!entering) return;
    let alive = true;
    void enterFromTsukubaHome().then((r) => {
      if (!alive) return;
      // **失敗しても行き止まりにしない。** 理由を出して、ログイン画面へ落とす
      if (r.tried && !r.ok) setAuthError(r.message);
      setEntering(false);
    });
    return () => { alive = false; };
  }, [entering]);

  useEffect(() => {
    setLoading(true);
    setAuthError(null);

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        // 起動の内訳を測るための目印。ここまでが認証の復帰にかかった時間。
        performance.mark('auth');
        setCurrentUser(user);
        try {
          if (user) {
            const isAdmin = user.email === 'tsukasafoods@gmail.com';
            const role = isAdmin ? 'admin' : 'student';
            setUserRole(role);

            if (!isAdmin) {
              /*
                前回タブを閉じて宙に浮いた勉強時間を締めて、貯まっているぶんと
                一緒につくばホームへ送る。**待たない**——送れなくても学習は始められる
                （次に開いたときにまた送る）。
              */
              void resumeAndFlush();
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

  if (loading || entering) {
    return <BrandLoader fullScreen label={entering ? 'ログインしています…' : 'つくつくを準備しています…'} />;
  }

  if (authError) {
    return (
      <div className="loading-container">
        <div className="app-status-card">
          <h1 className="app-status-title">つくつくを開けませんでした</h1>
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
        <Route path="/admin-dashboard" element={userRole === 'admin' ? <AdminMoved /> : <Navigate to="/" />} />
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
