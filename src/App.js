import React, { useState, useEffect } from 'react';
import './App.css';
import { auth } from './firebaseConfig.js';
import { onAuthStateChanged } from 'firebase/auth';
import LoginPage from './LoginPage.js';
import StudentDashboard from './StudentDashboard.js';
import AdminDashboard from './AdminDashboard.js';

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

  const renderDashboard = () => {
    if (!currentUser) {
      return <LoginPage />;
    }
    if (currentUser.email === 'tsukasafoods@gmail.com') {
      return <AdminDashboard />;
    }
    return <StudentDashboard />;
  };

  if (loading) {
    return <p>読み込み中...</p>;
  }

  return (
    <>
      {renderDashboard()}
    </>
  );
}

export default App;