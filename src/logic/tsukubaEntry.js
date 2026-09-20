/**
 * つくばホームから渡ってきたときの入場。
 *
 * つくばホームの生徒ポータルが `#token=<IDトークン>` を付けて開く。
 * それを `exchangeTsukubaToken` に渡すと、つくたんの入場券が返る。
 *
 * ## URL からすぐ消す
 * トークンは有効期限まで誰でも使える。**履歴・共有・スクリーンショットに残さない**。
 * フラグメントなのでサーバには送られていないが、端末には残る。
 *
 * ## 失敗しても、いつものログイン画面へ落とす
 * 渡りが失敗しても行き止まりにしない。つくたんのアカウントを持っている生徒は
 * これまでどおり入れる（アカウントを畳み終えるまでの受け皿でもある）。
 */

import { signInWithCustomToken } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../firebaseConfig.js';

/**
 * 一度取ったトークンを覚えておく。
 *
 * **StrictMode では効果が2回走る。** URL から消したあとの2回目が空を受け取ると、
 * 1回目の入場が打ち切られたまま**トークンごと消える**（開発中だけ「渡れない」に
 * なり、本番との違いで原因を探すことになる）。取った値を返し続ける。
 */
let _taken = '';

/**
 * URL からトークンを取り出し、**同時に消す**。
 *
 * 取り出しと削除を別々にすると、片方だけ通ったときに残る。1つの関数にまとめる。
 *
 * @param {Window} [win]
 * @returns {string} 無ければ空文字
 */
export function takeTokenFromUrl(win = window) {
    const hash = String(win.location?.hash || '');
    const m = /[#&]token=([^&]+)/.exec(hash);
    if (!m) return _taken;
    const token = decodeURIComponent(m[1]);
    _taken = token;
    try {
        // **履歴に積まない**（戻るボタンでトークン付きのURLへ戻れてしまう）
        const clean = `${win.location.pathname}${win.location.search}`;
        win.history.replaceState(null, '', clean);
    } catch (e) {
        // `replaceState` が使えなくても入場は続ける（消せないことは致命ではない）
        console.warn('[つくたん] URL からトークンを消せませんでした', e);
    }
    return token;
}

/**
 * つくばホームのトークンで入る。
 *
 * @param {string} idToken
 * @returns {Promise<void>} 失敗したら投げる（呼び出し側が見せ方を決める）
 */
export async function signInWithTsukubaToken(idToken) {
    const call = httpsCallable(getFunctions(), 'exchangeTsukubaToken');
    const res = await call({ idToken });
    const customToken = res?.data?.customToken;
    if (typeof customToken !== 'string' || customToken === '') {
        throw new Error('入場券を受け取れませんでした');
    }
    await signInWithCustomToken(auth, customToken);
}

/**
 * 起動時に1度だけ呼ぶ。**トークンが無ければ何もしない。**
 *
 * @returns {Promise<{ tried: boolean, ok: boolean, message: string }>}
 */
export async function enterFromTsukubaHome() {
    const token = takeTokenFromUrl();
    if (token === '') return { tried: false, ok: true, message: '' };
    try {
        await signInWithTsukubaToken(token);
        return { tried: true, ok: true, message: '' };
    } catch (e) {
        console.warn('[つくたん] つくばホームからの入場に失敗しました', e);
        return {
            tried: true,
            ok: false,
            message: 'つくばホームからの入場に失敗しました。もう一度お試しください。',
        };
    }
}

/** テスト用。**覚えているトークンを忘れる**（本番の経路では呼ばない） */
export function _forgetTakenToken() {
    _taken = '';
}
