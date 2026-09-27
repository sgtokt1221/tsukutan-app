/**
 * 塾が配っている市販の単語帳。**「えらぶ」の教材別の正本。**
 *
 * 収録語は受験サポート（つくばホーム）の小テストと**同じもの**を使う。
 * 生徒は同じ本を開いているので、訳や並びが食い違うと混乱する。
 * 取り込みは `scripts/import-exam-support-decks.js` →
 * `scripts/build-book-words.js`（`public/data/words-book-<id>.json` を作る）。
 *
 * **表紙はつくばホームが配っているものをそのまま読む。** こちらへ写すと、
 * 絵を差し替えたときに片方だけ古くなる（ランクの紋章と同じ考え方）。
 *
 * ## id に `_` を使わない
 *
 * 自由学習の進捗は `users/{uid}/freeStudyProgress/{id}_{範囲}` という鍵で入る
 * （`src/logic/freeStudyProgress.js`）。`id` に `_` があると、画面側が
 * 組み立てる鍵と食い違って**いつまでも「未学習」に見える**。
 */

/** 表紙の置き場。**つくばホームが正本**（受験サポートも同じ絵を使っている） */
const COVER_BASE = 'https://tsukubamanager-4900b.web.app/covers';

/**
 * 出す順は**やさしい順**。生徒は上から順に進む。
 *
 * `count` は `public/data/words-book-*.json` の件数。表示にしか使わないので、
 * 読み込み前でも「◯◯語」を出せるようにここに置く（ずれたら
 * `node scripts/build-book-words.js` の出力と突き合わせる）。
 */
export const BOOKS = [
  {
    id: 'book-systan5',
    deckId: 'systan5',
    title: 'システム英単語',
    publisher: '駿台文庫',
    count: 2027,
    cover: `${COVER_BASE}/books_en_128.jpg`,
  },
  {
    id: 'book-target1900',
    deckId: 'target1900',
    title: '英単語ターゲット1900',
    publisher: '旺文社',
    count: 1900,
    cover: `${COVER_BASE}/books_en_10441.jpg`,
  },
  {
    id: 'book-leap',
    deckId: 'leap',
    title: '必携英単語LEAP',
    publisher: '数研出版',
    count: 1935,
    cover: `${COVER_BASE}/books_en_9199.jpg`,
  },
  {
    id: 'book-idiom-target1000',
    deckId: 'idiom-target1000',
    title: '英熟語ターゲット1000',
    publisher: '旺文社',
    count: 1000,
    cover: `${COVER_BASE}/books_en_4051.jpg`,
  },
  /*
    **英検のでる順パス単**（2026-09-27）。英検2級・準1級の単語はこの本の並びと訳で出す
    （「えらぶ → 英検 → 単語を覚える」の2級・準1級もこの本を開く。→ eikenOption）。
    収録語は data-sources/passtan-decks/（出典の誤記は直して印を残してある）
  */
  {
    id: 'book-passtan5',
    deckId: 'passtan5',
    title: '英検5級 でる順パス単［5訂版］',
    publisher: '旺文社',
    count: 570,
    cover: `${COVER_BASE}/books_en_passtan5_5.jpg`,
    eikenOption: 'eiken-5',
  },
  {
    id: 'book-passtan4',
    deckId: 'passtan4',
    title: '英検4級 でる順パス単［5訂版］',
    publisher: '旺文社',
    count: 700,
    cover: `${COVER_BASE}/books_en_passtan4_5.jpg`,
    eikenOption: 'eiken-4',
  },
  {
    id: 'book-passtan3',
    deckId: 'passtan3',
    title: '英検3級 でる順パス単［5訂版］',
    publisher: '旺文社',
    count: 1200,
    cover: `${COVER_BASE}/books_en_passtan3_5.jpg`,
    eikenOption: 'eiken-3',
  },
  {
    id: 'book-passtan2',
    deckId: 'passtan2',
    title: '英検2級 でる順パス単［5訂版］',
    publisher: '旺文社',
    count: 1700,
    cover: `${COVER_BASE}/books_en_passtan2_5.jpg`,
    eikenOption: 'eiken-2',
  },
  {
    id: 'book-passtanp1',
    deckId: 'passtanp1',
    title: '英検準1級 でる順パス単［5訂版］',
    publisher: '旺文社',
    count: 1900,
    cover: `${COVER_BASE}/books_en_passtanp1_5.jpg`,
    eikenOption: 'eiken-pre1',
  },
];

/** 英検の級に当てた本（無ければ null。その級は今までどおり英検の印で集めた語を出す） */
export const bookForEiken = (optionId) => BOOKS.find((b) => b.eikenOption === optionId) || null;

/** 教材IDかどうか。**綴りで判定する場所を1つにする** */
export const isBookId = (id) => typeof id === 'string' && id.startsWith('book-');

/** 教材を引く。無ければ null */
export const getBook = (id) => BOOKS.find((b) => b.id === id) || null;

/** 単語ファイルの場所。**選んだときだけ読む**（起動には乗せない） */
export const bookWordsUrl = (book) => `/data/words-book-${book.deckId}.json`;
