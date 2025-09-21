import React, { useState, useEffect } from 'react';
import './App.css';
import { auth } from './firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import LoginPage from './LoginPage.js';
import StudentDashboard from './StudentDashboard.js';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  if (loading) {
    return <p>読み込み中...</p>;
  }

  return (
    <>
      {currentUser ? <StudentDashboard /> : <LoginPage />}
    </>
  );
}

export default App;