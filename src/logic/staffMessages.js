/**
 * 先生から生徒のホームへのメッセージ（2026-09-27。つくばホームの一斉テストの結果から送る）。
 *
 * - 送ったもの: `staff_messages/{id}`（つくつくの関数 staffQuizAssignments が書く。読めるのは対象の生徒だけ）
 * - 読んだ印: `users/{uid}/messageReads/{id}`（本人が書く）。**印があれば出さない**
 *
 * **楽観的更新をしない。** 「読んだ」を押したら書いて、読み直してカードを消す。
 */
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/** まだ読んでいないメッセージ（新しい順）。読めなければ投げる（呼び出し側で黙って隠す） */
export async function loadUnreadMessages(uid) {
  if (!uid) return [];
  const snap = await getDocs(query(
    collection(db, 'staff_messages'),
    where('targetUids', 'array-contains', uid),
    where('active', '==', true),
    orderBy('createdAt', 'desc'),
    limit(10),
  ));
  // 明示の id は展開のあとに置く（中身に同名の欄があっても文書IDが勝つ）
  const all = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  const read = await Promise.all(all.map((m) => getDoc(doc(db, 'users', uid, 'messageReads', m.id)).then((r) => r.exists())));
  return all.filter((_, i) => !read[i]);
}

/** 読んだ印を付ける */
export async function markMessageRead(uid, id) {
  await setDoc(doc(db, 'users', uid, 'messageReads', id), { readAt: serverTimestamp() });
}
