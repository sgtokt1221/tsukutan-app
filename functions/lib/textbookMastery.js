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
const BUCKETS = ['unlearned', 'known', 'learning', 'settling', 'retained', 'graduated'];

/**
 * **まだ学んでいない語のうち、単語力チェックテストから「もう知っていそう」な語**（2026-09-27）。
 * 生徒の画面（定着の内訳の「テストで分かっている（推定）」）と揃える。確率の式は
 * src/logic/abilityEstimate.js の knowProbability と同じ（傾き 1.0）。**変えるときは両方を直す**。
 * 数は「知っている確率」を足したもの（語ごとに知っている／いないを決めない）。
 */
const SLOPE = 1.0;
const knowProbability = (level, theta) => 1 / (1 + Math.exp(SLOPE * (level - theta)));

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
function masteryByTextbook(reviewDocs, textbooks, { ability = null, levelBySpelling = new Map() } = {}) {
  const canEstimate = Number.isFinite(ability);
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
    let known = 0;
    for (const w of words || []) {
      if (!w || !w.id || seen.has(w.id)) continue;
      seen.add(w.id);
      const data = byId.get(w.id) || byKey.get(contentKey(w));
      if (data) {
        counts[bucketOf(data)] += 1;
        continue;
      }
      counts.unlearned += 1;
      // 単語帳だけの語は level を持たないので、同じ綴りの単語データの level で見積もる
      const level = Number.isFinite(w.level) ? w.level : levelBySpelling.get(String(w.word || '').trim().toLowerCase());
      if (canEstimate && Number.isFinite(level)) known += knowProbability(level, ability);
    }
    counts.known = Math.min(counts.unlearned, Math.round(known));
    counts.unlearned -= counts.known;
    return { id, title, total: seen.size, counts, estimated: canEstimate };
  });
}

/**
 * 英検の級で束ねるときの所属。**いちばんやさしい級1つだけ**に入れる（scripts/lib/relevel.js の easiestEiken と同じ）。
 * 複数の級に載る語を全部に数えると、同じ語が級をまたいで二重に数えられる。
 */
const EIKEN_ORDER = ['5', '4', '3', 'pre2', '2', 'pre1', '1'];
function easiestEiken(word) {
  const ranks = ((word && word.eikenLevels) || []).map((x) => EIKEN_ORDER.indexOf(String(x))).filter((i) => i >= 0);
  return ranks.length ? EIKEN_ORDER[Math.min(...ranks)] : null;
}

module.exports = { BUCKETS, EIKEN_ORDER, knowProbability, LEARNING_DAYS, RETAINED_DAYS, bucketOf, contentKey, easiestEiken, masteryByTextbook };
