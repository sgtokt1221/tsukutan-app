/**
 * 学校の教科書（開隆堂 Sunshine）を**学年とページ**で区切る。**純関数と読み込みだけ。**
 *
 * 単語は `public/data/words-textbook-sunshine.json`（`scripts/build-textbook-words.js` が作る）。
 * 各語は初出の `grade`（1〜3）・`page`・`order`（語彙一覧の表の順）を持つ。
 * 教科書を開いている生徒と同じ区切りにするため、**ページで選ぶ**（番号の帯やレベルでは切らない）。
 *
 * 管理画面の小テスト（つくばホーム `/tsukutsuku/`）と、つくつくの関数（`functions/lib/quizAssignments.js`）も
 * 同じファイルを読む。**切り出し方を3か所で変えない**——ページの範囲は「はじめ〜おわりを含む」。
 */

export const SUNSHINE = {
  id: 'sunshine',
  title: 'Sunshine（教科書）',
  publisher: '開隆堂',
  file: '/data/words-textbook-sunshine.json',
  grades: [1, 2, 3],
};

/** 自由学習で選んだ教材の id（`sunshine-1`）。**`_` を使わない**（進捗の鍵が割れる。books.js の注記） */
export const sunshineTextbookId = (grade) => `sunshine-${grade}`;
export const isSunshineTextbookId = (id) => /^sunshine-[123]$/.test(String(id || ''));
export const gradeOfSunshineId = (id) => (isSunshineTextbookId(id) ? Number(String(id).slice(-1)) : null);

/** その学年で語のあるページと語数（ページ順） */
export function pagesOf(cards, grade) {
  const counts = new Map();
  for (const card of cards || []) {
    if (card.grade !== grade) continue;
    counts.set(card.page, (counts.get(card.page) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([page, count]) => ({ page, count }));
}

/** その学年のページ範囲の語（はじめ〜おわりを含む）。ページ → 表の順に並べる */
export function wordsInPages(cards, grade, from, to) {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return (cards || [])
    .filter((c) => c.grade === grade && c.page >= lo && c.page <= hi)
    .sort((a, b) => a.page - b.page || a.order - b.order);
}

/** 見出し（`p.30〜45`）。1ページだけなら `p.30` */
export const pageLabel = (from, to) => (from === to ? `p.${from}` : `p.${Math.min(from, to)}〜${Math.max(from, to)}`);

/** 進捗の鍵の範囲の部分。**`_` `/` `〜` を入れない**（bookWords.js の rangeKeyOf と同じ規則） */
export const pageRangeKey = (from, to) => `p${Math.min(from, to)}-${Math.max(from, to)}`;

let loading = null;
/** 教科書の語を読む。**セッション中は1回だけ**。失敗したら次に呼んだとき読み直す */
export function loadSunshineCards(fetchImpl = fetch) {
  if (loading) return loading;
  loading = fetchImpl(SUNSHINE.file)
    .then(async (response) => {
      const type = response.headers?.get?.('content-type') || '';
      // SPA の書き換えで index.html が 200 で返ることがある（wordMaster.js と同じ用心）
      if (!response.ok || !type.includes('json')) throw new Error(`教科書の単語を読めませんでした (${response.status})`);
      return response.json();
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}
