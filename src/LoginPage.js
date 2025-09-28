import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebaseConfig.js';

function LoginPage() {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleLogin = async () => {
    if (!studentId || !password) {
      alert('IDとパスワードを入力してください。');
      return;
    }

    const email = studentId.includes('@') ? studentId : `${studentId}@tsukasafoods.com`;

    try {
      setIsProcessing(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Login error:', error);
      alert('ログインに失敗しました。IDまたはパスワードを確認してください。');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-hero">
        <div className="hero-pill">毎日の英語習慣を支える</div>
        <h1 className="hero-title">
          つくたん
          <span>TSUKUTAN</span>
        </h1>
        <p className="hero-caption">
          単語学習・復習・ゴール設定をひとつのアプリで。
        </p>
      </div>

      <div className="login-card">
        <div className="input-stack">
          <label className="input-label">生徒ID / メールアドレス</label>
          <input
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="例: 1203 或いは name@example.com"
            autoComplete="username"
          />
        </div>

        <div className="input-stack">
          <label className="input-label">パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="先生から指定されたパスワード"
            autoComplete="current-password"
          />
        </div>

        <button
          className="primary-action"
          onClick={handleLogin}
          disabled={isProcessing}
        >
          {isProcessing ? 'ログイン中...' : 'ログイン'}
        </button>

        <p className="helper-text">
          ログインで困ったら、先生にお問い合わせください。
        </p>
      </div>
    </div>
  );
}

export default LoginPage;