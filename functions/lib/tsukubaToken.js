/**
 * つくばホーム（`tsukubamanager-4900b`）の ID トークンを検証して、つくたんの
 * Custom Token を発行する。**生徒の入場券はこれ1本だけ。**
 *
 * ## アカウントを2つ作らない
 * つくばホームが認証の正本で、つくたんは**そこで通った人にだけ**自分用の切符を渡す。
 * 「2つ作って同期」を採らないのは、パスワードの変更が追従せず、退塾のときに
 * 2箇所止める必要が生じるため。片方を忘れると入れたまま残る——実際、つくたんには
 * つくばホームに居ない生徒のアカウントが67件あった（2026-09-20 の突合）。
 *
 * ## uid はつくばホームのものをそのまま使う
 * `createCustomToken(つくばホームの uid)` にすることで、つくたんの `users/{uid}` が
 * つくばホームと同じ鍵で並ぶ。勉強時間を送り返すときも、向こうがトークンから
 * uid を取るだけで突き合わせられる（番号での名寄せをしない）。
 *
 * ## 校舎は見ない
 * juku-route（高等部の参考書ルート）と違い、**つくたんは全校舎の生徒が使う**。
 * 英単語は誰がやってもよい。
 *
 * 検証は firebase-admin に任せる。署名・有効期限・発行元の検査を自分で書くと必ず間違える。
 */

const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

/** 認証の正本。**ここを間違えると他人のプロジェクトのトークンを信じる** */
const TSUKUBA_PROJECT_ID = 'tsukubamanager-4900b';
const TSUKUBA_APP_NAME = 'tsukuba-home';

/**
 * 生徒本人を表すロール。**つくばホームが 2026-08-28 に `learner` で確定させた。**
 *
 * つくばホームの既存 `role: 'student'` は**保護者**のアカウントであり、生徒本人ではない。
 * 通すと保護者が生徒として入り、勉強時間が親のぶんとして記録される。
 *
 * **この文字列を変えない。** つくばホーム側がこの値でクレームを書く。
 * 綴りがずれると**全生徒を静かに拒否する**（向こうにログは出ない）。
 */
const LEARNER_ROLE = 'learner';

/**
 * つくばホームのプロジェクトを見る Admin App。
 *
 * 既定の App はつくたんを指しているので、そのまま `verifyIdToken` すると
 * **つくたん自身が発行したトークンを通してしまう**。プロジェクトIDを明示した
 * 2つ目の App を使い、`aud` / `iss` がつくばホームのものであることを検査させる。
 *
 * 資格情報は要らない。`verifyIdToken` は公開鍵で署名を確かめるだけで、
 * つくばホーム側の Auth を読みには行かない（読む権限も持っていない）。
 */
function tsukubaAuth() {
    const existing = getApps().find((a) => a.name === TSUKUBA_APP_NAME);
    return getAuth(existing || initializeApp({ projectId: TSUKUBA_PROJECT_ID }, TSUKUBA_APP_NAME));
}

/**
 * 入ってよいかを検査する。**「認証できた」と「入ってよい」は別。**
 *
 * 比較は厳密等価にする。`'LEARNER'` や `['learner']` を通さないため
 * （クレームは JSON なので、文字列以外が来る余地が実際にある）。
 *
 * @param {Record<string, unknown>} claims
 * @throws {Error} 入れない理由
 */
function assertTsukubaClaims(claims) {
    // `role: 'student'` を専用の文面で弾くのは、運用時に理由が分かるようにするため
    if (claims.role === 'student') {
        throw new Error('生徒本人のロールが未設定です（role:student は保護者のアカウント）');
    }
    if (claims.role !== LEARNER_ROLE) {
        throw new Error('生徒アカウントではありません');
    }
}

/**
 * つくばホームの生徒番号。**メールから取る。**
 *
 * 生徒本人のアドレスは `s{番号}@{校舎}.com`（つくばホームの `learner-account.js`）。
 * クレームには番号が載っていないので、ここだけはアドレスを読む。
 *
 * **ゼロ埋めしない。** つくたんの古い4桁ID（`0917`）とつくばホームの番号（`917`）は
 * 別物で、高等部では体系そのものが違う（つくたん `0912` ＝ つくばホーム `242`）。
 * これからは**つくばホームの番号を正本にする**ので、そのまま持つ。
 *
 * @param {string} email
 * @returns {string} 取れなければ空文字
 */
function studentNumberFromEmail(email) {
    const m = /^s(\d+)@/.exec(String(email || '').trim().toLowerCase());
    return m ? m[1] : '';
}

/**
 * 初回だけプロフィールを作る。**2回目以降は上書きしない。**
 *
 * つくたんで直した名前や学年を、ログインのたびに戻さないため。
 *
 * **作らないと目標設定で落ちる。** `GoalSetter` は `updateDoc` で書くので、
 * doc が無いと「存在しない」で例外になる（新しく入った生徒が先へ進めない）。
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ uid: string, email?: string, grade?: unknown, school?: unknown }} decoded
 */
async function ensureStudentProfile(db, decoded) {
    const ref = db.collection('users').doc(decoded.uid);
    if ((await ref.get()).exists) return;
    await ref.set({
        // **名前はクレームに載っていない。** 推測せず空にする（塾の画面には
        // つくばホーム側の名前が出るので、ここが空でも誰か分からなくはならない）
        name: '',
        studentId: studentNumberFromEmail(decoded.email),
        grade: typeof decoded.grade === 'string' ? decoded.grade : '',
        level: 0,
        goal: { targetExam: null, targetDate: null, isSet: false },
        progress: { percentage: 0, currentVocabulary: 0, lastCheckedAt: null },
        // 出自を残す。つくたん側で作った古いアカウントと混ざると、
        // どちらを止めれば入れなくなるか分からなくなる
        source: 'tsukuba-home',
        school: typeof decoded.school === 'string' ? decoded.school : '',
        createdAt: new Date().toISOString(),
    });
}

module.exports = {
    TSUKUBA_PROJECT_ID,
    LEARNER_ROLE,
    tsukubaAuth,
    assertTsukubaClaims,
    studentNumberFromEmail,
    ensureStudentProfile,
};
