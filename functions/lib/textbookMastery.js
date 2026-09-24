/**
 * 生徒の教材ごとの定着度（つくばホームの管理画面・生徒詳細の「定着度」）。**Firestore を触らない純関数だけ。**
 *
 * ## 定着の決め方は生徒の画面と同じ（src/logic/retentionBreakdown.js が正本）
 * 次に出るまでの間隔（SM-2 の interval）で分ける。6日以内＝覚えかけ／7〜20日＝なじんできた／
 * 21日以上＝定着／復習リストから外した（status: mastered）＝卒業。まだ一度も学んでいない語は「未学習」。
 * **境目（7日・21日）を変えるときは両方を直す**（片方だけだと、生徒と先生で数字が食い違う）。
 *
 * ## 教材の語と、生徒の記録の結びつけ
 * id で引き、引けなければ 語＋品詞＋意味 で引く。2026-09-24 まで日々の新しい単語を Firestore の
 * 教材（ランダムな文書ID）から出していたので、その id で入っている記録がある（→ つくつくの src/logic/wordKey.js）。
 */

const LEARNING_DAYS = 7;
const RETAINED_DAYS = 21;
const BUCKETS = ['unlearned', 'learning', 'settling', 'retained', 'graduated'];

const normalizePos = (value) =>
  String(value || '').split(/\s*[,、]\s*/).map((p) => p.trim()).map((p) => (p === '熟' ? '熟語' : p)).join(', ');
/** src/logic/wordKey.js の wordContentKey と同じ */
const contentKey = (w) =>
  [w && w.word, normalizePos(w && w.partOfSpeech), w && w.meaning].map((v) => String(v || '').trim().toLowerCase()).join('|');

/** 記録1件の段階 */
function bucketOf(data) {
  if (data.status === 'mastered') return 'graduated';
  const interval = Number(data.interval) || 0;
  if (interval < LEARNING_DAYS) return 'learning';
  if (interval < RETAINED_DAYS) return 'settling';
  return 'retained';
}

/**
 * @param {Array<{id: string, data: object}>} reviewDocs users/{uid}/reviewWords
 * @param {Array<{id: string, title: string, words: Array}>} textbooks 教材ごとの語
 * @returns {Array<{id, title, total, counts: Record<string, number>}>}
 */
function masteryByTextbook(reviewDocs, textbooks) {
  const byId = new Map();
  const byKey = new Map();
  for (const { id, data } of reviewDocs || []) {
    if (!data || data.migratedTo) continue;
    byId.set(id, data);
    if (String(data.word || '').trim()) {
      const key = contentKey(data);
      if (!byKey.has(key)) byKey.set(key, data);
    }
  }
  return (textbooks || []).map(({ id, title, words }) => {
    const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
    const seen = new Set();
    for (const w of words || []) {
      if (!w || !w.id || seen.has(w.id)) continue;
      seen.add(w.id);
      const data = byId.get(w.id) || byKey.get(contentKey(w));
      counts[data ? bucketOf(data) : 'unlearned'] += 1;
    }
    return { id, title, total: seen.size, counts };
  });
}

module.exports = { BUCKETS, LEARNING_DAYS, RETAINED_DAYS, bucketOf, contentKey, masteryByTextbook };
