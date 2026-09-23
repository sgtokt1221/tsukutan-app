/**
 * つくばホームの職員に、生徒の教材（復習リスト・AI長文）を渡すときの決まり。
 *
 * ## なぜここにあるか（2026-09-23）
 * 生徒を見る場所をつくばホームの管理者ポータル（「つくつく」タブ）に一本化した。
 * つくつく独自の管理画面にしか無かった「復習の小テスト印刷」と「長文の印刷」を
 * あちらへ移すため、あちらの職員のIDトークンで読める口（`staffStudentMaterials`）を作った。
 * ここはその中身の判定だけを持つ（Firestore を触らないのでテストできる）。
 *
 * ## 誰に渡すか
 * つくばホームのカスタムクレーム `role` で決める（→ `tsukubaToken.js`）。
 * - `admin`   … どの校舎の生徒でも
 * - `teacher` … **自分の校舎（クレームの `school`）の生徒だけ**。生徒の校舎が分からなければ渡さない
 * - それ以外（`learner` ＝生徒本人、`student` ＝保護者）には渡さない
 */

/** つくばホームの職員の役割。生徒は `LEARNER_ROLE`（→ tsukubaToken.js） */
const ADMIN_ROLE = 'admin';
const TEACHER_ROLE = 'teacher';

class StaffAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StaffAccessError';
  }
}

/**
 * 職員として読んでよいか。だめなら StaffAccessError を投げる。
 *
 * @param {{ role?: string, school?: string }} decoded つくばホームのIDトークンを検証した中身
 * @param {string} studentSchool つくつくの users/{uid}.school（初回ログインで入る）
 */
function assertStaffClaims(decoded, studentSchool) {
  const role = decoded && decoded.role;
  if (role === ADMIN_ROLE) return;
  if (role === TEACHER_ROLE) {
    const own = typeof decoded.school === 'string' ? decoded.school : '';
    if (own !== '' && own === studentSchool) return;
    throw new StaffAccessError('ほかの校舎の生徒の教材は開けません');
  }
  throw new StaffAccessError('職員のアカウントで開いてください');
}

/**
 * 小テストに出す復習語。
 *
 * 永続IDへ移したときの古い文書（`migratedTo`）と、もう覚えた語（`status: 'mastered'`）は除く。
 * 生徒側の日次プランと、これまでの管理画面が数えていたのと同じ条件。
 *
 * @param {Array<{id: string, data: object}>} docs
 * @returns {Array<{id: string, word: string, meaning: string}>}
 */
function reviewWordsForQuiz(docs) {
  return (docs || [])
    .filter(({ data }) => data && !data.migratedTo && data.status !== 'mastered')
    .map(({ id, data }) => ({
      id,
      word: String(data.word || ''),
      meaning: String(data.meaning || data.japanese || data.translation || ''),
    }))
    .filter((entry) => entry.word !== '');
}

/** Firestore の時刻・ISO文字列・Date を ISO 文字列にそろえる。読めなければ null */
function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** 語の並びを文字列の配列にそろえる（古い長文は語オブジェクトを持っていることがある） */
function wordList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry : (entry && entry.word) || ''))
    .map((entry) => String(entry).trim())
    .filter(Boolean);
}

/**
 * 印刷する長文。生成に失敗したものと生成中のものは除く。新しい順。
 *
 * **本文は `sentences`**（`{ english, japanese }` の配列）。これまでの印刷は
 * 存在しない `english` / `japanese` を読んでいて、本文以外の欄が出ていなかった。
 *
 * @param {Array<{id: string, data: object}>} docs
 */
function storiesForPrint(docs) {
  return (docs || [])
    .filter(({ data }) => data && data.status !== 'failed' && data.status !== 'generating')
    .map(({ id, data }) => ({
      id,
      title: String(data.title || '長文'),
      createdAt: toIso(data.createdAt),
      sentences: (Array.isArray(data.sentences) ? data.sentences : [])
        .map((s) => ({ english: String((s && s.english) || ''), japanese: String((s && s.japanese) || '') }))
        .filter((s) => s.english !== ''),
      usedWords: wordList(data.usedWords),
      unusedWords: wordList(data.unusedWords),
    }))
    .filter((story) => story.sentences.length > 0)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

module.exports = {
  ADMIN_ROLE,
  TEACHER_ROLE,
  StaffAccessError,
  assertStaffClaims,
  reviewWordsForQuiz,
  storiesForPrint,
};
