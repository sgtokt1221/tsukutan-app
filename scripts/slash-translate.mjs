/**
 * スラッシュリーディングの小片に和訳を入れる。
 *
 * 読みもののデータ（`public/reading/<級>/<id>.json`）は、訳を**チャンク単位**でしか
 * 持っていない。スラッシュはチャンクの中でも切るので、そのままだと
 * 「3つに切れているのに訳は1つ」になる。切ったぶんの訳をここで作る。
 *
 * ## 決めていること
 * - **切り方は `src/logic/slashReading.js` が正本。** ここでは切らない。
 *   規則を変えたら作り直す（`tests` が古さを見張る）。
 * - 書き足すのは `chunk.slash` だけ。**`chunk.en` / `chunk.ja` / `role` は触らない**
 *   （SVOC はチャンクをそのまま見ているので、触ると両方が狂う）。
 * - **もう入っているものは作り直さない。** 途中で止めても続きから走る。
 *
 * ## 使い方
 *   node scripts/slash-translate.mjs            # 足りないところだけ作る
 *   node scripts/slash-translate.mjs --dry      # 作らずに件数だけ出す
 *   node scripts/slash-translate.mjs --force    # 全部作り直す
 *   node scripts/slash-translate.mjs --file 5/eiken5-daily-01.json
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { VertexAI } from './../functions/node_modules/@google-cloud/vertexai/build/src/index.js';

const ROOT = new URL('..', import.meta.url).pathname;
const READING_DIR = join(ROOT, 'public/reading');
const PROJECT = 'tsukutan-58b3f';
const LOCATION = 'us-central1';
const MODEL = 'gemini-2.5-flash';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
const ONLY = (() => {
  const i = args.indexOf('--file');
  return i >= 0 ? args[i + 1] : null;
})();

/*
  区切り方の正本を読む。

  `src/logic/slashReading.js` は ESM だが、`package.json` に `type: module` が
  無いので `.js` のままでは Node が CommonJS として読もうとする。
  中身は変えずに `.mjs` として写してから読む。
*/
const rulesPath = join(mkdtempSync(join(tmpdir(), 'slash-')), 'rules.mjs');
writeFileSync(rulesPath, readFileSync(join(ROOT, 'src/logic/slashReading.js'), 'utf8'));
const { slashPiecesFor } = await import(pathToFileURL(rulesPath).href);

/** そのチャンクを規則どおりに切った小片 */
const piecesOf = (chunk) => slashPiecesFor(chunk);

const sentenceEnglish = (sentence) => sentence.chunks.map((c) => c.en).join(' ');

/** すでに入っていて、しかも今の規則と合っているか */
const isFresh = (chunk, pieces) => Array.isArray(chunk.slash)
  && chunk.slash.length === pieces.length
  && chunk.slash.every((p, i) => p.en === pieces[i] && String(p.ja || '').trim());

const PROMPT = (items) => `あなたは日本の学習塾で英語を教えています。
中高生の「スラッシュリーディング」（英語を頭から順に意味を取る練習）用に、
区切られたまとまり1つ1つに日本語訳を付けてください。

## 守ること
- **1つの小片の訳は、日本語として自然なひとまとまり**にする。
  語順を英語に合わせるのは**小片と小片の間だけ**で、小片の中は自然な日本語にする。
  ✕「人々 来る」 → ○「来る人々」
  ✕「もし知る 名前を」 → ○「名前を知っていれば」
  ✕「その順序で 家が建てられた」 → ○「家が建てられた順に」
- **訳の中に空白を入れない。**
- その小片が担っている意味だけを言う。前後の意味を先取りしない。
  例: "In rural areas" → 「地方では」 / "of Japan," → 「日本の」
      "there are many settlements" → 「多くの集落がある」
      "that are expected" → 「〜と見込まれている」
- 短く。多くは3〜12文字。文末の「。」は付けない。
- 元の訳（chunkJa）が表している意味から外れない。**語を足さない・減らさない**。
- 固有名詞・数値はそのまま。

## 出力
JSON配列だけを返す。説明は書かない。
[{"id": <そのまま返す>, "ja": ["小片1の訳", "小片2の訳", ...]}, ...]
"ja" の数は "pieces" の数と必ず同じにすること。

## 対象
${JSON.stringify(items, null, 1)}`;

const parseJson = (text) => {
  const body = text.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
  return JSON.parse(body);
};

const vertex = new VertexAI({ project: PROJECT, location: LOCATION });
const model = vertex.getGenerativeModel({
  model: MODEL,
  generationConfig: {
    temperature: 0.2,
    /*
      **上限は thinking と本文で分け合う。** 8192 だと考えるぶんに食われて
      本文が途中で切れ、JSON が壊れて丸ごと落ちる（2026-09-20 に51本中20本が失敗）。
      考えさせる必要が無い作業なので thinking を切り、上限も広く取る。
    */
    maxOutputTokens: 32768,
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingBudget: 0 },
  },
});

const ask = async (items) => {
  const result = await model.generateContent(PROMPT(items));
  const candidate = result.response.candidates?.[0];
  // **切れたものをパースしない。** 途中まで読めてしまい、静かにずれる
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`途中で止まりました（${candidate.finishReason}）`);
  }
  const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('');
  return parseJson(text);
};

const files = [];
for (const grade of readdirSync(READING_DIR)) {
  const dir = join(READING_DIR, grade);
  let entries;
  try { entries = readdirSync(dir); } catch { continue; }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    if (ONLY && `${grade}/${name}` !== ONLY) continue;
    files.push({ grade, name, path: join(dir, name) });
  }
}

let totalChunks = 0;
let totalPieces = 0;
let touchedFiles = 0;

for (const file of files) {
  const data = JSON.parse(readFileSync(file.path, 'utf8'));
  const items = [];

  data.sentences.forEach((sentence, si) => {
    sentence.chunks.forEach((chunk, ci) => {
      const pieces = piecesOf(chunk);
      if (pieces.length < 2) {
        // 切れないチャンクは印も持たせない（chunk.ja をそのまま使う）
        if (chunk.slash) delete chunk.slash;
        return;
      }
      if (!FORCE && isFresh(chunk, pieces)) return;
      items.push({
        id: `${si}-${ci}`,
        sentenceEn: sentenceEnglish(sentence),
        sentenceJa: sentence.ja,
        chunkEn: chunk.en,
        chunkJa: chunk.ja,
        pieces,
      });
    });
  });

  if (items.length === 0) continue;
  totalChunks += items.length;
  totalPieces += items.reduce((a, x) => a + x.pieces.length, 0);

  if (DRY) {
    console.log(`${file.grade}/${file.name}: ${items.length} チャンク`);
    continue;
  }

  let answers;
  try {
    answers = await ask(items);
  } catch (error) {
    console.error(`${file.grade}/${file.name}: 作れませんでした — ${error.message}`);
    continue;
  }

  const byId = new Map(answers.map((a) => [String(a.id), a.ja]));
  let applied = 0;
  let skipped = 0;

  for (const item of items) {
    const [si, ci] = item.id.split('-').map(Number);
    const chunk = data.sentences[si].chunks[ci];
    const ja = byId.get(item.id);
    // **数が合わないものは入れない。** ずれたまま入れると、別の小片の訳が出る
    if (!Array.isArray(ja) || ja.length !== item.pieces.length
      || ja.some((t) => !String(t || '').trim())) {
      skipped += 1;
      continue;
    }
    chunk.slash = item.pieces.map((en, k) => ({ en, ja: String(ja[k]).trim() }));
    applied += 1;
  }

  writeFileSync(file.path, `${JSON.stringify(data, null, 1)}\n`);
  touchedFiles += 1;
  console.log(`${file.grade}/${file.name}: ${applied} 件${skipped ? ` / 見送り ${skipped} 件` : ''}`);
}

console.log(`\n対象 ${totalChunks} チャンク（小片 ${totalPieces} 個）/ 書いたファイル ${touchedFiles} 本`);
if (!DRY && !existsSync(join(ROOT, 'public/reading/index.json'))) {
  console.error('index.json が見当たりません。場所を確かめてください。');
}
