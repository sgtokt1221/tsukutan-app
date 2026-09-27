/**
 * 市販の単語帳の語を読む（2026-09-27）。**読み口はここだけ。**
 *
 * 単語帳の収録語と並び（本の番号）は本の中身なので、公開ファイル（/data/）とリポジトリから外し、
 * Firestore の `licensedWordBooks/{deckId}/chunks/*`（塾の生徒だけが読める。firestore.rules の isEnrolled）に置いた。
 * 1文書1MBの上限があるので、400語ずつのチャンクに分けてある（scripts/upload-licensed-words.js）。
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// 冊ごとに Promise を覚える（同時に何度呼ばれても読むのは1回）。失敗は覚えない（電波が戻れば読める）
const cache = new Map();

export function loadBookWordsByDeck(deckId) {
  if (cache.has(deckId)) return cache.get(deckId);
  const promise = (async () => {
    const head = await getDoc(doc(db, 'licensedWordBooks', deckId));
    if (!head.exists()) throw new Error(`単語帳が見つかりません（${deckId}）`);
    const snap = await getDocs(collection(db, 'licensedWordBooks', deckId, 'chunks'));
    const words = snap.docs
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .flatMap((d) => d.data().words || []);
    // **欠けたまま使わない**（途中のチャンクが読めていないと、番号の帯がずれて別の語が出る）
    if (words.length !== Number(head.data().count)) {
      throw new Error(`単語帳の読み込みが途中で止まりました（${deckId}）`);
    }
    return words;
  })().catch((error) => {
    cache.delete(deckId);
    throw error;
  });
  cache.set(deckId, promise);
  return promise;
}

/** `config/books.js` の本を渡して読む */
export const loadBookWords = (book) => loadBookWordsByDeck(book.deckId);

/** テスト用 */
export const clearBookWordsCache = () => cache.clear();
