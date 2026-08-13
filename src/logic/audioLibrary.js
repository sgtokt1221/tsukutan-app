/**
 * 事前に作っておいた読み上げ音声を使う。
 *
 * 端末の読み上げ（Web Speech）は、声も速さも端末任せで揃わず、
 * Google のネット音声が選ばれると鳴り始めるまで待たされる。
 * あらかじめ作った音声ファイルなら全員同じ声で、しかも
 * セッションの頭でまとめて先読みできる。
 *
 * ファイル名は「言語 + 読み上げる文字列」の SHA-1。索引を配らなくても
 * ここで同じ計算をすればURLが出せる。
 * scripts/lib/audioNaming.js と同じ規則。変えるときは両方を直すこと。
 *
 * 音声が無い語もあるので（生成前・生成漏れ）、見つからなければ
 * 呼び出し側が今までどおり端末の読み上げに戻す。
 */

const BASE_URL = (process.env.REACT_APP_AUDIO_BASE_URL || '/audio').replace(/\/$/, '');
const CACHE_NAME = 'tsukutan-audio-v1';

// 同じ文を何度も探しに行かないよう、URLと「有る・無い」を覚えておく
const urlCache = new Map();
const missing = new Set();

const normalizeText = (text) => String(text || '').trim().replace(/\s+/g, ' ');

const shortLang = (lang) => (String(lang).startsWith('ja') ? 'ja' : 'en');

const toHex = (buffer) => Array.from(new Uint8Array(buffer))
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');

/** 生成側と同じ SHA-1。Web Crypto が無い環境では使わない。 */
const hashFor = async (text, lang) => {
  if (!window.crypto?.subtle) return null;
  const source = `${lang} ${normalizeText(text)}`;
  const digest = await window.crypto.subtle.digest('SHA-1', new TextEncoder().encode(source));
  return toHex(digest);
};

/** 読み上げ音声のURL。作れないときは null。 */
export const audioUrlFor = async (text, lang) => {
  const clean = normalizeText(text);
  if (!clean) return null;

  const key = `${shortLang(lang)} ${clean}`;
  if (urlCache.has(key)) return urlCache.get(key);

  const hash = await hashFor(clean, shortLang(lang));
  if (!hash) return null;

  const url = `${BASE_URL}/${shortLang(lang)}/${hash.slice(0, 2)}/${hash}.mp3`;
  urlCache.set(key, url);
  return url;
};

const openCache = async () => {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch (error) {
    return null;
  }
};

/**
 * 音声を取ってくる。端末に保存してあればそれを使う。
 * 無ければ null（＝端末の読み上げに戻す合図）。
 */
export const fetchClip = async (text, lang) => {
  const url = await audioUrlFor(text, lang);
  if (!url || missing.has(url)) return null;

  const cache = await openCache();

  try {
    if (cache) {
      const hit = await cache.match(url);
      if (hit) return await hit.blob();
    }

    const response = await fetch(url);
    if (!response.ok) {
      // 404 は「まだ作っていない語」。次からは探しに行かない。
      missing.add(url);
      return null;
    }

    // ファイルが無いと SPA の rewrite で index.html が 200 で返る。
    // response.ok だけ見ていると HTML を音声として保存してしまい、
    // 無音のまま端末の読み上げにも戻らない。
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('audio/')) {
      missing.add(url);
      return null;
    }

    if (cache) await cache.put(url, response.clone());
    return await response.blob();
  } catch (error) {
    missing.add(url);
    return null;
  }
};

/** その文の音声が用意できるか。 */
export const hasClip = async (text, lang) => Boolean(await fetchClip(text, lang));

/**
 * これから使う音声を先に取っておく。
 * 学習を始めた直後に呼ぶと、1語目から待たずに鳴る。
 *
 * @param {Array<{text:string, lang:string}>} clips
 * @param {number} concurrency 同時に取りに行く数
 */
export const prefetchClips = async (clips, { concurrency = 4 } = {}) => {
  const queue = (clips || []).filter((clip) => clip && normalizeText(clip.text));
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= queue.length) return;
      // 取れなくても進む。鳴らすときに端末の読み上げへ戻る。
      // eslint-disable-next-line no-await-in-loop
      await fetchClip(queue[index].text, queue[index].lang).catch(() => null);
    }
  });

  await Promise.all(runners);
};

/** 保存した音声を捨てる。 */
export const clearAudioCache = async () => {
  missing.clear();
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(CACHE_NAME);
  } catch (error) {
    // 消せなくても実害はない
  }
};
