/**
 * 受験サポートの小テストで間違えた語を、つくつくの毎日の復習に入れる（2026-09-24）。
 *
 * 役割を分けた：**受験サポート＝範囲を出してテストで確かめる／つくつく＝毎日覚える**。
 * テストで間違えた語は受験サポートの一覧に残るだけだったので、起動時に取りに行き、
 * 復習（`users/{uid}/reviewWords`）に入れる。
 *
 * - 取りに行く先はつくばホームの `tsukutanMissedWords`（東京）。呼び方は studySession.js の
 *   `callRecord` と同じ（callable の形・`Authorization` を付けない・入場券は中身に載せる）
 * - 語の番号 `no` は受験サポートとつくつくの単語帳で共通（words-book-*.json は向こうの単語帳から作る）
 * - **まだ無い語は復習に足す。もうある語は「間違えた」扱い**（間隔を1日に戻し、今日を復習日に。
 *   卒業していた語は卒業を外す）。受験サポートで間違えた＝まだ覚えていない、なので
 * - どこまで取り込んだかは `users/{uid}.examSupportMissedSince`。**全部書けてから進める**
 *   （途中で落ちても次に開いたとき取り直せる。二重に入っても害が無い書き方にしてある）
 * - 同じ呼び出しで、**先生が受験サポートで出したテスト範囲（まだ合格していないもの）**も受け取る
 *   （practice）。ホームの「受験サポートのテスト範囲」から、その範囲を単語帳のカードで練習する。
 *   テストを受けるのは受験サポート。つくつくは覚えるところ（2026-09-24 の分担）
 */
import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { BOOKS, bookWordsUrl } from '../config/books';
import { addWordToReview } from './reviewLogic';

const MISSED_URL = process.env.REACT_APP_MISSED_WORDS_URL
  || 'https://asia-northeast1-tsukubamanager-4900b.cloudfunctions.net/tsukutanMissedWords';

/** 単語帳のカードを読む（冊ごとに1回。読めなければ投げる） */
const deckCache = new Map();
export function loadDeckCards(deckId, fetchImpl = fetch) {
  if (deckCache.has(deckId)) return deckCache.get(deckId);
  const book = BOOKS.find((b) => b.deckId === deckId);
  if (!book) return Promise.resolve([]);
  const p = fetchImpl(bookWordsUrl(book)).then((response) => {
    if (!response.ok) throw new Error(`単語帳を読めませんでした (${deckId})`);
    return response.json();
  }).catch((error) => { deckCache.delete(deckId); throw error; });
  deckCache.set(deckId, p);
  return p;
}

/** 番号の一覧（`{deckId, no}`）をカードにする。要る冊だけ読む */
export async function cardsForRefs(refs) {
  const deckIds = [...new Set((refs || []).map((m) => m.deckId))];
  const cardsByDeck = {};
  await Promise.all(deckIds.map(async (deckId) => { cardsByDeck[deckId] = await loadDeckCards(deckId); }));
  return cardsForMissed(refs, cardsByDeck);
}

/** 受け取った `{deckId, no}` を単語帳のカードに直す。無い語は飛ばす（本を入れ替えたときに落ちない） */
export function cardsForMissed(missed, cardsByDeck) {
  const out = [];
  const seen = new Set();
  for (const m of missed || []) {
    const card = (cardsByDeck[m.deckId] || []).find((c) => Number(c.no) === Number(m.no));
    if (!card || !card.id || seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

/** 復習に足すときの形。**undefined を入れない**（Firestore が書き込みごと拒否する） */
export function reviewEntryOf(card) {
  const entry = { id: card.id, word: String(card.word || ''), meaning: String(card.meaning || ''), source: 'exam-support' };
  for (const key of ['partOfSpeech', 'example', 'exampleJa', 'pronunciation', 'theme']) {
    if (card[key] !== undefined && card[key] !== null && card[key] !== '') entry[key] = card[key];
  }
  return entry;
}

/** もうある語を「間違えた」扱いにする更新。卒業していたら外す */
export function lapseUpdateOf(existing, today) {
  const update = { repetitions: 0, interval: 1, nextReviewDate: today };
  if (existing && existing.status === 'mastered') update.status = deleteField();
  return update;
}

async function callMissed(payload) {
  const res = await fetch(MISSED_URL, {
    method: 'POST',
    // **`Authorization` を付けない**（付けると向こうの枠組みに 401 で弾かれる。studySession.js と同じ）
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error((body.error && body.error.message) || `間違えた語を読めませんでした (${res.status})`);
  return body.result || {};
}

/**
 * 取り込む。**失敗したら投げる**（呼び出し側はログだけにして画面を止めない）。
 * @returns {Promise<{ missed: Array, practice: Array }>} missed は復習に入れたカード（知らせと「今すぐ復習する」に使う）。
 *   practice は出されたテスト範囲 `{assignmentId, title, dueDate, words, range}`（カードには押したときに直す）
 */
export async function syncExamSupportMissed(uid) {
  const user = auth.currentUser;
  if (!uid || !user) return { missed: [], practice: [] };
  const userRef = doc(db, 'users', uid);
  const since = String((await getDoc(userRef)).data()?.examSupportMissedSince || '');
  const { missed = [], latest = null, practice = [] } = await callMissed({ idToken: await user.getIdToken(), since });
  const cards = await cardsForRefs(missed);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const card of cards) {
    const ref = doc(db, 'users', uid, 'reviewWords', card.id);
    // eslint-disable-next-line no-await-in-loop
    const snap = await getDoc(ref);
    // eslint-disable-next-line no-await-in-loop
    if (snap.exists()) await updateDoc(ref, lapseUpdateOf(snap.data(), today));
    // eslint-disable-next-line no-await-in-loop
    else await addWordToReview(uid, reviewEntryOf(card));
  }
  // 全部書けてから進める
  if (latest && latest > since) await updateDoc(userRef, { examSupportMissedSince: latest });
  return { missed: cards, practice: Array.isArray(practice) ? practice : [] };
}
