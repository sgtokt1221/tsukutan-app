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
 */
import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { BOOKS, bookWordsUrl } from '../config/books';
import { addWordToReview } from './reviewLogic';

const MISSED_URL = process.env.REACT_APP_MISSED_WORDS_URL
  || 'https://asia-northeast1-tsukubamanager-4900b.cloudfunctions.net/tsukutanMissedWords';

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
 * @returns {Promise<Array>} 復習に入れたカード（知らせと「今すぐ復習する」に使う）
 */
export async function syncExamSupportMissed(uid) {
  const user = auth.currentUser;
  if (!uid || !user) return [];
  const userRef = doc(db, 'users', uid);
  const since = String((await getDoc(userRef)).data()?.examSupportMissedSince || '');
  const { missed = [], latest = null } = await callMissed({ idToken: await user.getIdToken(), since });

  const deckIds = [...new Set(missed.map((m) => m.deckId))];
  const cardsByDeck = {};
  await Promise.all(deckIds.map(async (deckId) => {
    const book = BOOKS.find((b) => b.deckId === deckId);
    if (!book) return;
    const response = await fetch(bookWordsUrl(book));
    if (!response.ok) throw new Error(`単語帳を読めませんでした (${deckId})`);
    cardsByDeck[deckId] = await response.json();
  }));
  const cards = cardsForMissed(missed, cardsByDeck);

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
  return cards;
}
