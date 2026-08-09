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

const fetchJson = (path) => {
  if (cache.has(path)) return cache.get(path);

  const promise = fetch(path)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`単語データを読み込めませんでした (${path}: HTTP ${response.status})`);
      }
      return response.json();
    })
    .catch((error) => {
      // 失敗した Promise を残すと、再試行しても同じエラーを返してしまう
      cache.delete(path);
      throw error;
    });

  cache.set(path, promise);
  return promise;
};

/** 全単語（6,736件） */
export const loadWordMaster = () => fetchJson(`${BASE_PATH}/words-master.json`);

/** 版・件数・SHA-256 */
export const loadManifest = () => fetchJson(`${BASE_PATH}/manifest.json`);

const TEXTBOOK_FILES = {
  'osaka-koukou-nyuushi': 'words-osaka.json',
  'highschool-english': 'words-highschool.json',
};

/** 教材ごとの単語。未知の教材IDは空配列。 */
export const loadTextbookWords = (textbookId) => {
  const file = TEXTBOOK_FILES[textbookId];
  if (!file) return Promise.resolve([]);
  return fetchJson(`${BASE_PATH}/${file}`);
};

export const KNOWN_TEXTBOOK_IDS = Object.keys(TEXTBOOK_FILES);

/** テスト用。キャッシュを空にする。 */
export const clearWordCache = () => cache.clear();
