/**
 * つくばホームから渡ってきたときの入場。
 *
 * **トークンを URL に残さない。** 有効期限まで誰でも使えるので、履歴・共有・
 * スクリーンショットに残ると、そのまま他人が生徒として入れる。
 */

jest.mock('firebase/auth', () => ({ signInWithCustomToken: jest.fn(async () => ({})) }));
jest.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: jest.fn(),
}));
jest.mock('../firebaseConfig.js', () => ({ auth: {}, db: {} }));

import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { takeTokenFromUrl, enterFromTsukubaHome, _forgetTakenToken } from './tsukubaEntry';

/** `window.location` と `history` を差し替える */
function fakeWindow(hash) {
  return {
    location: { hash, pathname: '/', search: '' },
    history: { replaceState: jest.fn() },
  };
}

beforeEach(() => {
  _forgetTakenToken();
  jest.clearAllMocks();
});

describe('URL からトークンを取る', () => {
  test('取り出すと同時に URL から消す', () => {
    const win = fakeWindow('#token=abc.def');
    expect(takeTokenFromUrl(win)).toBe('abc.def');
    expect(win.history.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  test('**履歴に積まない。** 戻るボタンでトークン付きの URL へ戻れてしまう', () => {
    const win = fakeWindow('#token=abc');
    takeTokenFromUrl(win);
    // `pushState` ではなく `replaceState`
    expect(win.history.pushState).toBeUndefined();
  });

  test('URL に入れた記号を戻す', () => {
    expect(takeTokenFromUrl(fakeWindow('#token=a%2Fb%2Bc'))).toBe('a/b+c');
  });

  test('**2回目も同じものを返す。** StrictMode では効果が2回走る', () => {
    const win = fakeWindow('#token=abc');
    expect(takeTokenFromUrl(win)).toBe('abc');
    // 2回目の URL はもう消えている
    expect(takeTokenFromUrl(fakeWindow(''))).toBe('abc');
  });

  test('無ければ空', () => {
    expect(takeTokenFromUrl(fakeWindow(''))).toBe('');
    expect(takeTokenFromUrl(fakeWindow('#other=1'))).toBe('');
  });
});

describe('入場', () => {
  test('入場券を受け取ってサインインする', async () => {
    window.location.hash = '#token=abc';
    httpsCallable.mockReturnValue(async () => ({ data: { customToken: 'ct' } }));
    const r = await enterFromTsukubaHome();
    expect(r).toEqual({ tried: true, ok: true, message: '' });
    expect(signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), 'ct');
  });

  test('**トークンが無ければ何もしない**（つくたんに直接来た人）', async () => {
    window.location.hash = '';
    const r = await enterFromTsukubaHome();
    expect(r.tried).toBe(false);
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });

  test('**失敗しても行き止まりにしない。** 理由を返して、ログイン画面へ落とす', async () => {
    window.location.hash = '#token=abc';
    httpsCallable.mockReturnValue(async () => { throw new Error('permission-denied'); });
    const r = await enterFromTsukubaHome();
    expect(r).toEqual({ tried: true, ok: false, message: expect.stringContaining('入場に失敗') });
  });

  test('**入場券が空なら失敗にする。** サインインせずに通さない', async () => {
    window.location.hash = '#token=abc';
    httpsCallable.mockReturnValue(async () => ({ data: {} }));
    const r = await enterFromTsukubaHome();
    expect(r.ok).toBe(false);
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });
});
