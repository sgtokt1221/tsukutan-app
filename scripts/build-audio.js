#!/usr/bin/env node
/**
 * scripts/build-audio.js
 *
 * 単語・例文・意味と、英検二次試験の面接文の読み上げ音声を
 * Google Cloud Text-to-Speech で作る。
 *
 *   node scripts/build-audio.js --dry-run              # 件数と概算費用だけ出す
 *   node scripts/build-audio.js --limit 20             # 20語ぶんだけ試す
 *   node scripts/build-audio.js                        # 全部作る
 *   node scripts/build-audio.js --voice standard       # 安い声で作る
 *   node scripts/build-audio.js --source interview     # 面接文だけ作る（数十円）
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
const INTERVIEW_DIR = path.join(ROOT, 'public', 'eiken-interview');
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
const SOURCE = valueOf('--source', 'all');

/** 1語から作る読み上げの一覧。空の項目は作らない。 */
const clipsForWord = (word) => [
  { text: word.word, lang: 'en' },
  { text: word.example, lang: 'en' },
  { text: word.meaning, lang: 'ja' },
  { text: word.exampleJa, lang: 'ja' },
];

/**
 * 英検二次試験の読み上げ対象を集める。
 *
 * 面接は入室から退室まで全部が試験。面接委員のセリフも、受験者が
 * 言うべき応答も、本番と同じ音で聞けないと練習にならないので、
 * どちらも作る。日本語の注釈は画面で読むものなので音は作らない。
 */
const collectInterviewClips = () => {
  if (!fs.existsSync(INTERVIEW_DIR)) return [];

  const clips = [];
  const files = [];
  for (const entry of fs.readdirSync(INTERVIEW_DIR, { withFileTypes: true })) {
    const full = path.join(INTERVIEW_DIR, entry.name);
    if (entry.isDirectory()) {
      for (const name of fs.readdirSync(full)) {
        if (name.endsWith('.json')) files.push(path.join(full, name));
      }
    } else if (entry.name.endsWith('.json')) {
      files.push(full);
    }
  }

  for (const file of files) {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));

    // 面接の流れ（interviewer-N.json）
    for (const step of doc.steps || []) {
      clips.push(step.interviewer, step.alt, step.expected);
    }

    // 問題カード
    clips.push(doc.passage?.text);
    for (const question of doc.questions || []) {
      clips.push(question.prompt, question.modelAnswer);
      for (const branch of Object.values(question.followUp || {})) {
        clips.push(branch.prompt, branch.modelAnswer);
      }
    }
  }

  // 面接はすべて英語。日本語を混ぜてはいけない試験なので lang は en 固定。
  // 「My name is ...」のような雛形は、そのまま読ませると尻切れになるので作らない。
  return clips
    .filter((text) => typeof text === 'string' && !text.includes('...'))
    .map((text) => ({ text, lang: 'en' }));
};

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
  const wantWords = SOURCE === 'all' || SOURCE === 'words';
  const wantInterview = SOURCE === 'all' || SOURCE === 'interview';
  if (!wantWords && !wantInterview) {
    console.error(`--source は words / interview / all のいずれかです（受け取った値: ${SOURCE}）`);
    process.exit(1);
  }

  let words = [];
  if (wantWords) {
    if (!fs.existsSync(MASTER_PATH)) {
      console.error('public/data/words-master.json がありません。先に node scripts/build-word-master.js を実行してください。');
      process.exit(1);
    }
    const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
    words = LIMIT > 0 ? master.slice(0, LIMIT) : master;
  }

  const source = [
    ...words.flatMap(clipsForWord),
    ...(wantInterview ? collectInterviewClips() : []),
  ];

  // 同じ文は1つのファイルにまとめる（意味が同じ語などで効く）
  const wanted = new Map();
  for (const clip of source) {
    const text = normalizeText(clip.text);
    if (text.length === 0) continue;
    const relative = audioPathFor(clip.text, clip.lang);
    if (!wanted.has(relative)) {
      wanted.set(relative, { ...clip, text, relative });
    }
  }

  const all = [...wanted.values()];
  const missing = all.filter((clip) => !fs.existsSync(path.join(OUT_DIR, clip.relative)));
  const chars = missing.reduce((sum, clip) => sum + clip.text.length, 0);
  const cost = (chars / 1_000_000) * VOICE_SET.pricePerMillionChars;

  console.log(`対象            : ${SOURCE}`);
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
