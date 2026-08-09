#!/usr/bin/env node
/**
 * scripts/audit-word-data.js
 *
 * 単語データJSONの変更前レポートを作る読み取り専用スクリプト。
 * 何も書き換えないので、いつ実行しても安全。
 *
 *   node scripts/audit-word-data.js                      # 標準の対象ファイルを監査
 *   node scripts/audit-word-data.js a.json b.json        # 対象を明示
 *   node scripts/audit-word-data.js --json out.json      # 機械可読レポートも出力
 *
 * 監査項目（IMPLEMENTATION_PLAN.md 5.3）
 *   - JSON形式確認 / 件数集計 / 必須フィールド欠損
 *   - 重複語（表面語）と、意味違いの同綴語の切り分け
 *   - 完全同一レコードの重複
 *   - レベル分布 / 英検級分布 / サブレベル分布
 *   - ファイル単位の SHA-256（同一内容ファイルの検出）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

const DEFAULT_TARGETS = [
  'words.json',
  'src/wordsData.json',
  'public/words.json',
  'highschool.json',
];

// 学習画面が最低限必要とするフィールド
const REQUIRED_FIELDS = ['word', 'partOfSpeech', 'meaning', 'level'];

const normalize = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

// 意味違いの同綴語を潰さないための識別キー。永続ID設計（フェーズ4）と同じ組み合わせ。
const signatureOf = (entry) =>
  [
    normalize(entry.word),
    normalize(entry.partOfSpeech),
    normalize(entry.meaning),
    entry.level,
  ].join('|');

const tally = (values) => {
  const counts = new Map();
  for (const value of values) {
    const key = String(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))
  );
};

const auditFile = (relativePath) => {
  const absolutePath = path.join(ROOT, relativePath);
  const report = { file: relativePath };

  if (!fs.existsSync(absolutePath)) {
    return { ...report, ok: false, error: 'ファイルが存在しません' };
  }

  const raw = fs.readFileSync(absolutePath);
  report.bytes = raw.length;
  report.sha256 = crypto.createHash('sha256').update(raw).digest('hex');

  let data;
  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    return { ...report, ok: false, error: `JSONパース失敗: ${error.message}` };
  }

  if (!Array.isArray(data)) {
    return { ...report, ok: false, error: `配列ではありません (${typeof data})` };
  }

  report.ok = true;
  report.count = data.length;

  // 必須フィールド欠損
  const missingByField = {};
  for (const field of REQUIRED_FIELDS) missingByField[field] = 0;
  const missingSamples = [];
  data.forEach((entry, index) => {
    const missing = REQUIRED_FIELDS.filter(
      (field) => entry == null || entry[field] === undefined || entry[field] === null || entry[field] === ''
    );
    for (const field of missing) missingByField[field] += 1;
    if (missing.length && missingSamples.length < 5) {
      missingSamples.push({ index, missing, entry });
    }
  });
  report.missingByField = missingByField;
  report.missingSamples = missingSamples;

  // 重複: 表面語 / 完全同一レコード
  const bySurface = new Map();
  const bySignature = new Map();
  data.forEach((entry, index) => {
    const surface = normalize(entry && entry.word);
    if (!bySurface.has(surface)) bySurface.set(surface, []);
    bySurface.get(surface).push(index);

    const signature = signatureOf(entry || {});
    if (!bySignature.has(signature)) bySignature.set(signature, []);
    bySignature.get(signature).push(index);
  });

  const duplicateSurfaces = [...bySurface.entries()].filter(([, ids]) => ids.length > 1);
  const duplicateSignatures = [...bySignature.entries()].filter(([, ids]) => ids.length > 1);

  report.uniqueSurfaceWords = bySurface.size;
  report.uniqueSignatures = bySignature.size;
  // 表面語は重複するが署名が違う = 意味/品詞違いの同綴語。統合してはいけない。
  report.homographEntries = duplicateSurfaces.reduce((sum, [, ids]) => sum + ids.length, 0)
    - duplicateSignatures.reduce((sum, [, ids]) => sum + ids.length, 0);
  report.exactDuplicateEntries = duplicateSignatures.reduce((sum, [, ids]) => sum + ids.length - 1, 0);
  report.topHomographs = duplicateSurfaces
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([word, ids]) => ({
      word,
      count: ids.length,
      meanings: [...new Set(ids.map((i) => `${data[i].partOfSpeech}:${data[i].meaning}`))],
    }));
  report.exactDuplicateSamples = duplicateSignatures
    .slice(0, 5)
    .map(([signature, ids]) => ({ signature, indexes: ids }));

  // 分布
  report.levelDistribution = tally(data.map((entry) => (entry && entry.level !== undefined ? entry.level : '(なし)')));
  report.eikenDistribution = tally(
    data.flatMap((entry) => {
      const levels = entry && entry.eikenLevels;
      if (!Array.isArray(levels) || levels.length === 0) return ['(なし)'];
      return levels;
    })
  );
  report.subLevelDistribution = tally(
    data.map((entry) => (entry && entry.subLevel !== undefined ? entry.subLevel : '(なし)'))
  );

  report.fields = [...new Set(data.flatMap((entry) => Object.keys(entry || {})))].sort();
  report.hasPersistentId = report.fields.includes('id');

  return report;
};

const print = (report) => {
  console.log(`\n=== ${report.file} ===`);
  if (!report.ok) {
    console.log(`  NG: ${report.error}`);
    return;
  }
  console.log(`  件数            : ${report.count}`);
  console.log(`  バイト数        : ${report.bytes}`);
  console.log(`  SHA-256         : ${report.sha256}`);
  console.log(`  フィールド      : ${report.fields.join(', ')}`);
  console.log(`  永続ID          : ${report.hasPersistentId ? 'あり' : 'なし'}`);

  const missing = Object.entries(report.missingByField).filter(([, n]) => n > 0);
  console.log(`  必須欠損        : ${missing.length ? missing.map(([f, n]) => `${f}=${n}`).join(', ') : 'なし'}`);

  console.log(`  ユニーク表面語  : ${report.uniqueSurfaceWords}`);
  console.log(`  ユニーク署名    : ${report.uniqueSignatures}`);
  console.log(`  同綴・意味違い  : ${report.homographEntries} 件（統合禁止）`);
  console.log(`  完全同一の重複  : ${report.exactDuplicateEntries} 件（統合候補）`);
  console.log(`  レベル分布      : ${JSON.stringify(report.levelDistribution)}`);
  console.log(`  英検級分布      : ${JSON.stringify(report.eikenDistribution)}`);
  if (Object.keys(report.subLevelDistribution).length > 1) {
    console.log(`  サブレベル分布  : ${JSON.stringify(report.subLevelDistribution)}`);
  }
  if (report.topHomographs.length) {
    console.log('  同綴語トップ    :');
    for (const item of report.topHomographs) {
      console.log(`    - ${item.word} (${item.count}件) ${item.meanings.slice(0, 3).join(' / ')}`);
    }
  }
};

const main = () => {
  const argv = process.argv.slice(2);
  let jsonOut = null;
  const targets = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') {
      jsonOut = argv[i + 1];
      i += 1;
    } else {
      targets.push(argv[i]);
    }
  }

  const files = targets.length ? targets : DEFAULT_TARGETS;
  const reports = files.map(auditFile);
  reports.forEach(print);

  // 同一内容ファイルの検出（正本がどれか判断するため）
  const byHash = new Map();
  for (const report of reports) {
    if (!report.sha256) continue;
    if (!byHash.has(report.sha256)) byHash.set(report.sha256, []);
    byHash.get(report.sha256).push(report.file);
  }
  const identical = [...byHash.values()].filter((group) => group.length > 1);
  console.log('\n=== 内容が同一のファイル ===');
  if (identical.length === 0) {
    console.log('  なし');
  } else {
    for (const group of identical) console.log(`  ${group.join(' == ')}`);
  }

  const failures = reports.filter((report) => !report.ok);
  console.log(`\n監査対象 ${reports.length} 件 / 異常 ${failures.length} 件`);

  if (jsonOut) {
    const outPath = path.isAbsolute(jsonOut) ? jsonOut : path.join(ROOT, jsonOut);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify({ reports, identical }, null, 2)}\n`);
    console.log(`レポートを書き出しました: ${path.relative(ROOT, outPath)}`);
  }

  process.exitCode = failures.length ? 1 : 0;
};

main();
