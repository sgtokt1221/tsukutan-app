/**
 * 教材ごとの定着度（きろく。2026-09-27）。
 *
 * **数えるのはサーバ**（関数 myTextbookMastery → functions/lib/textbookMastery.js）。先生の画面
 * （つくばホームの生徒詳細）と同じ関数なので、生徒と先生で数字が食い違わない。
 * 単語帳は塾の生徒だけの置き場にあり、10冊を端末へ運ぶと重いので、ここでは数えない。
 */
import { getFunctions, httpsCallable } from 'firebase/functions';
import { RETENTION_BUCKETS } from './retentionBreakdown';
import { BOOKS } from '../config/books';
import { SUNSHINE } from './textbookPages';

/**
 * 教材の表紙（2026-09-27）。id はサーバの MASTERY_TEXTBOOKS（book-… / eiken-… / sunshine-N）。
 * 英検の級はでる順パス単の表紙。無いもの（中学英語・高校英語・Sunshine 3年）は null
 */
export function coverOf(id) {
  const book = BOOKS.find((b) => b.id === id || b.eikenOption === id);
  if (book) return book.cover;
  const m = /^sunshine-(\d)$/.exec(String(id || ''));
  return m ? (SUNSHINE.covers[Number(m[1]) - 1] || null) : null;
}

/** 自分の教材ごとの定着度。読めなければ投げる（呼び出し側で「読めませんでした」を出す） */
export async function loadMyTextbookMastery() {
  const call = httpsCallable(getFunctions(), 'myTextbookMastery');
  const { data } = await call({});
  return Array.isArray(data && data.mastery) ? data.mastery : [];
}

const learnedOf = (entry) => ['learning', 'settling', 'retained', 'graduated']
  .reduce((sum, id) => sum + (Number(entry.counts && entry.counts[id]) || 0), 0);

/**
 * 選ぶ欄の並び。**学んだ語が多い教材から**。まだ1語も学んでいない教材は後ろ（元の並びのまま）。
 * 語が0の教材（読めなかった・対象の語が無い）は出さない。
 */
export function orderForPicker(mastery) {
  const list = (mastery || []).filter((m) => m && m.total > 0).map((m, i) => ({ m, i, learned: learnedOf(m) }));
  return list
    .sort((a, b) => (b.learned - a.learned) || (a.i - b.i))
    .map(({ m, learned }) => ({ ...m, learned }));
}

/**
 * 1冊の内訳を、きろくの帯（RetentionBar）の形にする。分母はその教材の語数。
 * 並びは「定着の内訳」と同じ（卒業 → 定着 → なじんできた → 覚えかけ → テストで分かっている → まだ）。
 */
export function textbookBreakdown(entry) {
  if (!entry || !(entry.total > 0)) return null;
  const byId = Object.fromEntries(RETENTION_BUCKETS.map((b) => [b.id, b]));
  const counts = entry.counts || {};
  const buckets = [
    ...['graduated', 'retained', 'settling', 'learning'].map((id) => ({ ...byId[id], count: Number(counts[id]) || 0 })),
    { id: 'known', label: 'テストで分かっている', description: '単語力チェックテストから見て、もう知っていそうな語（推定）', color: '#bae6fd', count: Number(counts.known) || 0 },
    { id: 'notYet', label: 'まだ', description: 'この教材で、これから覚える語', color: '#e5e7eb', count: Number(counts.unlearned) || 0 },
  ].map((b) => ({ ...b, percent: (b.count / entry.total) * 100 }));
  const learned = learnedOf(entry);
  return {
    total: entry.total,
    buckets,
    caption: `${entry.title} ${entry.total.toLocaleString()} 語のうち（学んだ語 ${learned.toLocaleString()} 語）`,
  };
}
