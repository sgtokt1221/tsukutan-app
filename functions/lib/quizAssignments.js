/**
 * 管理者が出す「教科書の小テスト」の決まり。**Firestore を触らない純関数だけ**（テストできるように）。
 *
 * ## 流れ（2026-09-24）
 * つくばホームの管理画面（`/tsukutsuku/`）で、学年・ページ・問題数・向きと対象の生徒を選んで出す
 * → `quiz_assignments/{id}` に書く → 生徒のつくつくのホームにカードが出る → 4択で解く
 * → 結果を `users/{uid}/quizResults/{id}` に本人が書く → 管理画面で済み・点数を見る。
 *
 * ## 語はサーバが選ぶ
 * 画面から語を受け取らない（書き換えられても、教科書に無い語や別の意味が出ないように）。
 * 教科書の語は `public/data/words-textbook-sunshine.json`（`scripts/build-textbook-words.js`）。
 * ページの切り出しは画面側の `src/logic/textbookPages.js` の `wordsInPages` と**同じ規則**
 * （はじめ〜おわりを含む・ページ→表の順）。片方だけ変えると、画面で見せた語と出る語が食い違う。
 * **出した時点の語を写して持つ**（あとで単語データを作り直しても、出した小テストは変わらない）。
 */

const DIRECTIONS = ['en-ja', 'ja-en'];
/** 1回に出せる人数の上限（1つの文書に入る大きさと、誤操作で全校に出さないため） */
const MAX_TARGETS = 300;
/** 1回の問題数の上限（生徒が一度に解ける量） */
const MAX_QUESTIONS = 50;

class QuizInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuizInputError';
  }
}

const isInt = (v) => Number.isInteger(v);

/**
 * 出すときの入力を確かめて、そろえた形で返す。だめなら QuizInputError。
 * @param {object} body 画面から来た値
 */
function validateCreate(body) {
  const b = body || {};
  const grade = Number(b.grade);
  const pageFrom = Number(b.pageFrom);
  const pageTo = Number(b.pageTo);
  const count = Number(b.count);
  if (![1, 2, 3].includes(grade)) throw new QuizInputError('学年を選んでください');
  if (!isInt(pageFrom) || !isInt(pageTo) || pageFrom < 1 || pageTo < 1) throw new QuizInputError('ページを選んでください');
  if (!isInt(count) || count < 0 || count > MAX_QUESTIONS) throw new QuizInputError(`問題数は${MAX_QUESTIONS}問までです`);
  if (!DIRECTIONS.includes(b.direction)) throw new QuizInputError('出題の向きを選んでください');
  const targets = [...new Set(Array.isArray(b.targetUids) ? b.targetUids : [])];
  if (targets.length === 0) throw new QuizInputError('対象の生徒を選んでください');
  if (targets.length > MAX_TARGETS) throw new QuizInputError(`一度に出せるのは${MAX_TARGETS}人までです`);
  if (targets.some((u) => typeof u !== 'string' || u === '' || u.includes('/') || u.length > 128)) {
    throw new QuizInputError('対象の生徒の指定が正しくありません');
  }
  return {
    grade,
    pageFrom: Math.min(pageFrom, pageTo),
    pageTo: Math.max(pageFrom, pageTo),
    count,
    direction: b.direction,
    targetUids: targets,
  };
}

/** その学年のページ範囲の語（textbookPages.js の wordsInPages と同じ規則） */
function wordsInPages(cards, grade, from, to) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return (cards || [])
    .filter((c) => c.grade === grade && c.page >= lo && c.page <= hi)
    .sort((a, b) => a.page - b.page || a.order - b.order);
}

/** 見出し（`Sunshine 1年 p.30〜45`） */
const titleOf = ({ grade, pageFrom, pageTo }) =>
  `Sunshine ${grade}年 ${pageFrom === pageTo ? `p.${pageFrom}` : `p.${pageFrom}〜${pageTo}`}`;

/**
 * 出題する語を選ぶ。範囲から count 語（0 なら全部）を**混ぜて**選ぶ。全員同じ問題になる。
 * @returns {Array<{id, word, meaning, page}>} 写して持つ形
 */
function pickQuizWords(cards, input, random = Math.random) {
  const pool = wordsInPages(cards, input.grade, input.pageFrom, input.pageTo)
    .filter((c) => c && c.id && c.word && c.meaning);
  if (pool.length === 0) throw new QuizInputError('このページには出せる単語がありません');
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked = input.count > 0 ? shuffled.slice(0, input.count) : shuffled;
  return picked.map(({ id, word, meaning, page }) => ({ id, word, meaning, page }));
}

/**
 * 出した小テスト1件の集計。
 * @param {object} assignment quiz_assignments の中身（targetUids を持つ）
 * @param {Map<string, {score:number, total:number}|null>} resultsByUid 結果（無ければ null）
 */
function summarize(assignment, resultsByUid) {
  const perStudent = (assignment.targetUids || []).map((uid) => {
    const r = resultsByUid.get(uid) || null;
    return r
      ? { uid, done: true, score: Number(r.score) || 0, total: Number(r.total) || 0 }
      : { uid, done: false };
  });
  const done = perStudent.filter((p) => p.done);
  const rates = done.filter((p) => p.total > 0).map((p) => p.score / p.total);
  return {
    doneCount: done.length,
    targetCount: perStudent.length,
    averageRate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
    perStudent,
  };
}

module.exports = {
  DIRECTIONS, MAX_TARGETS, MAX_QUESTIONS, QuizInputError,
  validateCreate, wordsInPages, titleOf, pickQuizWords, summarize,
};
