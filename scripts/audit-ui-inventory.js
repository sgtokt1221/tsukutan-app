#!/usr/bin/env node
/**
 * scripts/audit-ui-inventory.js
 *
 * UIの実態を数える読み取り専用スクリプト。DESIGN_POLISH_PLAN.md の D0 用。
 *
 *   node scripts/audit-ui-inventory.js
 *   node scripts/audit-ui-inventory.js --json docs/baseline/ui-inventory.json
 *
 * 何も書き換えない。デザイン作業の前後で同じ数字を比べるために使う。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CSS_FILES = ['src/index.css', 'src/App.css', 'src/AdminDashboard.css', 'src/Analytics.css'];

const readIfExists = (rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
};

const jsxFiles = () => {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === '__mocks__') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.jsx?$/.test(entry.name) && !/\.(test|spec)\.jsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  return out;
};

const tally = (values) => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

const main = () => {
  const argv = process.argv.slice(2);
  const jsonIndex = argv.indexOf('--json');
  const jsonOut = jsonIndex >= 0 ? argv[jsonIndex + 1] : null;

  const result = { css: {}, jsx: {} };
  let allCss = '';
  const selectorsByFile = new Map();

  console.log('=== CSSファイル ===');
  for (const rel of CSS_FILES) {
    const text = readIfExists(rel);
    if (text == null) { console.log(`  ${rel} (なし)`); continue; }
    allCss += `\n${text}`;
    const selectors = [...text.matchAll(/^([.#][A-Za-z0-9_-][^{,\n]*?)\s*\{/gm)].map((m) => m[1].trim());
    selectorsByFile.set(rel, selectors);
    console.log(`  ${rel.padEnd(28)} ${String(text.split('\n').length).padStart(5)}行  セレクタ ${selectors.length}`);
  }

  // 同じセレクタが複数ファイルに出るもの
  const owners = new Map();
  for (const [file, selectors] of selectorsByFile) {
    for (const selector of new Set(selectors)) {
      if (!owners.has(selector)) owners.set(selector, []);
      owners.get(selector).push(file);
    }
  }
  const crossFile = [...owners.entries()].filter(([, files]) => files.length > 1);
  result.css.crossFileSelectors = crossFile.map(([selector, files]) => ({ selector, files }));

  console.log('\n=== 複数CSSファイルに同じセレクタ ===');
  console.log(`  ${crossFile.length} 件`);
  for (const [selector, files] of crossFile.slice(0, 12)) {
    console.log(`    ${selector}  →  ${files.map((f) => path.basename(f)).join(', ')}`);
  }

  const hexes = tally((allCss.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map((h) => h.toLowerCase()));
  const rgbas = tally(allCss.match(/rgba?\([^)]*\)/g) || []);
  const radii = tally(allCss.match(/border-radius:\s*[^;]+/g) || []).map(([v, n]) => [v.replace(/\s+/g, ' '), n]);
  const shadows = tally(allCss.match(/box-shadow:\s*[^;]+/g) || []).map(([v, n]) => [v.replace(/\s+/g, ' '), n]);
  const fontSizes = tally(allCss.match(/font-size:\s*[^;]+/g) || []).map(([v, n]) => [v.replace(/\s+/g, ' '), n]);

  result.css.uniqueHexColors = hexes.length;
  result.css.uniqueRgba = rgbas.length;
  result.css.uniqueRadius = radii.length;
  result.css.uniqueShadow = shadows.length;
  result.css.uniqueFontSize = fontSizes.length;
  result.css.hexColors = hexes;

  console.log('\n=== 値のばらつき ===');
  console.log(`  16進の色    : ${hexes.length} 種類`);
  console.log(`  rgba        : ${rgbas.length} 種類`);
  console.log(`  border-radius: ${radii.length} 種類`);
  console.log(`  box-shadow  : ${shadows.length} 種類`);
  console.log(`  font-size   : ${fontSizes.length} 種類`);
  console.log(`  よく使う色  : ${hexes.slice(0, 8).map(([c, n]) => `${c}(${n})`).join(' ')}`);

  console.log('\n=== JSX 内の直接指定 ===');
  let inlineTotal = 0;
  const perFile = [];
  for (const file of jsxFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    const count = (text.match(/style=\{\{/g) || []).length;
    if (count === 0) continue;
    inlineTotal += count;
    perFile.push({ file: path.relative(ROOT, file), count });
  }
  perFile.sort((a, b) => b.count - a.count);
  result.jsx.inlineStyleTotal = inlineTotal;
  result.jsx.inlineStyleByFile = perFile;
  for (const row of perFile) console.log(`  ${String(row.count).padStart(4)}  ${row.file}`);
  console.log(`  合計 ${inlineTotal} 箇所`);

  // window.innerWidth による描画分岐（計画書13.2で廃止対象）
  const widthBranches = [];
  for (const file of jsxFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/window\.innerWidth/.test(line)) widthBranches.push(`${path.relative(ROOT, file)}:${i + 1}`);
    });
  }
  result.jsx.windowInnerWidth = widthBranches;
  console.log(`\n=== window.innerWidth による分岐（廃止対象） ===`);
  console.log(`  ${widthBranches.length} 箇所` + (widthBranches.length ? `: ${widthBranches.slice(0, 6).join(', ')}` : ''));

  if (jsonOut) {
    const outPath = path.isAbsolute(jsonOut) ? jsonOut : path.join(ROOT, jsonOut);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`\nレポート: ${path.relative(ROOT, outPath)}`);
  }
};

main();
