/**
 * 長文（読みもの）の素材を読む。形は docs/reading-format.md が正本。
 *
 * 素材は public/reading/。AI生成の月1本ストーリーとは別物で、こちらは作り置き。
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const BASE_PATH = '/reading';

/**
 * **買った教材の長文は、塾の生徒だけが読める置き場に置く**（2026-09-27）。
 *
 * `public/reading/` は誰でも取れる静的ファイルで、しかもリポジトリは公開なので、
 * 市販の本文はそこへ置かない。Firestore の `licensedReadings/{本}`（一覧）と
 * `licensedReadings/{本}/items/{id}`（本文）に置き、規則で「users に記録があり、
 * 止められていない人」だけに読ませる（firestore.rules の isEnrolled）。
 * 本文のデータは Git に入らない `local/licensed-readings/` にだけあり、
 * `scripts/upload-licensed-readings.js` で入れる。
 */
export const LICENSED_BOOKS = ['sokutan-intro', 'sokutan-advanced'];

/** 読めない（生徒でない・通信が無い）ときは出さないだけ。公開の長文は止めない */
const loadLicensedGrades = async () => {
  const out = [];
  for (const id of LICENSED_BOOKS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const snap = await getDoc(doc(db, 'licensedReadings', id));
      if (snap.exists()) out.push({ ...snap.data(), id, licensed: true });
    } catch (error) {
      // 生徒でなければ規則で弾かれる。それは正しい動きなので黙って出さない
    }
  }
  return out;
};

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

export const loadReadingIndex = () => Promise.all([fetchJson(`${BASE_PATH}/index.json`), loadLicensedGrades()])
  .then(([index, licensed]) => (licensed.length ? { ...index, grades: [...index.grades, ...licensed] } : index));

export const loadReading = (grade, id) => {
  if (LICENSED_BOOKS.includes(grade)) {
    return getDoc(doc(db, 'licensedReadings', grade, 'items', id)).then((snap) => {
      if (!snap.exists()) throw new Error(`${grade}/${id} が見つかりません`);
      return snap.data();
    });
  }
  return fetchJson(`${BASE_PATH}/${grade}/${id}.json`);
};

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
