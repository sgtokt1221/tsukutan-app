import React, { useState } from 'react';
import { auth } from './firebaseConfig.js';
import { signInWithEmailAndPassword } from "firebase/auth";

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert(`ログインに失敗しました: ${error.message}`);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="logo-title">つくたん</h1>
        <div className="input-group">
          <label>メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="test@example.com"
          />
        </div>
        <div className="input-group">
          <label>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6文字以上"
          />
        </div>
        <button className="login-btn" onClick={handleLogin}>
          ログイン
        </button>
        {/* Registration is now handled by admin import */}
        {/* <button className="register-btn" onClick={handleRegister}>
          新規登録
        </button> */}
      </div>
    </div>
  );
}

export default LoginPage;