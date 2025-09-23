import React, { useState } from 'react';
import { auth } from './firebaseConfig.js';
import { signInWithEmailAndPassword } from "firebase/auth";

function LoginPage() {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!studentId || !password) {
      alert('IDとパスワードを入力してください。');
      return;
    }
    // If studentId contains '@', treat it as a full email. Otherwise, append domain.
    const email = studentId.includes('@') ? studentId : `${studentId}@tsukasafoods.com`;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert(`ログインに失敗しました。IDまたはパスワードが間違っています。`);
      console.error("Login error:", error);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="logo-title">つくたん</h1>
        <div className="input-group">
          <label>ID</label>
          <input
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="IDまたはメールアドレス"
          />
        </div>
        <div className="input-group">
          <label>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="先生から指定されたパスワード"
          />
        </div>
        <button className="login-btn" onClick={handleLogin}>
          ログイン
        </button>
      </div>
    </div>
  );
}

export default LoginPage;