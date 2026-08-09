/**
 * scripts/lib/reviewWordMapping.js
 *
 * 既存の reviewWords 文書を、永続IDつきマスターへ対応づける純粋ロジック。
 * Firebase に依存しないのでそのままテストできる。
 * IMPLEMENTATION_PLAN.md 9.5。
 */

const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const contentKey = (entry) =>
  [normalize(entry.word), normalize(entry.partOfSpeech), normalize(entry.meaning)].join('|');

const fullKey = (entry) => `${contentKey(entry)}|${entry.level}`;

/** マスターから索引を作る */
const buildIndex = (masterEntries) => {
  const byFullKey = new Map();
  const byContentKey = new Map();
  const bySurface = new Map();

  for (const entry of masterEntries) {
    byFullKey.set(fullKey(entry), entry);

    const content = contentKey(entry);
    if (!byContentKey.has(content)) byContentKey.set(content, []);
    byContentKey.get(content).push(entry);

    const surface = normalize(entry.word);
    if (!bySurface.has(surface)) bySurface.set(surface, []);
    bySurface.get(surface).push(entry);
  }

  return { byFullKey, byContentKey, bySurface };
};

/**
 * 1件の復習文書を新IDへ対応づける。
 *
 * 段階的に緩める。
 *   1. 語+品詞+意味+レベル が一致（最も確か）
 *   2. 語+品詞+意味 が一致（レベルが再分類されている場合）
 *   3. 語だけ一致 → 候補が1件ならそれ、複数なら曖昧として保留
 *
 * @returns {{status:'matched'|'ambiguous'|'unmatched', id?:string, via?:string, candidates?:string[]}}
 */
const mapReviewWord = (reviewDoc, index) => {
  if (!reviewDoc || !normalize(reviewDoc.word)) {
    return { status: 'unmatched', reason: '語が空です' };
  }

  const exact = index.byFullKey.get(fullKey(reviewDoc));
  if (exact) return { status: 'matched', id: exact.id, via: 'word+pos+meaning+level' };

  const sameContent = index.byContentKey.get(contentKey(reviewDoc)) || [];
  if (sameContent.length === 1) {
    return { status: 'matched', id: sameContent[0].id, via: 'word+pos+meaning' };
  }
  if (sameContent.length > 1) {
    return { status: 'ambiguous', candidates: sameContent.map((e) => e.id), via: 'word+pos+meaning' };
  }

  const sameSurface = index.bySurface.get(normalize(reviewDoc.word)) || [];
  if (sameSurface.length === 1) {
    return { status: 'matched', id: sameSurface[0].id, via: 'word' };
  }
  if (sameSurface.length > 1) {
    return { status: 'ambiguous', candidates: sameSurface.map((e) => e.id), via: 'word' };
  }

  return { status: 'unmatched', reason: 'マスターに該当なし' };
};

const toMillis = (value) => {
  if (value == null) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

/**
 * 同じ新IDへ複数の旧文書が集まったときの統合規則（計画書9.5）。
 *   lastReviewed  : 最も新しい
 *   nextReviewDate: 最も早い
 *   repetitions   : 最大
 *   easeFactor    : 最も新しい履歴の値
 *   interval      : 最も新しい履歴の値
 */
const mergeReviewDocs = (docs) => {
  if (docs.length === 0) return null;

  const withTimes = docs.map((entry) => ({ entry, lastReviewed: toMillis(entry.lastReviewed) }));
  const newest = withTimes.reduce((best, candidate) => {
    if (best.lastReviewed == null) return candidate;
    if (candidate.lastReviewed == null) return best;
    return candidate.lastReviewed > best.lastReviewed ? candidate : best;
  });

  const lastReviewed = withTimes
    .map((item) => item.lastReviewed)
    .filter((value) => value != null)
    .reduce((max, value) => (max == null || value > max ? value : max), null);

  const nextReviewDate = docs
    .map((entry) => toMillis(entry.nextReviewDate))
    .filter((value) => value != null)
    .reduce((min, value) => (min == null || value < min ? value : min), null);

  const repetitions = docs
    .map((entry) => (typeof entry.repetitions === 'number' ? entry.repetitions : 0))
    .reduce((max, value) => Math.max(max, value), 0);

  return {
    lastReviewed,
    nextReviewDate,
    repetitions,
    easeFactor: newest.entry.easeFactor ?? 2.5,
    interval: newest.entry.interval ?? 1,
    migratedFrom: docs.map((entry) => entry.__oldId).filter(Boolean),
  };
};

module.exports = {
  contentKey,
  fullKey,
  buildIndex,
  mapReviewWord,
  mergeReviewDocs,
};
