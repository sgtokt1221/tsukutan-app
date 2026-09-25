/**
 * 管理者が出す「教科書の小テスト」の決まり。**Firestore を触らない純関数だけ**（テストできるように）。
 *
 * ## 流れ（2026-09-24）
 * つくばホームの管理画面（`/tsukutsuku/`）で、学年・ページ・問題数・向きと対象の生徒を選んで出す
 * → `quiz_assignments/{id}` に書く → 生徒のつくつくのホームにカードが出る → 4択で解く
 * → 結果を `users/{uid}/quizResults/{id}` に本人が書く → 管理画面で済み・点数を見る。
 *
 * ## 出題元（2026-09-24 に苦手な単語、2026-09-26 に単語帳・英検を足した）
 * - `textbook` … 教科書の学年・ページから（下の説明）
 * - `weak` … その生徒の苦手な単語から（`staffMaterials.js` の weakWordsForQuiz。苦手な順に上から）。
 *   生徒ごとに語が違うので、**対象は1人だけ**
 *
 * ## 高校生・英検の出題元（2026-09-26）
 * - `book` … 単語帳（`QUIZ_BOOKS`）の**見出し番号 `no` の範囲**から（はじめ〜おわりを含む・番号順）。範囲から混ぜて選ぶ
 * - `eiken` … 英検の級から。語の級は `eikenLevels` の**いちばんやさしい級1つ**（textbookMastery.js の easiestEiken）。
 *   級には順番が無いので、**級の全部から混ぜて選ぶ**（ランダム）
 * 範囲・級の切り出しは、つくばホームの画面（`src/tsukutsuku/word-sources.js`）と**同じ規則**。
 * 向こうのテストがこちらの関数と突き合わせている（片方だけ変えると、画面で見せた語と出る語が食い違う）。
 *
 * ## 語はサーバが選ぶ
 * 画面から語を受け取らない（書き換えられても、教科書に無い語や別の意味が出ないように）。
 * 教科書の語は `public/data/words-textbook-sunshine.json`（`scripts/build-textbook-words.js`）。
 * ページの切り出しは画面側の `src/logic/textbookPages.js` の `wordsInPages` と**同じ規則**
 * （はじめ〜おわりを含む・ページ→表の順）。片方だけ変えると、画面で見せた語と出る語が食い違う。
 * **出した時点の語を写して持つ**（あとで単語データを作り直しても、出した小テストは変わらない）。
 */

const { easiestEiken } = require('./textbookMastery');

const DIRECTIONS = ['en-ja', 'ja-en'];
const SOURCES = ['textbook', 'weak', 'book', 'eiken'];
/**
 * 小テストに出せる単語帳。**題名と id の正本はつくつくの src/config/books.js**
 * （関数からは読めないので写している。quizAssignments.test.js が突き合わせる）
 */
const QUIZ_BOOKS = [
  { id: 'book-target1900', title: '英単語ターゲット1900', file: 'words-book-target1900.json' },
  { id: 'book-systan5', title: 'システム英単語', file: 'words-book-systan5.json' },
  { id: 'book-leap', title: '必携英単語LEAP', file: 'words-book-leap.json' },
  { id: 'book-idiom-target1000', title: '英熟語ターゲット1000', file: 'words-book-idiom-target1000.json' },
];
/** 小テストに出せる英検の級（1級は語に印が無いので出さない。定着度と同じ） */
const QUIZ_EIKEN_LEVELS = [
  { id: '5', label: '5級' }, { id: '4', label: '4級' }, { id: '3', label: '3級' },
  { id: 'pre2', label: '準2級' }, { id: '2', label: '2級' }, { id: 'pre1', label: '準1級' },
];
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
function validateTargets(b) {
  const targets = [...new Set(Array.isArray(b.targetUids) ? b.targetUids : [])];
  if (targets.length === 0) throw new QuizInputError('対象の生徒を選んでください');
  if (targets.length > MAX_TARGETS) throw new QuizInputError(`一度に出せるのは${MAX_TARGETS}人までです`);
  if (targets.some((u) => typeof u !== 'string' || u === '' || u.includes('/') || u.length > 128)) {
    throw new QuizInputError('対象の生徒の指定が正しくありません');
  }
  return targets;
}

function validateCreate(body) {
  const b = body || {};
  // 出題元を書いていないものは教科書（2026-09-24 までの画面は source を送らなかった）
  const source = b.source === undefined ? 'textbook' : b.source;
  if (!SOURCES.includes(source)) throw new QuizInputError('出題元を選んでください');
  const count = Number(b.count);
  if (!isInt(count) || count < 0 || count > MAX_QUESTIONS) throw new QuizInputError(`問題数は${MAX_QUESTIONS}問までです`);
  if (!DIRECTIONS.includes(b.direction)) throw new QuizInputError('出題の向きを選んでください');
  if (source === 'weak') {
    const uids = Array.isArray(b.targetUids) ? b.targetUids : [];
    if (uids.length !== 1 || typeof uids[0] !== 'string' || uids[0] === '' || uids[0].includes('/')) {
      throw new QuizInputError('苦手な単語の小テストは、1人ずつ出します');
    }
    return { source, count, direction: b.direction, targetUids: [uids[0]] };
  }
  if (source === 'book') {
    if (!QUIZ_BOOKS.some((book) => book.id === b.bookId)) throw new QuizInputError('単語帳を選んでください');
    const noFrom = Number(b.noFrom);
    const noTo = Number(b.noTo);
    if (!isInt(noFrom) || !isInt(noTo) || noFrom < 1 || noTo < 1) throw new QuizInputError('見出し番号の範囲を入れてください');
    return {
      source, bookId: b.bookId, noFrom: Math.min(noFrom, noTo), noTo: Math.max(noFrom, noTo),
      count, direction: b.direction, targetUids: validateTargets(b),
    };
  }
  if (source === 'eiken') {
    const eiken = String(b.eiken);
    if (!QUIZ_EIKEN_LEVELS.some((l) => l.id === eiken)) throw new QuizInputError('英検の級を選んでください');
    return { source, eiken, count, direction: b.direction, targetUids: validateTargets(b) };
  }
  const grade = Number(b.grade);
  const pageFrom = Number(b.pageFrom);
  const pageTo = Number(b.pageTo);
  if (![1, 2, 3].includes(grade)) throw new QuizInputError('学年を選んでください');
  if (!isInt(pageFrom) || !isInt(pageTo) || pageFrom < 1 || pageTo < 1) throw new QuizInputError('ページを選んでください');
  return {
    source,
    grade,
    pageFrom: Math.min(pageFrom, pageTo),
    pageTo: Math.max(pageFrom, pageTo),
    count,
    direction: b.direction,
    targetUids: validateTargets(b),
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

/** 出せる語か（id・語・意味がそろっている） */
const usable = (w) => Boolean(w && w.id && w.word && w.meaning);

/** 単語帳の見出し番号の範囲の語（はじめ〜おわりを含む・番号順）。出せる語だけ */
function wordsInBookRange(words, from, to) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return (words || [])
    .filter((w) => usable(w) && Number.isInteger(w.no) && w.no >= lo && w.no <= hi)
    .sort((a, b) => a.no - b.no);
}

/** 英検の級の語（いちばんやさしい級がその級のもの）。ファイルの順。出せる語だけ */
function wordsOfEiken(words, level) {
  return (words || []).filter((w) => usable(w) && easiestEiken(w) === String(level));
}

/** 見出し（`Sunshine 1年 p.30〜45` / `苦手な単語` / `英単語ターゲット1900 No.1〜100` / `英検3級`） */
const titleOf = ({ source, grade, pageFrom, pageTo, bookId, noFrom, noTo, eiken }) => {
  if (source === 'weak') return '苦手な単語';
  if (source === 'book') {
    const book = QUIZ_BOOKS.find((x) => x.id === bookId);
    return `${book ? book.title : bookId} ${noFrom === noTo ? `No.${noFrom}` : `No.${noFrom}〜${noTo}`}`;
  }
  if (source === 'eiken') {
    const level = QUIZ_EIKEN_LEVELS.find((l) => l.id === String(eiken));
    return `英検${level ? level.label : eiken}`;
  }
  return `Sunshine ${grade}年 ${pageFrom === pageTo ? `p.${pageFrom}` : `p.${pageFrom}〜${pageTo}`}`;
};

/**
 * 苦手な単語から出題する語。**苦手な順に上から** count 語（0 なら全部。上限 MAX_QUESTIONS）。
 * @param {Array<{id, word, meaning}>} weakWords weakWordsForQuiz の結果（苦手な順）
 */
function pickWeakWords(weakWords, count) {
  const usable = (weakWords || []).filter((w) => w && w.id && w.word && w.meaning);
  if (usable.length === 0) throw new QuizInputError('この生徒には苦手な単語がまだありません');
  const n = count > 0 ? count : MAX_QUESTIONS;
  return usable.slice(0, n).map(({ id, word, meaning }) => ({ id, word, meaning }));
}

const shuffle = (items, random) => {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * 出題する語を選ぶ。範囲から count 語（0 なら全部）を**混ぜて**選ぶ。全員同じ問題になる。
 * @returns {Array<{id, word, meaning, page}>} 写して持つ形
 */
function pickQuizWords(cards, input, random = Math.random) {
  const pool = wordsInPages(cards, input.grade, input.pageFrom, input.pageTo)
    .filter((c) => c && c.id && c.word && c.meaning);
  if (pool.length === 0) throw new QuizInputError('このページには出せる単語がありません');
  const shuffled = shuffle(pool, random);
  const picked = input.count > 0 ? shuffled.slice(0, input.count) : shuffled;
  return picked.map(({ id, word, meaning, page }) => ({ id, word, meaning, page }));
}

/**
 * 単語帳・英検から出題する語。範囲（級）の中から count 語を**混ぜて**選ぶ。
 * 0 は「全部」だが上限 MAX_QUESTIONS（英検の級は数百語あるので、上限が無いと解けない量になる）。
 * @param {Array} words その単語帳（英検なら words-master）の語
 * @returns {Array<{id, word, meaning, no?}>} 写して持つ形
 */
function pickSourceWords(words, input, random = Math.random) {
  const pool = input.source === 'book'
    ? wordsInBookRange(words, input.noFrom, input.noTo)
    : wordsOfEiken(words, input.eiken);
  if (pool.length === 0) {
    throw new QuizInputError(input.source === 'book' ? 'この番号の範囲には出せる単語がありません' : 'この級には出せる単語がありません');
  }
  const n = input.count > 0 ? input.count : MAX_QUESTIONS;
  return shuffle(pool, random).slice(0, n).map(({ id, word, meaning, no }) => (
    Number.isInteger(no) ? { id, word, meaning, no } : { id, word, meaning }));
}

/** 出題元の語が入っているファイル（book / eiken） */
const dataFileOf = (input) => (input.source === 'book'
  ? QUIZ_BOOKS.find((b) => b.id === input.bookId).file
  : 'words-master.json');

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
  DIRECTIONS, SOURCES, MAX_TARGETS, MAX_QUESTIONS, QUIZ_BOOKS, QUIZ_EIKEN_LEVELS, QuizInputError,
  validateCreate, wordsInPages, wordsInBookRange, wordsOfEiken, titleOf, pickQuizWords, pickSourceWords,
  pickWeakWords, dataFileOf, summarize,
};
