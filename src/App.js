import React, { useState, useEffect } from 'react';
import './App.css';
import { auth, db } from './firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

// Component Imports
import LoginPage from './LoginPage.js';
import StudentDashboard from './StudentDashboard.js';
import AdminDashboard from './AdminDashboard.js';
import GoalSetter from './GoalSetter.js';

function AppContent() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isGoalSet, setIsGoalSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
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
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isGoalSet && userRole === 'student') {
      navigate('/student-dashboard');
    }
  }, [isGoalSet, userRole, navigate]);

  const handleGoalSet = () => {
    setIsGoalSet(true);
  };

  const handleGoalReset = () => {
    setIsGoalSet(false);
  };

  if (loading) {
    return <p>読み込み中...</p>;
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
        <Route path="/set-goal" element={userRole === 'student' ? <GoalSetter onGoalSet={handleGoalSet} onGoalReset={handleGoalReset} /> : <Navigate to="/" />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <Router basename="/tsukutan-app">
      <AppContent />
    </Router>
  );
}

export default App;