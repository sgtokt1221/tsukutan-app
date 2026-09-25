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
 * ## 教材ごとの「間違えた単語だけ」（2026-09-26。`weakOnly: true`）
 * 単語帳・英検・教科書で、選んだ範囲（番号・級・ページ）の中から**その生徒の苦手な単語だけ**を出す。
 * - 「苦手」の決め方は `staffMaterials.js` の weakWordsForQuiz そのもの（二重に決めない）
 * - 教材の語との結びつけは weakWordsInSource：id → 語＋品詞＋意味（textbookMastery.js の contentKey）、
 *   **単語帳だけ綴りでも**（つくつくの src/logic/newWordSources.js の matchBySpelling と同じ理由。
 *   本だけの語は id も訳も本のもので、マスタで覚えた記録と id でも意味でも合わない）
 * - 並びは**苦手な順**で、上から count 語（0 は上限 MAX_QUESTIONS まで）。混ぜないので、画面・紙・アプリで同じ語になる
 * - 生徒ごとに語が違うので、**対象は1人だけ**（苦手な単語と同じ扱い）
 * - 出す語は**教材の語**（その本・その級の訳）を写す
 *
 * ## 語はサーバが選ぶ
 * 画面から語を受け取らない（書き換えられても、教科書に無い語や別の意味が出ないように）。
 * 教科書の語は `public/data/words-textbook-sunshine.json`（`scripts/build-textbook-words.js`）。
 * ページの切り出しは画面側の `src/logic/textbookPages.js` の `wordsInPages` と**同じ規則**
 * （はじめ〜おわりを含む・ページ→表の順）。片方だけ変えると、画面で見せた語と出る語が食い違う。
 * **出した時点の語を写して持つ**（あとで単語データを作り直しても、出した小テストは変わらない）。
 */

const { easiestEiken, contentKey } = require('./textbookMastery');

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

/** 1人だけの指定か（苦手な単語・間違えた単語だけは生徒ごとに語が違う） */
function validateSingleTarget(b, message) {
  const uids = Array.isArray(b.targetUids) ? b.targetUids : [];
  if (uids.length !== 1 || typeof uids[0] !== 'string' || uids[0] === '' || uids[0].includes('/')) {
    throw new QuizInputError(message);
  }
  return [uids[0]];
}

function validateCreate(body) {
  const input = validateCreateBase(body);
  // 教材ごとの「間違えた単語だけ」。**true のときだけ持つ**（undefined を書くと Firestore が文書ごと拒む）
  if (body && body.weakOnly === true && input.source !== 'weak') {
    return {
      ...input,
      weakOnly: true,
      targetUids: validateSingleTarget(body, '間違えた単語だけの小テストは、1人ずつ出します'),
    };
  }
  return input;
}

function validateCreateBase(body) {
  const b = body || {};
  // 出題元を書いていないものは教科書（2026-09-24 までの画面は source を送らなかった）
  const source = b.source === undefined ? 'textbook' : b.source;
  if (!SOURCES.includes(source)) throw new QuizInputError('出題元を選んでください');
  const count = Number(b.count);
  if (!isInt(count) || count < 0 || count > MAX_QUESTIONS) throw new QuizInputError(`問題数は${MAX_QUESTIONS}問までです`);
  if (!DIRECTIONS.includes(b.direction)) throw new QuizInputError('出題の向きを選んでください');
  if (source === 'weak') {
    return { source, count, direction: b.direction, targetUids: validateSingleTarget(b, '苦手な単語の小テストは、1人ずつ出します') };
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

/** 間違えた単語だけのときの見出しの後ろ（`英検3級（間違えた単語）`） */
const WEAK_ONLY_SUFFIX = '（間違えた単語）';

/**
 * 見出し（`Sunshine 1年 p.30〜45` / `苦手な単語` / `英単語ターゲット1900 No.1〜100` / `英検3級`）。
 * 間違えた単語だけなら後ろに WEAK_ONLY_SUFFIX
 */
const titleOf = (input) => `${baseTitleOf(input)}${input.weakOnly && input.source !== 'weak' ? WEAK_ONLY_SUFFIX : ''}`;
const baseTitleOf = ({ source, grade, pageFrom, pageTo, bookId, noFrom, noTo, eiken }) => {
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

/** 教材の語（page / no があれば持つ）を、写して持つ形にする */
const copyOf = ({ id, word, meaning, page, no }) => ({
  id, word, meaning,
  ...(Number.isInteger(page) ? { page } : {}),
  ...(Number.isInteger(no) ? { no } : {}),
});

/** 綴り（前後の空白を除き小文字。つくつくの newWordSources.js の spellingOf と同じ） */
const spellingOf = (w) => String((w && w.word) || '').trim().toLowerCase();

/**
 * 教材の語のうち、その生徒の苦手な単語に当たるもの。**苦手な順**（weakWords の順）。
 * 1語の教材は1回だけ（苦手の記録が2件当たっても）。lastWrong は当たった苦手の記録のもの。
 * @param {Array} pool 範囲・級で切り出した教材の語
 * @param {Array<{id, word, partOfSpeech?, meaning, lastWrong?}>} weakWords weakWordsForQuiz の結果
 * @param {{ bySpelling?: boolean }} options 単語帳だけ true（綴りでも結びつける）
 */
function weakWordsInSource(pool, weakWords, { bySpelling = false } = {}) {
  const byId = new Map();
  const byKey = new Map();
  const bySpell = new Map();
  for (const w of pool || []) {
    if (!usable(w)) continue;
    if (!byId.has(w.id)) byId.set(w.id, w);
    const key = contentKey(w);
    if (!byKey.has(key)) byKey.set(key, w);
    const spell = spellingOf(w);
    if (bySpelling && spell && !bySpell.has(spell)) bySpell.set(spell, w);
  }
  const seen = new Set();
  const out = [];
  for (const weak of weakWords || []) {
    if (!weak) continue;
    const hit = byId.get(weak.id) || byKey.get(contentKey(weak)) || (bySpelling ? bySpell.get(spellingOf(weak)) : undefined);
    if (!hit || seen.has(hit.id)) continue;
    seen.add(hit.id);
    out.push({ ...hit, lastWrong: Boolean(weak.lastWrong) });
  }
  return out;
}

/** 教材の出題元の範囲の語（book=番号 / eiken=級 / textbook=ページ）。出せる語だけ */
function sourcePool(words, input) {
  if (input.source === 'book') return wordsInBookRange(words, input.noFrom, input.noTo);
  if (input.source === 'eiken') return wordsOfEiken(words, input.eiken);
  return wordsInPages(words, input.grade, input.pageFrom, input.pageTo).filter(usable);
}

/**
 * 教材の範囲から、その生徒の**間違えた単語だけ**を出題する語（weakOnly）。苦手な順に上から count 語
 * （0 は上限 MAX_QUESTIONS）。**混ぜない**ので、画面の一覧・紙・アプリで同じ語になる。
 * @param {Array} words 教材の語（単語帳のファイル・words-master・教科書）
 * @param {Array} weakWords weakWordsForQuiz の結果
 */
function pickWeakInSource(words, weakWords, input) {
  const matched = weakWordsInSource(sourcePool(words, input), weakWords, { bySpelling: input.source === 'book' });
  if (matched.length === 0) throw new QuizInputError('この範囲には、この生徒が間違えた単語がありません');
  const n = input.count > 0 ? input.count : MAX_QUESTIONS;
  return matched.slice(0, n).map(copyOf);
}

/** 出題元の語が入っているファイル（book / eiken / textbook） */
const dataFileOf = (input) => {
  if (input.source === 'book') return QUIZ_BOOKS.find((b) => b.id === input.bookId).file;
  if (input.source === 'textbook') return 'words-textbook-sunshine.json';
  return 'words-master.json';
};

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
  WEAK_ONLY_SUFFIX, validateCreate, wordsInPages, wordsInBookRange, wordsOfEiken, titleOf, pickQuizWords, pickSourceWords,
  pickWeakWords, weakWordsInSource, sourcePool, pickWeakInSource, dataFileOf, summarize,
};
