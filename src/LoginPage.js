/**
 * ログイン画面。
 *
 * **生徒はつくばホームのアカウントで入る。** つくつく独自のアカウントは作らない
 * （増やすと生徒が2つ覚えることになり、退塾しても片方が止まらない）。
 *
 * この画面が要るのは**PWAのため**。iOS のホーム画面に入れたアプリは Safari と
 * 保存領域が別なので、ブラウザで入っていてもアプリの中では未ログインになる。
 * つくばホームから渡される `#token=` はアプリの中には届かないので、
 * ここで一度入れるようにしてある。**受験サポートと同じ形**
 * （`tsukuba-manager/src/exam-support-page/SignIn.tsx`）。校舎を選ばせるのも同じ。
 *
 * **先生の窓は分ける。** 管理画面はつくつく自身のアカウントで入るので、
 * 校舎も生徒番号も関係が無い。生徒の窓に混ぜると、どちらの入力欄か分からなくなる。
 */
import React, { useEffect, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebaseConfig.js';
import BrandLogo from './components/brand/BrandLogo';
import BrandLoader from './components/brand/BrandLoader';
import { signInWithTsukubaHome, loadSchools, DEFAULT_SCHOOLS } from './logic/tsukubaSignIn';

/** Firebase のエラーコードを、読んで分かる文言にする（先生の窓で使う） */
const messageForError = (error) => {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'メールアドレスの形式が正しくありません。';
    case 'auth/user-disabled':
      return 'このアカウントは現在使えません。';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'メールアドレスまたはパスワードが違います。';
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。しばらく待ってからもう一度お試しください。';
    case 'auth/network-request-failed':
      return '通信に失敗しました。電波状況を確認してください。';
    default:
      return 'ログインできませんでした。しばらくしてからもう一度お試しください。';
  }
};

function LoginPage() {
  const [staffMode, setStaffMode] = useState(false);
  const [schools, setSchools] = useState(DEFAULT_SCHOOLS);
  const [school, setSchool] = useState(DEFAULT_SCHOOLS[0].id);
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    void loadSchools().then((list) => {
      if (!alive || list.length === 0) return;
      setSchools(list);
      setSchool((now) => (list.some((s) => s.id === now) ? now : list[0].id));
    });
    return () => { alive = false; };
  }, []);

  // form の submit にしてあるので、入力欄で Enter を押してもログインできる
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isProcessing) return;
    setError(null);
    setIsProcessing(true);

    try {
      if (staffMode) {
        if (!email.trim() || !password) {
          setError('メールアドレスとパスワードを入力してください。');
          return;
        }
        await signInWithEmailAndPassword(auth, email.trim(), password);
        return;
      }

      const result = await signInWithTsukubaHome({
        id: studentId,
        password,
        school,
      });
      // 入れたら App.js の onAuthStateChanged が続きを描く
      if (!result.ok) setError(result.message);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-hero">
        {/* 画像の中の文字だけに見出しの意味を持たせない。
            h1 は残し、視覚的にだけ隠す（計画書4.4）。 */}
        <h1 className="visually-hidden">つくつく</h1>
        <BrandLogo placement="login" priority decorative />
      </div>

      <form className="login-card" onSubmit={handleSubmit}>
        {error && (
          <p className="message-box message-box-error" role="alert">{error}</p>
        )}

        {staffMode ? (
          <div className="input-stack">
            <label className="input-label" htmlFor="login-email">メールアドレス</label>
            <input
              id="login-email"
              name="username"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              disabled={isProcessing}
              required
            />
          </div>
        ) : (
          <>
            <div className="input-stack">
              <label className="input-label" htmlFor="login-school">校舎</label>
              <select
                id="login-school"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                disabled={isProcessing}
              >
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="input-stack">
              <label className="input-label" htmlFor="login-student-id">生徒番号</label>
              <input
                id="login-student-id"
                name="username"
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="例：s1203"
                autoComplete="username"
                disabled={isProcessing}
                required
              />
              {/* つくばホームと同じ打ち方にする。`s` を落として打つ生徒が出ると、
                  保護者のアドレスを叩いて「違います」になり、原因が見えない */}
              <p className="field-note">生徒番号は先頭に <b>s</b> が付きます（例: s1066）。</p>
            </div>
          </>
        )}

        <div className="input-stack">
          <label className="input-label" htmlFor="login-password">パスワード</label>
          <input
            id="login-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={staffMode ? '' : 'つくばホームと同じパスワード'}
            autoComplete="current-password"
            disabled={isProcessing}
            required
          />
        </div>

        <button type="submit" className="primary-action" disabled={isProcessing}>
          {isProcessing ? <BrandLoader inline label="ログイン中…" /> : 'つくつくをはじめる'}
        </button>

        <p className="helper-text">
          {staffMode
            ? 'つくつくの管理アカウントで入ります。'
            : 'つくばホームと同じ生徒番号・パスワードで入れます。困ったら先生に聞いてください。'}
        </p>

        <button
          type="button"
          className="login-switch"
          onClick={() => { setStaffMode((now) => !now); setError(null); }}
          disabled={isProcessing}
        >
          {staffMode ? '生徒の方はこちら' : '先生の方はこちら'}
        </button>
      </form>
    </div>
  );
}

export default LoginPage;
