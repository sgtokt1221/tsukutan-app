/**
 * 録音した英語を文字にする。
 *
 * Google Cloud Speech-to-Text を使う。同じ GCP プロジェクトなので、
 * 新しいアカウントも鍵も要らない（Function のサービスアカウントで通る）。
 *
 * 同期認識は60秒までしか受け取らない。それを超える音声は
 * Cloud Storage に置いてからでないと非同期認識に渡せないが、
 * 生徒の声をバケットに残したくないので、こちらで分割して順に投げる。
 * 対象は準1級のナレーション（2分）だけで、他は1回で収まる。
 */

/** ブラウザ側（wavEncoder.js）が作る形。ここを変えるなら両方直すこと。 */
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const WAV_HEADER_BYTES = 44;

/** 60秒の上限に余裕を持たせる。境界の語が1つ崩れることはある。 */
const CHUNK_SECONDS = 55;
const CHUNK_BYTES = CHUNK_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE;

/** 3分ぶん。これを超える録音は受け取らない。 */
const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

/** WAV のヘッダーを落として、生の PCM だけにする。 */
const toPcm = (wav) => (wav.length > WAV_HEADER_BYTES ? wav.subarray(WAV_HEADER_BYTES) : wav);

/**
 * 60秒に収まる大きさへ切る。
 * 標本の途中で切らないよう、必ず偶数バイトの境界にそろえる。
 */
const splitPcm = (pcm, chunkBytes = CHUNK_BYTES) => {
  const size = chunkBytes - (chunkBytes % BYTES_PER_SAMPLE);
  const chunks = [];
  for (let offset = 0; offset < pcm.length; offset += size) {
    chunks.push(pcm.subarray(offset, Math.min(offset + size, pcm.length)));
  }
  return chunks.length > 0 ? chunks : [pcm];
};

/**
 * 認識にかける。
 *
 * @param {Buffer} wav 16kHz モノラル 16bit の WAV
 * @param {{phrases?: string[]}} options
 *   phrases … 出てくると分かっている語（音読の英文など）。渡すと認識が寄る
 * @param {(request: object) => Promise<Array>} recognize 実体。テストで差し替える
 * @returns {Promise<{transcript: string, chunks: number}>}
 */
const transcribe = async (wav, { phrases } = {}, recognize) => {
  if (!Buffer.isBuffer(wav) || wav.length <= WAV_HEADER_BYTES) {
    throw new Error('音声が空です');
  }
  if (wav.length > MAX_AUDIO_BYTES) {
    throw new Error('音声が長すぎます');
  }

  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: SAMPLE_RATE,
    languageCode: 'en-US',
    // 生徒は日本語なまりで読む。句読点があると Gemini が文の切れ目を掴める。
    enableAutomaticPunctuation: true,
    model: 'latest_long',
  };
  // 音読は読む英文が分かっている。渡しておくと固有名詞や難語が化けにくい。
  if (phrases && phrases.length > 0) {
    config.speechContexts = [{ phrases: phrases.slice(0, 500) }];
  }

  const chunks = splitPcm(toPcm(wav));
  const parts = [];

  for (const chunk of chunks) {
    // 順番が意味を持つ（ナレーションは話の流れ）ので、並列にはしない。
    // eslint-disable-next-line no-await-in-loop
    const [response] = await recognize({
      config,
      audio: { content: chunk.toString('base64') },
    });
    for (const result of response.results || []) {
      const text = result.alternatives?.[0]?.transcript?.trim();
      if (text) parts.push(text);
    }
  }

  return { transcript: parts.join(' ').replace(/\s+/g, ' ').trim(), chunks: chunks.length };
};

/**
 * 音読で、読むべき英文とどれくらい合っているか。
 *
 * 発音の良し悪しは見ない（Azure をやめたので測れない）。見るのは
 * 「読み飛ばしていないか」だけ。認識結果に出てこない語を並べる。
 * 認識の誤りも混ざるので、点ではなく参考として出す。
 */
const missingWords = (referenceText, transcript) => {
  const normalize = (text) => String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const said = new Set(normalize(transcript));
  const seen = new Set();
  const missing = [];

  for (const word of normalize(referenceText)) {
    if (said.has(word) || seen.has(word)) continue;
    seen.add(word);
    missing.push(word);
  }
  return missing;
};

module.exports = {
  transcribe,
  splitPcm,
  toPcm,
  missingWords,
  MAX_AUDIO_BYTES,
  CHUNK_BYTES,
  SAMPLE_RATE,
};
