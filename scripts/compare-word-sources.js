#!/usr/bin/env node
/**
 * scripts/compare-word-sources.js
 *
 * 単語データの出どころを照合して、どれを正本にすべきか判断する材料を出す。
 * 読み取り専用。IMPLEMENTATION_PLAN.md 9.2 用。
 *
 *   node scripts/compare-word-sources.js
 *   node scripts/compare-word-sources.js --json docs/baseline/word-source-comparison.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SOURCES = [
  { key: 'words', file: 'words.json' },
  { key: 'wordsData', file: 'src/wordsData.json' },
  { key: 'public', file: 'public/words.json' },
  { key: 'highschool', file: 'highschool.json' },
];

const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

/** 意味違いの同綴語を潰さないための識別キー */
const signatureOf = (entry) =>
  [normalize(entry.word), normalize(entry.partOfSpeech), normalize(entry.meaning)].join('|');

/** レベルまで含めた完全一致キー */
const fullSignatureOf = (entry) => `${signatureOf(entry)}|${entry.level}`;

const load = ({ key, file }) => {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return { key, file, missing: true, entries: [] };
  return { key, file, entries: JSON.parse(fs.readFileSync(abs, 'utf8')) };
};

const setOf = (entries, keyFn) => new Set(entries.map(keyFn));

const main = () => {
  const argv = process.argv.slice(2);
  const jsonIndex = argv.indexOf('--json');
  const jsonOut = jsonIndex >= 0 ? argv[jsonIndex + 1] : null;

  const sources = SOURCES.map(load).filter((source) => !source.missing);
  const result = { sources: {}, containment: [], levelConflicts: [], onlyIn: {} };

  console.log('=== 各ファイルの規模 ===');
  for (const source of sources) {
    const bySignature = setOf(source.entries, signatureOf);
    const byFull = setOf(source.entries, fullSignatureOf);
    result.sources[source.key] = {
      file: source.file,
      entries: source.entries.length,
      uniqueSignatures: bySignature.size,
      uniqueFullSignatures: byFull.size,
      levels: [...new Set(source.entries.map((e) => e.level))].sort((a, b) => a - b),
    };
    console.log(
      `  ${source.file.padEnd(22)} ${String(source.entries.length).padStart(5)}件` +
      `  ユニーク(語+品詞+意味) ${String(bySignature.size).padStart(5)}` +
      `  レベル ${result.sources[source.key].levels.join(',')}`
    );
  }

  // 包含関係: A の署名がすべて B に含まれるか
  console.log('\n=== 包含関係（語+品詞+意味 で判定） ===');
  for (const a of sources) {
    for (const b of sources) {
      if (a.key === b.key) continue;
      const aSet = setOf(a.entries, signatureOf);
      const bSet = setOf(b.entries, signatureOf);
      const missing = [...aSet].filter((sig) => !bSet.has(sig));
      const coverage = aSet.size === 0 ? 0 : ((aSet.size - missing.length) / aSet.size) * 100;
      const record = {
        from: a.file,
        into: b.file,
        fromUnique: aSet.size,
        missingInTarget: missing.length,
        coveragePercent: Number(coverage.toFixed(1)),
        samples: missing.slice(0, 5),
      };
      result.containment.push(record);
      if (missing.length === 0) {
        console.log(`  ${a.file} ⊆ ${b.file}  （${aSet.size}件すべて含まれる）`);
      } else if (coverage >= 90) {
        console.log(`  ${a.file} → ${b.file}  ${coverage.toFixed(1)}% 含まれる（${missing.length}件が不足）`);
      }
    }
  }

  // 同じ語+品詞+意味なのにレベルが違うものを洗い出す
  console.log('\n=== ファイル間でレベルが食い違う項目 ===');
  const levelBySignature = new Map();
  for (const source of sources) {
    for (const entry of source.entries) {
      const sig = signatureOf(entry);
      if (!levelBySignature.has(sig)) levelBySignature.set(sig, new Map());
      const perFile = levelBySignature.get(sig);
      if (!perFile.has(source.key)) perFile.set(source.key, new Set());
      perFile.get(source.key).add(entry.level);
    }
  }
  for (const [sig, perFile] of levelBySignature) {
    const levels = new Set([...perFile.values()].flatMap((set) => [...set]));
    if (levels.size > 1) {
      result.levelConflicts.push({
        signature: sig,
        levels: [...levels].sort((a, b) => a - b),
        byFile: Object.fromEntries([...perFile].map(([key, set]) => [key, [...set].sort((a, b) => a - b)])),
      });
    }
  }
  console.log(`  ${result.levelConflicts.length} 件`);
  for (const conflict of result.levelConflicts.slice(0, 10)) {
    const detail = Object.entries(conflict.byFile).map(([key, levels]) => `${key}=${levels.join('/')}`).join(' ');
    console.log(`    - ${conflict.signature.split('|').slice(0, 3).join(' / ')}  ${detail}`);
  }

  // どのファイルにしか無い項目か
  console.log('\n=== そのファイルにしか無い項目 ===');
  for (const source of sources) {
    const others = sources.filter((other) => other.key !== source.key);
    const otherSignatures = new Set(others.flatMap((other) => other.entries.map(signatureOf)));
    const unique = [...setOf(source.entries, signatureOf)].filter((sig) => !otherSignatures.has(sig));
    result.onlyIn[source.key] = { count: unique.length, samples: unique.slice(0, 5) };
    console.log(`  ${source.file.padEnd(22)} ${String(unique.length).padStart(5)}件`);
  }

  if (jsonOut) {
    const outPath = path.isAbsolute(jsonOut) ? jsonOut : path.join(ROOT, jsonOut);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\nレポートを書き出しました: ${path.relative(ROOT, outPath)}`);
  }
};

main();
