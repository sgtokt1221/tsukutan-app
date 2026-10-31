/**
 * 単語データを端末に保存しておく。
 *
 * words-master.json は展開後 2.1MB ある。毎回ネットワークから取ると
 * スマホの回線では起動が目に見えて遅い。初回だけ落として Cache Storage
 * に置き、次からはそこから読む。
 *
 * Service Worker は使わない。Cache Storage はページからも触れるので、
 * データを持たせるだけならこれで足りる（アプリ本体のオフライン化まで
 * やるときに Service Worker を足す）。
 *
 * 保存の鍵は manifest の sha256。単語データを作り直せば鍵が変わり、
 * 古いものは読まれず次の起動で入れ替わる。
 */

const CACHE_NAME = 'tsukutan-word-data-v1';

const isSupported = () => typeof caches !== 'undefined';

/** 鍵つきのURL。中身が変われば別物として扱われる。 */
const cacheKeyFor = (path, signature) => (signature ? `${path}?v=${signature}` : path);

/**
 * 保存済みのものを返す。無ければ null。
 * 壊れていて読めないときも null にして、取り直しへ倒す。
 */
const readFromCache = async (key) => {
  if (!isSupported()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(key);
    if (!hit) return null;
    return await hit.json();
  } catch (error) {
    return null;
  }
};

/** 古い版を片付ける。同じファイルの別の鍵だけを消す。 */
const dropOtherVersions = async (path, keepKey) => {
  if (!isSupported()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    await Promise.all(keys.map((request) => {
      const url = new URL(request.url);
      const sameFile = url.pathname === new URL(keepKey, window.location.origin).pathname;
      const sameKey = request.url.endsWith(keepKey);
      return sameFile && !sameKey ? cache.delete(request) : Promise.resolve();
    }));
  } catch (error) {
    // 片付けに失敗しても読み書きには影響しない
  }
};

/**
 * 進捗を見ながら取ってくる。
 *
 * Content-Length は圧縮後の大きさなので分母に使えない。manifest が
 * 持っている展開後のバイト数を使う。分からないときは進捗を出さない。
 */
const fetchWithProgress = async (path, totalBytes, onProgress) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`単語データを読み込めませんでした (${path}: HTTP ${response.status})`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    throw new Error(
      `${path} がJSONではありません（${contentType || '不明'}）。配信設定を確認してください。`
    );
  }

  const canStream = Boolean(response.body) && totalBytes > 0 && typeof onProgress === 'function';

  if (!canStream) {
    // 進捗を出せない環境。保存用に本文も持っておく。
    if (typeof response.text === 'function') {
      const text = await response.text();
      return { data: JSON.parse(text), text };
    }
    return { data: await response.json(), text: null };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(1, received / totalBytes));
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  onProgress(1);
  const text = new TextDecoder().decode(merged);
  return { data: JSON.parse(text), text };
};

/**
 * 保存してあればそれを、無ければ取ってきて保存する。
 *
 * @param {string} path 取得先
 * @param {object} options
 * @param {string} [options.signature] manifest の sha256 など。変わると入れ替わる
 * @param {number} [options.totalBytes] 展開後のバイト数。進捗の分母
 * @param {Function} [options.onProgress] 0〜1 で進み具合を渡す
 * @param {boolean} [options.force] 保存を無視して取り直す
 */
export const loadCachedJson = async (path, {
  signature, totalBytes, onProgress, force = false,
} = {}) => {
  const key = cacheKeyFor(path, signature);

  if (!force) {
    const cached = await readFromCache(key);
    if (cached) return { data: cached, fromCache: true };
  }

  const { data, text } = await fetchWithProgress(path, totalBytes, onProgress);

  if (isSupported() && text !== null && typeof Response === 'function') {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(key, new Response(text, {
        headers: { 'Content-Type': 'application/json' },
      }));
      await dropOtherVersions(path, key);
    } catch (error) {
      // 保存できなくても学習は続けられる（次回また取りに行くだけ）
    }
  }

  return { data, fromCache: false };
};

/** 保存した単語データを捨てる。 */
export const clearWordDataCache = async () => {
  if (!isSupported()) return;
  try {
    await caches.delete(CACHE_NAME);
  } catch (error) {
    // 消せなくても実害はない
  }
};
