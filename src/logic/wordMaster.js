/**
 * src/logic/wordMaster.js
 *
 * 単語データを public/data から必要になった時点で読み込む。
 * IMPLEMENTATION_PLAN.md 9.4 / 13.5。
 *
 * 以前は src/wordsData.json を import していたため、1.6MB がそのまま
 * 初期 JavaScript バンドルへ入っていた。ここでは fetch で取りに行き、
 * セッション内は同じ Promise を使い回す。
 */

const BASE_PATH = '/data';

// URL ごとに Promise を覚えておく。同時に何度呼ばれても取得は1回。
const cache = new Map();
// 失敗も覚えておく。覚えないと、呼び出し箇所の数だけ同じ取得を繰り返してしまう。
const failures = new Map();

const fetchJson = (path, { force = false } = {}) => {
  if (force) {
    cache.delete(path);
    failures.delete(path);
  }

  // 一度失敗したら、明示的にやり直すまで即座に同じエラーを返す
  if (failures.has(path)) return Promise.reject(failures.get(path));
  if (cache.has(path)) return cache.get(path);

  const promise = fetch(path)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`単語データを読み込めませんでした (${path}: HTTP ${response.status})`);
      }

      // SPA の rewrite があると、ファイルが無くても index.html が 200 で返る。
      // response.ok だけ見ていると JSON.parse で意味の分からない例外になるので、
      // ここで気づけるようにしておく。
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        throw new Error(
          `${path} がJSONではありません（${contentType || '不明'}）。`
          + ' 配信設定を確認してください。開発サーバーを起動し直すと直ることがあります。'
        );
      }

      try {
        return await response.json();
      } catch (error) {
        throw new Error(`${path} を解釈できませんでした: ${error.message}`);
      }
    })
    .catch((error) => {
      // 呼び出し箇所ごとに取得し直さないよう、失敗を記録して即座に返せるようにする。
      // やり直すときは reload 系（force）を通す。
      cache.delete(path);
      failures.set(path, error);
      throw error;
    });

  cache.set(path, promise);
  return promise;
};

/** 全単語（6,736件）。force を付けると失敗の記録を捨ててもう一度取りに行く。 */
export const loadWordMaster = (options) => fetchJson(`${BASE_PATH}/words-master.json`, options);

/** 版・件数・SHA-256 */
export const loadManifest = (options) => fetchJson(`${BASE_PATH}/manifest.json`, options);

/**
 * 発音記号（IPA）の表。{ "about": "əˈbaʊt", ... }
 *
 * 日次学習の単語は Firestore の textbooks から来るため pronunciation を
 * 持たない。復習単語も保存時点の写しなので同じ。表示するときにここで引く。
 */
export const loadPronunciations = (options) => fetchJson(`${BASE_PATH}/pronunciations.json`, options);

const TEXTBOOK_FILES = {
  'osaka-koukou-nyuushi': 'words-osaka.json',
  'highschool-english': 'words-highschool.json',
};

/** 教材ごとの単語。未知の教材IDは空配列。 */
export const loadTextbookWords = (textbookId, options) => {
  const file = TEXTBOOK_FILES[textbookId];
  if (!file) return Promise.resolve([]);
  return fetchJson(`${BASE_PATH}/${file}`, options);
};

export const KNOWN_TEXTBOOK_IDS = Object.keys(TEXTBOOK_FILES);

/** キャッシュと失敗の記録を空にする。 */
export const clearWordCache = () => {
  cache.clear();
  failures.clear();
};
