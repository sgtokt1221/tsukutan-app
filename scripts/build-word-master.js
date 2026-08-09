#!/usr/bin/env node
/**
 * scripts/build-word-master.js
 *
 * 単語マスターを組み立て、永続IDを付けて public/data/ へ書き出す。
 * IMPLEMENTATION_PLAN.md 9.3 / 9.4。
 *
 *   node scripts/build-word-master.js            # 生成
 *   node scripts/build-word-master.js --check    # 差分があるかだけ確認（書き込まない）
 *
 * 入力
 *   words.json          正本。7,205件、レベル1〜7（再分類済み）
 *   public/words.json   大阪府公立入試の収録範囲。旧レベル体系（1〜9）
 *   highschool.json     高校英語の収録範囲。既に words.json へマージ済み
 *
 * 出力
 *   public/data/words-master.json      永続IDつきの全単語
 *   src/wordsData.json                 上と同じ内容。バンドルへ import している画面用。
 *                                      フェーズ8で遅延読み込みへ移したら消せる。
 *   public/data/words-osaka.json       大阪府公立入試英単語
 *   public/data/words-highschool.json  高校英語
 *   public/data/manifest.json          版・件数・SHA-256
 *
 * 永続IDの性質
 *   - 語+品詞+意味+レベル の署名から決まるので、JSONの並び順を変えても変わらない
 *   - 既に words-master.json にIDがある項目は、意味やレベルを直してもそのIDを維持する
 *   - 意味や品詞が違う同綴語（close 動/形/副 など）は別IDになる
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'data');

// IDの名前空間。将来別の出どころを混ぜても衝突しないようにする。
const ID_SOURCE = 'tsukutan';

// 単語データのレベル体系は1〜7（計画書11.3）
const MAX_LEVEL = 7;

const read = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));

const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/** 出どころが違っても同じ項目だと判断するためのキー。レベルは含めない。 */
const contentKey = (entry) =>
  [normalize(entry.word), normalize(entry.partOfSpeech), normalize(entry.meaning)].join('|');

/** レベルまで含めた完全一致キー。ID生成の署名にも使う。 */
const fullKey = (entry) => `${contentKey(entry)}|${entry.level}`;

const makeId = (entry) => {
  const signature = `${ID_SOURCE}|${fullKey(entry)}`;
  return `w_${crypto.createHash('sha256').update(signature).digest('hex').slice(0, 16)}`;
};

/** 空でない方を採る。重複統合で情報を落とさないため。 */
const preferFilled = (a, b) => {
  if (a === undefined || a === null || a === '') return b;
  return a;
};

const mergeEntries = (base, extra) => ({
  ...base,
  example: preferFilled(base.example, extra.example),
  exampleJa: preferFilled(base.exampleJa, extra.exampleJa),
  subLevel: preferFilled(base.subLevel, extra.subLevel),
  eikenLevels:
    Array.isArray(base.eikenLevels) && base.eikenLevels.length
      ? base.eikenLevels
      : extra.eikenLevels,
});

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

const main = () => {
  const checkOnly = process.argv.includes('--check');

  const master = read('words.json');
  const osakaSource = read('public/words.json');
  const highschoolSource = read('highschool.json');

  const report = {
    inputs: {
      'words.json': master.length,
      'public/words.json': osakaSource.length,
      'highschool.json': highschoolSource.length,
    },
  };

  //--------------------------------------------------------------------------
  // 1. 完全同一の重複をまとめる
  //--------------------------------------------------------------------------
  const byFullKey = new Map();
  let mergedDuplicates = 0;
  const conflictingDuplicates = [];

  for (const entry of master) {
    const key = fullKey(entry);
    if (!byFullKey.has(key)) {
      byFullKey.set(key, { ...entry });
      continue;
    }
    mergedDuplicates += 1;
    const existing = byFullKey.get(key);
    // 例文まで一致しない重複は、統合したことが分かるよう記録しておく
    if (existing.example !== entry.example || existing.exampleJa !== entry.exampleJa) {
      conflictingDuplicates.push({
        key,
        kept: { example: existing.example, exampleJa: existing.exampleJa },
        dropped: { example: entry.example, exampleJa: entry.exampleJa },
      });
    }
    byFullKey.set(key, mergeEntries(existing, entry));
  }

  report.mergedExactDuplicates = mergedDuplicates;
  report.duplicatesWithDifferentExamples = conflictingDuplicates.length;
  // 統合で落ちた例文は握りつぶさず、全件レポートに残す
  report.droppedExamples = conflictingDuplicates;

  //--------------------------------------------------------------------------
  // 2. words.json に無い public/words.json の項目を取り込む
  //--------------------------------------------------------------------------
  const masterContentKeys = new Set([...byFullKey.values()].map(contentKey));
  const importedFromPublic = [];

  for (const entry of osakaSource) {
    if (masterContentKeys.has(contentKey(entry))) continue;
    // public 側は旧レベル体系（最大9）なので、マスターの上限へ寄せる
    const level = Math.min(entry.level, MAX_LEVEL);
    const imported = { ...entry, level };
    const key = fullKey(imported);
    if (byFullKey.has(key)) continue;
    byFullKey.set(key, imported);
    masterContentKeys.add(contentKey(imported));
    importedFromPublic.push({
      word: entry.word,
      partOfSpeech: entry.partOfSpeech,
      meaning: entry.meaning,
      publicLevel: entry.level,
      assignedLevel: level,
    });
  }

  report.importedFromPublicWords = importedFromPublic.length;
  report.importedEntries = importedFromPublic;

  //--------------------------------------------------------------------------
  // 3. 永続IDを付ける。既存のIDがあれば必ずそれを維持する。
  //--------------------------------------------------------------------------
  const existingIdByFullKey = new Map();
  const existingMasterPath = path.join(OUT_DIR, 'words-master.json');
  if (fs.existsSync(existingMasterPath)) {
    for (const entry of JSON.parse(fs.readFileSync(existingMasterPath, 'utf8'))) {
      if (entry.id) existingIdByFullKey.set(fullKey(entry), entry.id);
    }
  }

  const entries = [];
  const idOwner = new Map();
  const idCollisions = [];
  let reusedIds = 0;

  for (const [key, entry] of byFullKey) {
    const id = existingIdByFullKey.get(key) || makeId(entry);
    if (existingIdByFullKey.has(key)) reusedIds += 1;

    if (idOwner.has(id)) {
      idCollisions.push({ id, a: idOwner.get(id), b: key });
      continue;
    }
    idOwner.set(id, key);
    entries.push({ id, ...entry });
  }

  report.totalEntries = entries.length;
  report.reusedIds = reusedIds;
  report.idCollisions = idCollisions;

  if (idCollisions.length > 0) {
    console.error('IDが衝突しました。中止します。');
    for (const collision of idCollisions) console.error(`  ${collision.id}: ${collision.a} / ${collision.b}`);
    process.exit(1);
  }

  // 出力順は語→品詞→意味で固定する。並びが揺れても差分が出ないように。
  entries.sort((a, b) => fullKey(a).localeCompare(fullKey(b), 'en'));

  //--------------------------------------------------------------------------
  // 4. 教材ごとの収録範囲
  //--------------------------------------------------------------------------
  const osakaKeys = new Set(osakaSource.map(contentKey));
  const highschoolKeys = new Set(highschoolSource.map(contentKey));

  const osaka = entries.filter((entry) => osakaKeys.has(contentKey(entry)));
  const highschool = entries.filter((entry) => highschoolKeys.has(contentKey(entry)));

  report.textbooks = {
    'osaka-koukou-nyuushi': osaka.length,
    'highschool-english': highschool.length,
  };

  const levelDistribution = (list) =>
    list.reduce((acc, entry) => {
      acc[entry.level] = (acc[entry.level] || 0) + 1;
      return acc;
    }, {});
  report.levelDistribution = levelDistribution(entries);

  //--------------------------------------------------------------------------
  // 5. 書き出し
  //--------------------------------------------------------------------------
  const files = [
    { name: 'words-master.json', data: entries },
    { name: 'words-osaka.json', data: osaka },
    { name: 'words-highschool.json', data: highschool },
  ];

  const manifest = {
    version: 1,
    generatedFrom: {
      'words.json': master.length,
      'public/words.json': osakaSource.length,
      'highschool.json': highschoolSource.length,
    },
    levels: [...new Set(entries.map((entry) => entry.level))].sort((a, b) => a - b),
    files: {},
    textbooks: {
      'osaka-koukou-nyuushi': { file: 'words-osaka.json', count: osaka.length },
      'highschool-english': { file: 'words-highschool.json', count: highschool.length },
    },
  };

  const payloads = files.map(({ name, data }) => {
    const text = `${JSON.stringify(data)}\n`;
    manifest.files[name] = { count: data.length, bytes: Buffer.byteLength(text), sha256: sha256(text) };
    return { name, text };
  });

  if (checkOnly) {
    let changed = false;
    for (const { name, text } of payloads) {
      const abs = path.join(OUT_DIR, name);
      const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
      if (current !== text) {
        console.log(`差分あり: public/data/${name}`);
        changed = true;
      }
    }
    const bundledPath = path.join(ROOT, 'src', 'wordsData.json');
    const bundled = fs.existsSync(bundledPath) ? fs.readFileSync(bundledPath, 'utf8') : null;
    if (bundled !== payloads[0].text) {
      console.log('差分あり: src/wordsData.json');
      changed = true;
    }
    console.log(changed ? '再生成が必要です。' : '生成済みファイルは最新です。');
    process.exitCode = changed ? 1 : 0;
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const { name, text } of payloads) {
    fs.writeFileSync(path.join(OUT_DIR, name), text);
  }

  // 画面が import しているコピー。フェーズ8で public/data からの遅延読み込みに移す予定。
  fs.writeFileSync(path.join(ROOT, 'src', 'wordsData.json'), payloads[0].text);
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const reportPath = path.join(ROOT, 'docs', 'baseline', 'word-master-build-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  //--------------------------------------------------------------------------
  console.log('=== 単語マスターを生成しました ===');
  console.log(`  入力          : words.json ${master.length} / public/words.json ${osakaSource.length} / highschool.json ${highschoolSource.length}`);
  console.log(`  完全同一の統合: ${mergedDuplicates} 件（うち例文が違ったもの ${conflictingDuplicates.length} 件）`);
  console.log(`  public から追加: ${importedFromPublic.length} 件`);
  console.log(`  マスター件数  : ${entries.length} 件`);
  console.log(`  IDの引き継ぎ  : ${reusedIds} 件（初回は0）`);
  console.log(`  レベル分布    : ${JSON.stringify(report.levelDistribution)}`);
  console.log('  教材別        :');
  for (const [id, count] of Object.entries(report.textbooks)) {
    console.log(`    ${id.padEnd(22)} ${count} 件`);
  }
  console.log('  出力          : public/data/{manifest,words-master,words-osaka,words-highschool}.json');
  console.log('                  src/wordsData.json（画面が import する同内容のコピー）');
  console.log('  レポート      : docs/baseline/word-master-build-report.json');
};

main();
