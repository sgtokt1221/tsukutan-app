#!/usr/bin/env node
/**
 * scripts/build-audio.js
 *
 * 単語・例文・意味の読み上げ音声を Google Cloud Text-to-Speech で作る。
 *
 *   node scripts/build-audio.js --dry-run          # 件数と概算費用だけ出す
 *   node scripts/build-audio.js --limit 20         # 20語ぶんだけ試す
 *   node scripts/build-audio.js                    # 全部作る
 *   node scripts/build-audio.js --voice standard   # 安い声で作る
 *
 * **課金される。** 既定はドライランではないので、まず --dry-run で
 * 文字数と概算費用を見て、次に --limit で声を聞いてから全部にすること。
 *
 * 途中で止めても平気。すでにあるファイルは飛ばすので、そのまま
 * もう一度走らせれば続きから作る。
 *
 * 認証は Application Default Credentials。
 *   gcloud auth application-default login
 *   gcloud services enable texttospeech.googleapis.com
 *
 * 出来上がりは local/audio/ の下。リポジトリには入れない（数百MBある）。
 * 配信は scripts/upload-audio.js を参照。
 */

const fs = require('fs');
const path = require('path');
const { GoogleAuth } = require('google-auth-library');

const { audioPathFor, normalizeText } = require('./lib/audioNaming');

const ROOT = path.resolve(__dirname, '..');
const MASTER_PATH = path.join(ROOT, 'public', 'data', 'words-master.json');
const OUT_DIR = path.join(ROOT, 'local', 'audio');
const ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

/**
 * 声の設定。
 *
 * WaveNet はニューラルネットで波形そのものを作るので、抑揚が自然。
 * Standard は録音の断片をつなぐ方式で、平板だが4分の1の値段。
 * 単価は変わることがあるので、実行前に必ず現在の価格を確認すること。
 */
const VOICES = {
  wavenet: {
    en: { languageCode: 'en-US', name: 'en-US-Wavenet-F' },
    ja: { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-B' },
    pricePerMillionChars: 16,
  },
  standard: {
    en: { languageCode: 'en-US', name: 'en-US-Standard-C' },
    ja: { languageCode: 'ja-JP', name: 'ja-JP-Standard-A' },
    pricePerMillionChars: 4,
  },
};

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const valueOf = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const DRY_RUN = hasFlag('--dry-run');
const LIMIT = Number(valueOf('--limit', 0)) || 0;
const VOICE_SET = VOICES[valueOf('--voice', 'wavenet')] || VOICES.wavenet;
const CONCURRENCY = Number(valueOf('--concurrency', 6)) || 6;

/** 1語から作る読み上げの一覧。空の項目は作らない。 */
const clipsForWord = (word) => [
  { text: word.word, lang: 'en' },
  { text: word.example, lang: 'en' },
  { text: word.meaning, lang: 'ja' },
  { text: word.exampleJa, lang: 'ja' },
].filter((clip) => normalizeText(clip.text).length > 0);

const synthesize = async (client, token, text, lang) => {
  const voice = VOICE_SET[lang];
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: voice.languageCode, name: voice.name },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0 },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`TTS が失敗しました (HTTP ${response.status}): ${detail.slice(0, 300)}`);
  }

  const body = await response.json();
  if (!body.audioContent) throw new Error('audioContent が空です');
  return Buffer.from(body.audioContent, 'base64');
};

/** 決めた数だけ並行で流す。TTS には毎分の上限があるので上げすぎない。 */
const runPool = async (items, size, worker) => {
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, size) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      // eslint-disable-next-line no-await-in-loop
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
};

const main = async () => {
  if (!fs.existsSync(MASTER_PATH)) {
    console.error('public/data/words-master.json がありません。先に node scripts/build-word-master.js を実行してください。');
    process.exit(1);
  }

  const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
  const words = LIMIT > 0 ? master.slice(0, LIMIT) : master;

  // 同じ文は1つのファイルにまとめる（意味が同じ語などで効く）
  const wanted = new Map();
  for (const word of words) {
    for (const clip of clipsForWord(word)) {
      const relative = audioPathFor(clip.text, clip.lang);
      if (!wanted.has(relative)) {
        wanted.set(relative, { ...clip, text: normalizeText(clip.text), relative });
      }
    }
  }

  const all = [...wanted.values()];
  const missing = all.filter((clip) => !fs.existsSync(path.join(OUT_DIR, clip.relative)));
  const chars = missing.reduce((sum, clip) => sum + clip.text.length, 0);
  const cost = (chars / 1_000_000) * VOICE_SET.pricePerMillionChars;

  console.log(`対象の語          : ${words.length.toLocaleString()}${LIMIT ? `（--limit ${LIMIT}）` : ''}`);
  console.log(`作る音声（重複除く）: ${all.length.toLocaleString()}`);
  console.log(`未作成            : ${missing.length.toLocaleString()}`);
  console.log(`文字数            : ${chars.toLocaleString()}`);
  console.log(`概算費用          : $${cost.toFixed(2)}（${valueOf('--voice', 'wavenet')} / $${VOICE_SET.pricePerMillionChars} per 1M chars 前提）`);
  console.log('※ 単価は変わることがあります。実行前に現在の価格を確認してください。');

  if (DRY_RUN) {
    console.log('\n--dry-run のため、ここまで。作るときは --dry-run を外してください。');
    return;
  }
  if (missing.length === 0) {
    console.log('\nすべて作成済みです。');
    return;
  }

  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) {
    console.error('アクセストークンを取得できませんでした。gcloud auth application-default login を実行してください。');
    process.exit(1);
  }

  console.log(`\n作成を開始します（並行 ${CONCURRENCY}）…`);
  let done = 0;
  let failed = 0;

  await runPool(missing, CONCURRENCY, async (clip) => {
    const target = path.join(OUT_DIR, clip.relative);
    try {
      const audio = await synthesize(client, token, clip.text, clip.lang);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, audio);
      done += 1;
    } catch (error) {
      failed += 1;
      console.error(`  失敗: ${clip.text.slice(0, 30)} — ${error.message}`);
    }
    if ((done + failed) % 200 === 0) {
      console.log(`  ${done + failed} / ${missing.length}`);
    }
  });

  console.log(`\n完了: ${done.toLocaleString()} 件作成、${failed.toLocaleString()} 件失敗`);
  console.log(`出力先: ${OUT_DIR}`);
  if (failed > 0) {
    console.log('失敗したぶんは、もう一度同じコマンドを実行すれば作り直します。');
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
