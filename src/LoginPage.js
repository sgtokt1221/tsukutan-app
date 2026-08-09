import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebaseConfig.js';
import BrandLogo from './components/brand/BrandLogo';

/** Firebase のエラーコードを、生徒が読んで分かる文言にする */
const messageForError = (error) => {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'IDまたはメールアドレスの形式が正しくありません。';
    case 'auth/user-disabled':
      return 'このアカウントは現在使えません。先生に確認してください。';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'IDまたはパスワードが違います。もう一度確認してください。';
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。しばらく待ってからもう一度お試しください。';
    case 'auth/network-request-failed':
      return '通信に失敗しました。電波状況を確認してください。';
    default:
      return 'ログインできませんでした。しばらくしてからもう一度お試しください。';
  }
};

function LoginPage() {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // form の submit にしてあるので、入力欄で Enter を押してもログインできる
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isProcessing) return;

    const trimmedId = studentId.trim();
    if (!trimmedId || !password) {
      setError('IDとパスワードを入力してください。');
      return;
    }

    const email = trimmedId.includes('@') ? trimmedId : `${trimmedId}@tsukasafoods.com`;

    setIsProcessing(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error('Login error:', err.code);
      setError(messageForError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-hero">
        <div className="hero-pill">毎日の英語習慣を支える</div>
        {/* 画像の中の文字だけに見出しの意味を持たせない。
            h1 は残し、視覚的にだけ隠す（計画書4.4）。 */}
        <h1 className="visually-hidden">つくたん</h1>
        <BrandLogo placement="login" priority decorative />
        <p className="hero-caption">
          単語学習・復習・ゴール設定をひとつのアプリで。
        </p>
      </div>

      <form className="login-card" onSubmit={handleSubmit}>
        {error && (
          <p className="message-box message-box-error" role="alert">{error}</p>
        )}

        <div className="input-stack">
          <label className="input-label" htmlFor="login-student-id">生徒ID / メールアドレス</label>
          <input
            id="login-student-id"
            name="username"
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="例: 1203 或いは name@example.com"
            autoComplete="username"
            disabled={isProcessing}
            required
          />
        </div>

        <div className="input-stack">
          <label className="input-label" htmlFor="login-password">パスワード</label>
          <input
            id="login-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="先生から指定されたパスワード"
            autoComplete="current-password"
            disabled={isProcessing}
            required
          />
        </div>

        <button type="submit" className="primary-action" disabled={isProcessing}>
          {isProcessing ? 'ログイン中...' : 'ログイン'}
        </button>

        <p className="helper-text">
          ログインで困ったら、先生にお問い合わせください。
        </p>
      </form>
    </div>
  );
}

export default LoginPage;
