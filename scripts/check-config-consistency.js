#!/usr/bin/env node
/**
 * scripts/check-config-consistency.js
 *
 * 目標ID・教材ID・コレクション名・環境変数の食い違いを洗い出す読み取り専用スクリプト。
 * 何も書き換えないので、いつ実行しても安全。
 *
 *   node scripts/check-config-consistency.js
 *   node scripts/check-config-consistency.js --json docs/baseline/config-consistency.json
 *
 * 検査項目（IMPLEMENTATION_PLAN.md 5.3）
 *   1. 目標IDの参照漏れ  — setupMasterData.js の goalsMaster 定義を正本とし、
 *                          コード内の目標IDリテラルで正本に無いものを検出する
 *   2. 教材IDの参照漏れ  — Firestore の textbooks/{id} を実際に読むIDと、
 *                          画面のコース定義が指すIDを突き合わせる
 *   3. コレクション名    — 大文字小文字違いの衝突と、スキーマ外の名前を検出する
 *   4. 環境変数          — コードが参照する REACT_APP_* と .env のキーを突き合わせる
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// CLAUDE.md「4. Database Schema」に記載のコレクション名
const KNOWN_COLLECTIONS = new Set([
  'users',
  'logs',
  'reviewWords',
  'dailyPlans',
  'freeStudyProgress',
  'generatedStories',
  'goalsMaster',
  'textbooks',
  'words',
]);

// Firestore に実体がある教材（textbooks/{id}/words）
const KNOWN_TEXTBOOKS = new Set(['osaka-koukou-nyuushi', 'highschool-english']);

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.jsx?$/.test(entry.name)) out.push(full);
  }
  return out;
};

const sourceFiles = () => {
  const files = [...walk(path.join(ROOT, 'src'))];
  const functionsIndex = path.join(ROOT, 'functions', 'index.js');
  if (fs.existsSync(functionsIndex)) files.push(functionsIndex);
  return files;
};

const readAll = () =>
  sourceFiles().map((file) => ({
    file: path.relative(ROOT, file),
    lines: fs.readFileSync(file, 'utf8').split('\n'),
  }));

/** ソース全体を行単位で走査し、正規表現の1番目のキャプチャを出現箇所つきで集める */
const collect = (sources, pattern) => {
  const found = new Map();
  for (const { file, lines } of sources) {
    lines.forEach((line, index) => {
      const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const value = match[1];
        if (!found.has(value)) found.set(value, []);
        found.get(value).push(`${file}:${index + 1}`);
      }
    });
  }
  return found;
};

const canonicalGoalIds = () => {
  const file = path.join(ROOT, 'setupMasterData.js');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const ids = [...text.matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*data:/g)].map((m) => m[1]);
  return new Set(ids);
};

const envKeys = () => {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return new Set();
  return new Set(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => line.slice(0, line.indexOf('=')).trim())
  );
};

const main = () => {
  const argv = process.argv.slice(2);
  const jsonIndex = argv.indexOf('--json');
  const jsonOut = jsonIndex >= 0 ? argv[jsonIndex + 1] : null;

  const sources = readAll();
  const problems = [];
  const result = {};

  // --- 1. 目標ID ---
  const canonical = canonicalGoalIds();
  // 目標IDらしき文字列リテラル。単語データの eikenLevels 等と衝突しない形に絞る。
  const goalLike = collect(sources, /['"]((?:eiken|hs|uni)(?:_[a-z0-9]+|[0-9]+))['"]/);
  const unknownGoalIds = [...goalLike.entries()].filter(([id]) => canonical && !canonical.has(id));
  const unreferencedGoalIds = canonical ? [...canonical].filter((id) => !goalLike.has(id)) : [];

  result.goals = {
    canonical: canonical ? [...canonical] : null,
    unknown: Object.fromEntries(unknownGoalIds),
    unreferenced: unreferencedGoalIds,
  };

  console.log('=== 1. 目標ID ===');
  if (!canonical) {
    console.log('  setupMasterData.js が見つからないため正本を特定できません');
  } else {
    console.log(`  正本 (setupMasterData.js): ${canonical.size} 件`);
    if (unknownGoalIds.length === 0) {
      console.log('  正本に無い目標ID: なし');
    } else {
      problems.push(`正本に存在しない目標IDが ${unknownGoalIds.length} 種類使われています`);
      console.log(`  正本に無い目標ID: ${unknownGoalIds.length} 種類`);
      for (const [id, locations] of unknownGoalIds) {
        console.log(`    - '${id}'  ${locations.join(', ')}`);
      }
    }
    if (unreferencedGoalIds.length) {
      console.log(`  コードから参照されていない目標ID: ${unreferencedGoalIds.join(', ')}`);
    }
  }

  // --- 2. 教材ID ---
  // Firestore を実際に読む側
  const textbookReads = collect(sources, /collection\(\s*db\s*,\s*'textbooks'\s*,\s*([A-Za-z0-9_]+)/);
  // 画面のコース定義が指す側
  const declaredTextbooks = collect(sources, /textbooks:\s*\[\s*'([^']+)'/);
  const textbookLiterals = collect(sources, /['"](osaka-koukou-nyuushi|highschool-english|[a-z]+-koukou-[a-z]+)['"]/);
  const unknownTextbooks = [...declaredTextbooks.entries()].filter(([id]) => !KNOWN_TEXTBOOKS.has(id));

  result.textbooks = {
    known: [...KNOWN_TEXTBOOKS],
    declared: Object.fromEntries(declaredTextbooks),
    unknown: Object.fromEntries(unknownTextbooks),
    readVariables: [...textbookReads.keys()],
    literalUsage: Object.fromEntries([...textbookLiterals].map(([id, loc]) => [id, loc.length])),
  };

  console.log('\n=== 2. 教材ID ===');
  console.log(`  実体のある教材: ${[...KNOWN_TEXTBOOKS].join(', ')}`);
  console.log(`  コース定義が指す教材: ${[...declaredTextbooks.keys()].join(', ') || 'なし'}`);
  if (unknownTextbooks.length === 0) {
    console.log('  実体の無い教材への参照: なし');
  } else {
    problems.push(`実体の無い教材IDが ${unknownTextbooks.length} 種類参照されています`);
    for (const [id, locations] of unknownTextbooks) {
      console.log(`    - '${id}'  ${locations.join(', ')}`);
    }
  }
  for (const [id, locations] of textbookLiterals) {
    console.log(`  '${id}' のハードコード箇所: ${locations.length} 箇所`);
  }

  // --- 3. コレクション名 ---
  // collection(db, 'users', uid, 'logs') のようにサブコレクション名も拾うため、
  // collection(...) / .collection(...) の引数に現れる文字列リテラルをすべて集める。
  const collections = collect(sources, /(?:\.|\b)collection\(([^)]*)\)/);
  for (const [args, locations] of [...collections]) {
    collections.delete(args);
    for (const literal of args.matchAll(/['"]([A-Za-z][A-Za-z0-9_]*)['"]/g)) {
      const name = literal[1];
      if (!collections.has(name)) collections.set(name, []);
      collections.get(name).push(...locations);
    }
  }
  const byLower = new Map();
  for (const name of collections.keys()) {
    const key = name.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, []);
    byLower.get(key).push(name);
  }
  const caseCollisions = [...byLower.values()].filter((group) => group.length > 1);
  const unknownCollections = [...collections.keys()].filter((name) => !KNOWN_COLLECTIONS.has(name));

  result.collections = {
    found: Object.fromEntries([...collections].map(([name, loc]) => [name, loc.length])),
    caseCollisions,
    unknown: unknownCollections,
  };

  console.log('\n=== 3. コレクション名 ===');
  console.log(`  検出: ${[...collections.keys()].sort().join(', ') || 'なし'}`);
  if (caseCollisions.length) {
    problems.push(`大文字小文字だけ違うコレクション名があります: ${caseCollisions.map((g) => g.join(' / ')).join(', ')}`);
    for (const group of caseCollisions) console.log(`  大小文字の衝突: ${group.join(' / ')}`);
  } else {
    console.log('  大小文字の衝突: なし');
  }
  if (unknownCollections.length) {
    console.log(`  スキーマ未記載: ${unknownCollections.join(', ')}`);
  }

  // --- 4. 環境変数 ---
  const referenced = collect(sources, /process\.env\.(REACT_APP_[A-Z0-9_]+)/);
  // `process.env.X || 'https://...'` のように既定値があるものは即座の障害にはならない
  const withFallback = collect(sources, /process\.env\.(REACT_APP_[A-Z0-9_]+)\s*\|\|/);
  const defined = envKeys();
  const missingInEnv = [...referenced.keys()].filter((key) => !defined.has(key) && !withFallback.has(key));
  const fallbackOnly = [...referenced.keys()].filter((key) => !defined.has(key) && withFallback.has(key));
  const unusedInEnv = [...defined].filter((key) => key.startsWith('REACT_APP_') && !referenced.has(key));

  result.env = {
    referenced: Object.fromEntries(referenced),
    defined: [...defined],
    missingInEnv,
    fallbackOnly,
    unusedInEnv,
  };

  console.log('\n=== 4. 環境変数 ===');
  console.log(`  .env 定義       : ${[...defined].join(', ') || 'なし'}`);
  console.log(`  コード参照      : ${[...referenced.keys()].join(', ') || 'なし'}`);
  if (missingInEnv.length) {
    problems.push(`.env に定義が無く既定値も無い環境変数を参照しています: ${missingInEnv.join(', ')}`);
    for (const key of missingInEnv) {
      console.log(`  未定義（既定値なし）: ${key}  ${referenced.get(key).join(', ')}`);
    }
  }
  for (const key of fallbackOnly) {
    console.log(`  未定義（コード内の既定値で動作）: ${key}  ${referenced.get(key).join(', ')}`);
  }
  if (unusedInEnv.length) {
    console.log(`  未使用: ${unusedInEnv.join(', ')}`);
  }

  console.log('\n=== 判定 ===');
  if (problems.length === 0) {
    console.log('  不整合なし');
  } else {
    problems.forEach((message, index) => console.log(`  ${index + 1}. ${message}`));
  }

  if (jsonOut) {
    const outPath = path.isAbsolute(jsonOut) ? jsonOut : path.join(ROOT, jsonOut);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify({ problems, ...result }, null, 2)}\n`);
    console.log(`\nレポートを書き出しました: ${path.relative(ROOT, outPath)}`);
  }

  process.exitCode = problems.length ? 1 : 0;
};

main();
