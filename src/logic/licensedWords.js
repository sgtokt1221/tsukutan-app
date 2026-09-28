/**
 * 市販の単語帳の語を読む（2026-09-27）。**読み口はここだけ。**
 *
 * 単語帳の収録語と並び（本の番号）は本の中身なので、公開ファイル（/data/）とリポジトリから外し、
 * Firestore の `licensedWordBooks/{deckId}/chunks/*`（塾の生徒だけが読める。firestore.rules の isEnrolled）に置いた。
 * 1文書1MBの上限があるので、400語ずつのチャンクに分けてある（scripts/upload-licensed-words.js）。
 *
 * **SDK（getDoc/getDocs）ではなく REST で読む**（2026-09-27）。つくばホームの受験サポートで、大きな文書を
 * SDK でまとめて読むと常時接続（Listen）が 503 を返し続けて止まり、同じ画面の他の読み込みまで道連れになった
 * （REST なら同じ文書が0.1秒）。語は JSON の文字列1つ（json）で持つ——配列・マップのままだと SDK がほどくのに
 * 1冊で数十秒かかった。
 */
import { auth } from '../firebaseConfig';

const PROJECT_ID = process.env.REACT_APP_FIREBASE_PROJECT_ID || 'tsukutan-58b3f';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/licensedWordBooks`;

/** チャンクの語。JSON の文字列（json）でも、古い形（words の配列）でも読む */
export const wordsOfChunk = (data) => (typeof data?.json === 'string' ? JSON.parse(data.json) : (data?.words || []));

async function getJson(url, token, fetchImpl) {
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`単語帳を読めませんでした（${res.status}）`);
  return res.json();
}

// 冊ごとに Promise を覚える（同時に何度呼ばれても読むのは1回）。失敗は覚えない（電波が戻れば読める）
const cache = new Map();

export function loadBookWordsByDeck(deckId, { fetchImpl = fetch, user = auth.currentUser } = {}) {
  if (cache.has(deckId)) return cache.get(deckId);
  const promise = (async () => {
    if (!user) throw new Error('ログインしていないので単語帳を読めません');
    const token = await user.getIdToken();
    const id = encodeURIComponent(deckId);
    const [head, list] = await Promise.all([
      getJson(`${BASE}/${id}`, token, fetchImpl),
      getJson(`${BASE}/${id}/chunks?pageSize=100`, token, fetchImpl),
    ]);
    if (!head) throw new Error(`単語帳が見つかりません（${deckId}）`);
    const count = Number(head.fields?.count?.integerValue);
    const words = (list?.documents || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((d) => wordsOfChunk({ json: d.fields?.json?.stringValue }));
    // **欠けたまま使わない**（途中のチャンクが読めていないと、番号の帯がずれて別の語が出る）
    if (words.length !== count) {
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
