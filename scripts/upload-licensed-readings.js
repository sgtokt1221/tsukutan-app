#!/usr/bin/env node
/**
 * 買った教材の長文を、塾の生徒だけが読める置き場（Firestore `licensedReadings`）へ入れる（2026-09-27）。
 *
 *   node scripts/upload-licensed-readings.js --book sokutan-advanced --from <起こしたJSONのフォルダ>   # 形を直して検査だけ
 *   node scripts/upload-licensed-readings.js --book sokutan-advanced --apply                         # Firestore へ書く
 *
 * ## 本文を Git に入れない
 *
 * **このリポジトリは公開**。市販の本文を `public/` やリポジトリに置くと誰でも読める。
 * 形を直したものは `local/licensed-readings/<本>/`（.gitignore 済み）にだけ置く。
 * 読ませ方は src/logic/readingContent.js の LICENSED_BOOKS、規則は firestore.rules の isEnrolled。
 *
 * 認証は Application Default Credentials（`gcloud auth application-default login`）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROJECT = 'tsukutan-58b3f';

const BOOKS = {
  'sokutan-advanced': { label: '速読英単語 上級編', idPrefix: 'sokutan-adv' },
};

/** 本の分野 → 長文の分類（public/reading/index.json の categories）。無いものは「社会のしくみ」 */
const CATEGORY_OF = {
  人間: 'society', 社会: 'society', 政治: 'society', 法律: 'society', 国際: 'society', 心理: 'society',
  科学: 'science', 医療: 'science', 健康: 'science', 生物: 'science', 医学: 'science', 生命: 'science',
  言語: 'culture', 文化: 'culture', 歴史: 'culture', 芸術: 'culture', 哲学: 'culture', 文学: 'culture', 宗教: 'culture',
  環境: 'nature', 自然: 'nature', 地球: 'nature',
  経済: 'work', ビジネス: 'work', 仕事: 'work',
  技術: 'technology', 情報: 'technology', テクノロジー: 'technology', 工学: 'technology',
  教育: 'school',
  スポーツ: 'sports',
};

const ROLES = new Set(['S', 'V', 'O', 'C', 'M']);

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};

/** 起こした1題を、長文の形（docs/reading-format.md）に直す。形がおかしければ理由を返す */
function toReading(raw, book) {
  const problems = [];
  const n = Number(raw.unit);
  const id = `${book.idPrefix}-${String(n).padStart(2, '0')}`;
  const sentences = (raw.sentences || []).map((s, i) => {
    const chunks = (s.chunks || []).map((c) => ({ en: String(c.en || '').trim(), ja: String(c.ja || '').trim(), role: c.role }));
    chunks.forEach((c) => {
      if (!c.en) problems.push(`${id} 文${i + 1}: 空のかたまり`);
      if (!ROLES.has(c.role)) problems.push(`${id} 文${i + 1}: role が ${c.role}`);
    });
    if (!String(s.ja || '').trim()) problems.push(`${id} 文${i + 1}: 和訳が無い`);
    return { paragraph: Number(s.paragraph) || 1, ja: String(s.ja || '').trim(), chunks };
  });
  if (!sentences.length) problems.push(`${id}: 文が無い`);
  const text = sentences.map((s) => s.chunks.map((c) => c.en).join(' ')).join(' ');
  const counted = text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  // 本の語数と大きく違えば、行の読み落とし・二重を疑う（数え方の差で数語はずれる）
  if (raw.words && Math.abs(counted - raw.words) > Math.max(6, raw.words * 0.05)) {
    problems.push(`${id}: 語数 ${counted}（本は ${raw.words}）`);
  }
  const tag = String(raw.tagJa || '').trim();
  return {
    reading: {
      id,
      grade: null, // 呼ぶ側で入れる
      category: CATEGORY_OF[tag] || 'society',
      title: `No.${n}`,
      titleJa: String(raw.titleJa || '').trim(),
      tagJa: tag,
      targetTime: raw.targetTime || '',
      words: raw.words || counted,
      sentences,
    },
    problems,
  };
}

async function main() {
  const bookId = argOf('--book');
  const book = BOOKS[bookId];
  if (!book) throw new Error(`--book は ${Object.keys(BOOKS).join(' / ')} のどれか`);
  const outDir = path.join(ROOT, 'local', 'licensed-readings', bookId);

  const from = argOf('--from');
  if (from) {
    fs.mkdirSync(outDir, { recursive: true });
    const files = fs.readdirSync(from).filter((f) => /^\d+\.json$/.test(f)).sort();
    const all = [];
    for (const f of files) {
      const { reading, problems } = toReading(JSON.parse(fs.readFileSync(path.join(from, f), 'utf8')), book);
      reading.grade = bookId;
      problems.forEach((p) => console.log(`  ⚠ ${p}`));
      fs.writeFileSync(path.join(outDir, `${reading.id}.json`), `${JSON.stringify(reading, null, 1)}\n`);
      all.push(reading);
    }
    const tags = [...new Set(all.map((r) => r.tagJa))].filter((t) => !CATEGORY_OF[t]);
    if (tags.length) console.log(`  分類に無い分野（社会のしくみに入れた）: ${tags.join('、')}`);
    console.log(`${all.length}題を ${path.relative(ROOT, outDir)} に書きました`);
  }

  const files = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith('.json')).sort() : [];
  const readings = files.map((f) => JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8')));
  const index = {
    label: book.label,
    readings: readings.map((r) => ({ id: r.id, title: r.title, titleJa: r.titleJa, category: r.category })),
  };
  console.log(`入れるもの: ${readings.length}題（${book.label}）`);
  if (!process.argv.includes('--apply')) {
    console.log('--apply を付けると Firestore へ書きます');
    return;
  }

  const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
  admin.initializeApp({ projectId: PROJECT });
  const db = admin.firestore();
  const batch = db.batch();
  const ref = db.collection('licensedReadings').doc(bookId);
  batch.set(ref, index);
  for (const r of readings) batch.set(ref.collection('items').doc(r.id), r);
  await batch.commit();
  console.log(`Firestore に書きました（licensedReadings/${bookId} と items ${readings.length}件）`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
