/**
 * つくばホームの管理者に、生徒の「苦手な単語」を渡すときの決まり。
 *
 * ## なぜここにあるか（2026-09-23）
 * 生徒を見る場所をつくばホームの管理画面（`/tsukutsuku/`）に一本化した。
 * 塾がそこで出したいのは「その生徒の苦手な単語の小テスト」だけ（AI長文は使わない）。
 * あちらの管理者のIDトークンで読める口（`staffStudentMaterials`）の中身の判定をここに置く
 * （Firestore を触らないのでテストできる）。
 *
 * ## 誰に渡すか
 * つくばホームのカスタムクレーム `role === 'admin'` だけ（→ `tsukubaToken.js`）。
 * 講師・生徒本人（`learner`）・保護者（`student`）には渡さない（2026-09-23 に「管理者だけ」と決めた）。
 *
 * ## 苦手な単語の決め方
 * 採点のたびに `reviewScheduling.js` が `repetitions` と `easeFactor` を書き換える。
 * 「もう一度」で `repetitions` は0に戻り、`easeFactor` は下がる（初期2.5・下限1.3・上限3.0）。
 * - 覚えた語（`status: 'mastered'`）と、移した古い文書（`migratedTo`）は除く
 * - 苦手 ＝ **直近で間違えた**（`repetitions === 0` で一度は答えている）か、
 *   **`easeFactor` が初期値より下がった**（間違い・迷いが正解より多い）
 * - 並び：直近で間違えた語が先、次に `easeFactor` の低い順
 */

/** つくばホームの管理者の役割 */
const ADMIN_ROLE = 'admin';

/** 覚えやすさの初期値。これより下がっていれば、間違い・迷いが正解より多い */
const INITIAL_EASE = 2.5;

class StaffAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StaffAccessError';
  }
}

/**
 * 管理者として読んでよいか。だめなら StaffAccessError を投げる。
 * @param {{ role?: string }} decoded つくばホームのIDトークンを検証した中身
 */
function assertStaffClaims(decoded) {
  if (decoded && decoded.role === ADMIN_ROLE) return;
  throw new StaffAccessError('管理者のアカウントで開いてください');
}

/** 一度でも答えているか（初めて出た語の記録には答えた時刻がある） */
const hasAnswered = (data) => Boolean(data.lastReviewed);

/**
 * 苦手な単語。苦手な順。
 *
 * @param {Array<{id: string, data: object}>} docs users/{uid}/reviewWords
 * @returns {Array<{id: string, word: string, meaning: string, lastWrong: boolean}>}
 */
function weakWordsForQuiz(docs) {
  return (docs || [])
    .filter(({ data }) => data && !data.migratedTo && data.status !== 'mastered')
    .map(({ id, data }) => {
      const ease = Number.isFinite(data.easeFactor) ? data.easeFactor : INITIAL_EASE;
      const lastWrong = hasAnswered(data) && data.repetitions === 0;
      return {
        id,
        word: String(data.word || ''),
        meaning: String(data.meaning || data.japanese || data.translation || ''),
        lastWrong,
        ease,
      };
    })
    .filter((w) => w.word !== '' && (w.lastWrong || w.ease < INITIAL_EASE))
    .sort((a, b) => (Number(b.lastWrong) - Number(a.lastWrong)) || (a.ease - b.ease))
    .map(({ id, word, meaning, lastWrong }) => ({ id, word, meaning, lastWrong }));
}

module.exports = {
  ADMIN_ROLE,
  StaffAccessError,
  assertStaffClaims,
  weakWordsForQuiz,
};
