#!/usr/bin/env node
/**
 * scripts/check-design-tokens.js
 *
 * デザイントークンの約束が守られているかを機械的に確認する。
 * DESIGN_POLISH_PLAN.md の「色相固定は全フェーズのレビュー条件とする」(18章) 用。
 *
 *   node scripts/check-design-tokens.js
 *   node scripts/check-design-tokens.js --json docs/baseline/design-tokens.json
 *
 * 読み取り専用。CIやコミット前に流して、色が勝手に増えていないかを見る。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TOKENS_FILE = 'src/styles/tokens.css';
const SCREEN_CSS = ['src/App.css', 'src/AdminDashboard.css', 'src/Analytics.css'];

// 5.1 変更禁止の基準色。値そのものが一致すること。
const FIXED_COLORS = {
  '--color-brand-lime': '#a3e635',
  '--color-canvas-lime': '#f7fee7',
  '--color-ink-olive': '#36421e',
  '--color-accent-blue': '#3b82f6',
  '--color-surface': '#ffffff',
};

/** #rgb / #rrggbb を [h, s, l] にする。色相の比較に使う。 */
const hexToHsl = (hex) => {
  let value = hex.replace('#', '');
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
};

const read = (rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
};

const main = () => {
  const argv = process.argv.slice(2);
  const jsonIndex = argv.indexOf('--json');
  const jsonOut = jsonIndex >= 0 ? argv[jsonIndex + 1] : null;

  const problems = [];
  const result = {};

  const tokens = read(TOKENS_FILE);
  if (!tokens) {
    console.error(`${TOKENS_FILE} がありません。`);
    process.exit(1);
  }

  //--------------------------------------------------------------------------
  // 1. 変更禁止の基準色
  //--------------------------------------------------------------------------
  console.log('=== 1. 変更禁止の基準色 ===');
  const declared = {};
  for (const [name, expected] of Object.entries(FIXED_COLORS)) {
    const match = tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`));
    const actual = match ? match[1].toLowerCase() : null;
    declared[name] = actual;
    if (actual !== expected) {
      problems.push(`${name} が ${expected} から ${actual ?? '未定義'} に変わっています`);
      console.log(`  NG ${name}: ${actual ?? '未定義'}（期待 ${expected}）`);
    } else {
      const [hue] = hexToHsl(actual);
      console.log(`  OK ${name.padEnd(22)} ${actual}  色相 ${Math.round(hue)}°`);
    }
  }
  result.fixedColors = declared;

  //--------------------------------------------------------------------------
  // 2. 画面CSSに残る生の色（トークン化の進み具合）
  //--------------------------------------------------------------------------
  console.log('\n=== 2. 画面CSSに残る生の色 ===');
  const rawByFile = {};
  let rawTotal = 0;
  const allRaw = new Set();
  for (const rel of SCREEN_CSS) {
    const text = read(rel);
    if (text == null) continue;
    const hexes = (text.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map((h) => h.toLowerCase());
    rawByFile[rel] = { total: hexes.length, unique: new Set(hexes).size };
    hexes.forEach((h) => allRaw.add(h));
    rawTotal += hexes.length;
    console.log(`  ${rel.padEnd(28)} 出現 ${String(hexes.length).padStart(4)}  種類 ${new Set(hexes).size}`);
  }
  result.rawHexInScreenCss = { byFile: rawByFile, total: rawTotal, unique: allRaw.size };
  console.log(`  合計 出現 ${rawTotal} / 種類 ${allRaw.size}`);
  console.log('  ※ この数字が工程ごとに減っていくことを確認する（増えたら差し戻し）');

  //--------------------------------------------------------------------------
  // 3. 基準色と同じ色相なのにトークンを使っていない色
  //--------------------------------------------------------------------------
  console.log('\n=== 3. 基準色に近い色相の直接指定 ===');
  const brandHues = Object.entries(FIXED_COLORS)
    .filter(([, hex]) => hex !== '#ffffff')
    .map(([name, hex]) => ({ name, hue: hexToHsl(hex)[0] }));

  const nearBrand = [];
  for (const hex of allRaw) {
    const [hue, saturation] = hexToHsl(hex);
    if (saturation < 0.15) continue; // 無彩色に近いものは対象外
    for (const brand of brandHues) {
      if (Math.abs(hue - brand.hue) <= 12 && hex !== FIXED_COLORS[brand.name]) {
        nearBrand.push({ hex, near: brand.name, hue: Math.round(hue) });
        break;
      }
    }
  }
  result.nearBrandColors = nearBrand;
  console.log(`  ${nearBrand.length} 種類`);
  for (const item of nearBrand.slice(0, 12)) {
    console.log(`    ${item.hex}  色相${item.hue}°  → ${item.near} の近似`);
  }
  if (nearBrand.length > 0) {
    console.log('  ※ 基準色に寄せられるものはトークンへ置き換える');
  }

  //--------------------------------------------------------------------------
  // 4. トークン外の角丸・影
  //--------------------------------------------------------------------------
  console.log('\n=== 4. 角丸と影のばらつき ===');
  let radiusCount = 0;
  let shadowCount = 0;
  for (const rel of SCREEN_CSS) {
    const text = read(rel);
    if (text == null) continue;
    radiusCount += (text.match(/border-radius:\s*(?!var\()[^;]+/g) || []).length;
    shadowCount += (text.match(/box-shadow:\s*(?!var\(|none)[^;]+/g) || []).length;
  }
  result.rawRadius = radiusCount;
  result.rawShadow = shadowCount;
  console.log(`  var() を使わない border-radius: ${radiusCount} 箇所`);
  console.log(`  var() を使わない box-shadow  : ${shadowCount} 箇所`);

  //--------------------------------------------------------------------------
  console.log('\n=== 判定 ===');
  if (problems.length === 0) {
    console.log('  基準色は維持されている');
  } else {
    problems.forEach((message, i) => console.log(`  ${i + 1}. ${message}`));
  }

  if (jsonOut) {
    const outPath = path.isAbsolute(jsonOut) ? jsonOut : path.join(ROOT, jsonOut);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify({ problems, ...result }, null, 2)}\n`);
    console.log(`\nレポート: ${path.relative(ROOT, outPath)}`);
  }

  process.exitCode = problems.length ? 1 : 0;
};

main();
