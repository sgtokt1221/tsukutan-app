import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig.js';

/**
 * ブックマーク（毎日みたい単語）。
 *
 * users/{uid}/bookmarks/{bookmarkId}
 *
 * 単語の出どころで id の体系が違う（日次学習は Firestore の教材ドキュメントID、
 * 復習は永続ID、自由学習はマスターのID）ため、綴りと意味から決める独自の
 * キーを使う。どの画面から登録しても同じ単語なら同じ1件になる。
 *
 * 単語の中身もそのまま持つ。一覧を出すときにマスターや Firestore を
 * 引き直さずに済み、教材データが差し替わっても登録した内容が消えない。
 */

/** 綴りと意味からキーを作るための正規化。表記ゆれで別物にしない。 */
const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/**
 * FNV-1a (64bit) を 32bit 2本で計算して16桁の16進にする。
 *
 * 内容から決まる安定したIDが欲しいだけなので暗号学的強度は要らない。
 * SubtleCrypto は非同期で、押した瞬間に id が要る場面に向かない。
 * Firestore のドキュメントIDに使える文字だけになるのも都合がよい。
 */
const fnv1a = (text) => {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
};

/** 単語1件のブックマークID。同じ綴り・同じ意味なら必ず同じになる。 */
export const bookmarkId = (word) => {
  if (!word || !word.word) return null;
  return `bm_${fnv1a(`${normalize(word.word)}|${normalize(word.meaning)}`)}`;
};

/** 保存する中身。undefined を混ぜると Firestore が書き込み全体を拒否する。 */
const toPayload = (word) => {
  const payload = {
    word: word.word,
    meaning: word.meaning || word.japanese || '',
    createdAt: new Date(),
  };
  for (const field of ['partOfSpeech', 'example', 'exampleJa', 'pronunciation']) {
    if (word[field]) payload[field] = word[field];
  }
  if (Number.isFinite(word.level)) payload.level = word.level;
  return payload;
};

export const addBookmark = async (userId, word) => {
  const id = bookmarkId(word);
  if (!userId || !id) return null;
  await setDoc(doc(db, 'users', userId, 'bookmarks', id), toPayload(word));
  return id;
};

export const removeBookmark = async (userId, id) => {
  if (!userId || !id) return;
  await deleteDoc(doc(db, 'users', userId, 'bookmarks', id));
};

/** 登録順（新しいものが先）で返す。 */
export const fetchBookmarks = async (userId) => {
  if (!userId) return [];
  const snapshot = await getDocs(collection(db, 'users', userId, 'bookmarks'));
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    });
};
