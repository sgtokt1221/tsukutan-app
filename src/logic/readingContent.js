/**
 * 長文（読みもの）の素材を読む。形は docs/reading-format.md が正本。
 *
 * 素材は public/reading/。AI生成の月1本ストーリーとは別物で、こちらは作り置き。
 */

const BASE_PATH = '/reading';

const cache = new Map();

const fetchJson = (path) => {
  if (cache.has(path)) return cache.get(path);

  const promise = fetch(path)
    .then((response) => {
      if (!response.ok) throw new Error(`${path} を取得できませんでした (HTTP ${response.status})`);
      return response.json();
    })
    .catch((error) => {
      // 失敗をキャッシュに残すと、電波が戻っても二度と読めなくなる。
      cache.delete(path);
      throw error;
    });

  cache.set(path, promise);
  return promise;
};

export const loadReadingIndex = () => fetchJson(`${BASE_PATH}/index.json`);

export const loadReading = (grade, id) => fetchJson(`${BASE_PATH}/${grade}/${id}.json`);

/** 文をつないだ英文。チャンクが正本なので、ここで組み立てる。 */
export const sentenceEnglish = (sentence) =>
  (sentence?.chunks || []).map((chunk) => chunk.en).join(' ');

/** 読みもの全体の英文。音読の採点に渡す。 */
export const readingEnglish = (reading) =>
  (reading?.sentences || []).map(sentenceEnglish).join(' ');

/** 読み上げの順番。和訳モードでは英語のあとに日本語を入れる。 */
export const speechPlanFor = (sentence, withJapanese) => {
  const plan = [{ text: sentenceEnglish(sentence), lang: 'en-US' }];
  if (withJapanese && sentence?.ja) plan.push({ text: sentence.ja, lang: 'ja-JP' });
  return plan;
};
