import React, { useState, useEffect } from 'react';
import './App.css';
import { auth, db } from './firebaseConfig.js'; // dbをインポート
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore'; // Firestoreからデータを取得するためにインポート
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'; // ルーティングのためにインポート

// コンポーネントのインポート
import LoginPage from './LoginPage.js';
import StudentDashboard from './StudentDashboard.js';
import AdminDashboard from './AdminDashboard.js';
import GoalSetter from './GoalSetter.js'; // 新しく作成したコンポーネント

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin' or 'student'
  const [isGoalSet, setIsGoalSet] = useState(false); // 生徒のゴール設定状態
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // 管理者か生徒かを判定
        const isAdmin = user.email === 'tsukasafoods@gmail.com';
        const role = isAdmin ? 'admin' : 'student';
        setUserRole(role);

        // 生徒の場合、ゴールが設定されているかFirestoreを確認
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
        // ログアウト時
        setUserRole(null);
        setIsGoalSet(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 読み込み中の表示
  if (loading) {
    return <p>読み込み中...</p>;
  }

  return (
    <Router basename="/tsukutan-app">
      <div className="App">
        <Routes>
          {/* ルートURL ("/") へのアクセス */}
          <Route path="/" element={
            !currentUser ? (
              <Navigate to="/login" /> // 未ログインならログインページへ
            ) : userRole === 'admin' ? (
              <Navigate to="/admin-dashboard" /> // 管理者なら管理者ダッシュボードへ
            ) : isGoalSet ? (
              <Navigate to="/student-dashboard" /> // ゴール設定済み生徒なら生徒ダッシュボードへ
            ) : (
              <Navigate to="/set-goal" /> // ゴール未設定生徒ならゴール設定ページへ
            )
          } />

          {/* 各ページのルート設定 */}
          <Route path="/login" element={!currentUser ? <LoginPage /> : <Navigate to="/" />} />
          
          <Route path="/admin-dashboard" element={userRole === 'admin' ? <AdminDashboard /> : <Navigate to="/" />} />
          
          <Route path="/student-dashboard" element={userRole === 'student' && isGoalSet ? <StudentDashboard /> : <Navigate to="/" />} />
          
          <Route path="/set-goal" element={userRole === 'student' && !isGoalSet ? <GoalSetter /> : <Navigate to="/" />} />

        </Routes>
      </div>
    </Router>
  );
}

export default App;