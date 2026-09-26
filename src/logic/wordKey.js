/**
 * 同じ語かを見る鍵（語＋品詞＋意味）。
 *
 * 生徒の reviewWords には、2026-09-24 まで日々の新しい単語を選んでいた Firestore の
 * textbooks のランダムな文書IDで入っている語がある。単語データ（public/data）の id とは
 * 合わないので、id で引けないときはこの鍵で照らす。品詞は「熟」→「熟語」をそろえる
 * （scripts/normalizePartOfSpeech.js と同じ）。
 */
const normalizePos = (value) =>
  String(value || '')
    .split(/\s*[,、]\s*/)
    .map((part) => part.trim())
    .map((part) => (part === '熟' ? '熟語' : part))
    .join(', ');

export const wordContentKey = (word) =>
  [word?.word, normalizePos(word?.partOfSpeech), word?.meaning]
    .map((value) => String(value || '').trim().toLowerCase())
    .join('|');
