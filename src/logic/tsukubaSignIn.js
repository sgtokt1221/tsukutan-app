/**
 * つくばホームのアカウントで、この画面の中から入る。
 *
 * **PWA のため。** iOS のホーム画面に入れたアプリは Safari と保存領域が別なので、
 * ブラウザで入っていても**アプリの中では未ログイン**になる。`#token=` は
 * つくばホームから来たときにしか渡らないので、アプリの中では使えない。
 * ここで一度入れば、あとはアプリ自身の保存領域に残る。
 *
 * **受験サポート（`/exam-support/`）と同じ形。**
 * あちらもつくばホームへ飛ばすのをやめて、画面の中で入れるようにしている
 * （`tsukuba-manager/src/exam-support-page/SignIn.tsx`）。校舎を選ばせるのも同じ。
 *
 * ## つくばホームは別プロジェクト
 * つくつく（`tsukutan-58b3f`）とつくばホーム（`tsukubamanager-4900b`）は別なので、
 * **つくばホーム用の Firebase アプリをもう1つ立てて**そちらでサインインし、
 * 受け取った ID トークンを `exchangeTsukubaToken` で入場券に替える。
 * つくつく側のログイン状態はそこで初めてできる。
 *
 * **パスワードはどこへも送らない。** Firebase Auth へ直接渡すだけで、
 * つくつくのサーバも、つくばホームの関数も通らない。
 */

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { signInWithTsukubaToken } from './tsukubaEntry';

/** つくばホームの Web 設定（公開値。`tsukuba-manager/src/shared/firebase.js` と同じ） */
const TSUKUBA_CONFIG = {
  apiKey: 'AIzaSyDYgtXjm1ML4aPqHJmu5LP4A5X1ALehTCs',
  authDomain: 'tsukubamanager-4900b.firebaseapp.com',
  projectId: 'tsukubamanager-4900b',
};

const APP_NAME = 'tsukuba-home';

/**
 * 校舎の既定。**名前と並びの正本は つくばホームの `src/shared/utils.js`。**
 *
 * `school_master` から名前は上書きするが、**一覧をマスタ任せにしない**。
 * 本番のマスタには `highschool` の1件しか入っておらず（2026-09-20 に確認）、
 * マスタだけにすると**3校の生徒が自分の校舎を選べなくなる**。
 */
export const DEFAULT_SCHOOLS = [
  { id: 'makami', name: '真上校' },
  { id: 'hokkan', name: '北冠校' },
  { id: 'okanmuri', name: '大冠校' },
  { id: 'highschool', name: 'ハイスクール' },
];

const tsukubaApp = () => (getApps().some((a) => a.name === APP_NAME)
  ? getApp(APP_NAME)
  : initializeApp(TSUKUBA_CONFIG, APP_NAME));

/**
 * 校舎の一覧。
 *
 * **並びは既定のまま。** マスタは名前の上書きと、増えた校舎の追加にだけ使う。
 * マスタを先に並べると、1件しか入っていない本番では
 * 「ハイスクール → 真上校 → …」という不自然な順になる。
 *
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function loadSchools() {
  let master = [];
  try {
    const db = getFirestore(tsukubaApp());
    const snap = await getDocs(query(collection(db, 'school_master'), orderBy('displayOrder', 'asc')));
    master = snap.docs
      .map((d) => ({ id: d.id, name: String(d.data().name || d.id), active: d.data().active }))
      .filter((s) => s.id !== '' && s.active !== false);
  } catch (error) {
    master = [];
  }

  const names = new Map(master.map((s) => [s.id, s.name]));
  const known = new Set(DEFAULT_SCHOOLS.map((s) => s.id));
  return [
    ...DEFAULT_SCHOOLS.map((s) => ({ id: s.id, name: names.get(s.id) || s.name })),
    ...master.filter((s) => !known.has(s.id)).map((s) => ({ id: s.id, name: s.name })),
  ];
}

/**
 * 試すアドレス。**選んだ校舎だけ。**
 *
 * 生徒本人のアドレスは `s{番号}@{校舎}.com`
 * （つくばホームの `functions/shared/login-emails.js` が正本）。
 *
 * **他の校舎へ落ちない。** つくばホームのログインは、見つからなければ他校舎も試す。
 * だが**生徒番号は校舎間で重複していて、初期パスワードは番号から決まる**ので、
 * 校舎を選び間違えた生徒が**別人の口座に入れてしまう**
 * （2026-09-20 に本番で確認。`s1335@makami.com` と `s1335@hokkan.com` は別人で、
 * どちらも同じパスワードで通った）。つくばホーム側はいまの挙動として残してあるが、
 * ここで写すと穴を1つ増やすことになる。**選び間違いは「違います」で返す。**
 *
 * @param {string} id 生徒番号（`s` は付いていても付いていなくてもよい）
 * @param {string} school 選んだ校舎ID
 * @returns {string[]} 0個か1個
 */
export function signInEmailsFor(id, school) {
  const num = String(id || '').trim().toLowerCase().replace(/^s/, '');
  if (!/^\d{1,10}$/.test(num) || !school) return [];
  return [`s${num}@${school}.com`];
}

/**
 * 合言葉が違っただけの失敗か。
 *
 * **文言を分けるために見る。** 締め出し（`too-many-requests`）や通信の不調を
 * 「パスワードが違います」と言うと、生徒が何度も打ち直して本当に閉め出される。
 *
 * @param {string} code Firebase Auth の `error.code`
 */
export function isWrongCredential(code) {
  return code === 'auth/user-not-found'
    || code === 'auth/invalid-login-credentials'
    || code === 'auth/invalid-credential';
}

/**
 * つくばホームのアカウントでつくつくに入る。
 *
 * @param {{id: string, password: string, school: string}} input
 * @returns {Promise<{ok: boolean, message?: string}>}
 */
export async function signInWithTsukubaHome({ id, password, school }) {
  if (!String(id || '').trim() || !password) {
    return { ok: false, message: '生徒番号とパスワードを入れてください。' };
  }

  const [email] = signInEmailsFor(id, school);
  if (!email) {
    return { ok: false, message: '生徒番号は数字で入れてください。' };
  }

  const auth = getAuth(tsukubaApp());
  let credential = null;
  try {
    credential = await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    return {
      ok: false,
      message: isWrongCredential(error?.code)
        ? '生徒番号またはパスワードが違います。校舎が合っているか確かめてください。'
        : 'ログインできませんでした。時間をおいて試してください。',
    };
  }

  try {
    const idToken = await credential.user.getIdToken();
    await signInWithTsukubaToken(idToken);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error?.message || 'つくつくに入れませんでした。' };
  } finally {
    // **つくばホーム側の状態は残さない。** つくつくに要るのは入場券だけ
    await signOut(auth).catch(() => {});
  }
}
