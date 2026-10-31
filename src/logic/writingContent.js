/**
 * 英検ライティングの素材を読む（2026-09-26）。
 *
 * public/eiken-writing/
 *   index.json          級 → カンペ（cards）。準1級は当面2級と同じカードを指す
 *   cards/{級}.json     カンペ（塾の「ライティング道場」PDFの重要表現・構文）
 *   prompts/{級}.json   塾オリジナルの問題（意見論述と、Eメールまたは要約）
 *
 * 級の一覧は面接と同じもの（INTERVIEW_GRADES）を使う。
 */
export { INTERVIEW_GRADES as WRITING_GRADES } from './interviewContent';

const BASE_PATH = '/eiken-writing';
const cache = new Map();

const fetchJson = (path) => {
  if (cache.has(path)) return cache.get(path);
  const promise = fetch(path)
    .then((response) => {
      if (!response.ok) throw new Error(`${path} を取得できませんでした (HTTP ${response.status})`);
      return response.json();
    })
    .catch((error) => {
      // 失敗をキャッシュに残すと、電波が戻っても二度と読めなくなる
      cache.delete(path);
      throw error;
    });
  cache.set(path, promise);
  return promise;
};

export const loadWritingPrompts = (grade) => fetchJson(`${BASE_PATH}/prompts/${grade}.json`);

/** その級のカンペ。index.json で行き先を引く（準1級 → 2級） */
export const loadWritingCard = async (grade) => {
  const index = await fetchJson(`${BASE_PATH}/index.json`);
  const cardId = index?.cards?.[grade] || grade;
  return fetchJson(`${BASE_PATH}/cards/${cardId}.json`);
};

/** 級で出るタスクの並び（本番の順：Eメール／要約が先、意見論述があと） */
export const tasksOf = (prompts) => ['email', 'summary', 'opinion'].filter((task) => prompts?.tasks?.[task]);

/**
 * Eメールの本文を、下線の部分とそれ以外に分ける。[[...]] が下線
 * @returns {Array<{ text: string, underline: boolean }>}
 */
export const splitUnderline = (body) => String(body || '')
  .split(/(\[\[.+?\]\])/)
  .filter(Boolean)
  .map((part) => (part.startsWith('[[') && part.endsWith(']]')
    ? { text: part.slice(2, -2), underline: true }
    : { text: part, underline: false }));
