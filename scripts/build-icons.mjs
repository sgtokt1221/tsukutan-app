/**
 * ホーム画面（PWA）のアイコンを作る。
 *
 * **正本は `public/tsukutsuku-icon.svg`。** PNG は手で描き直さず、ここで作る。
 *
 * ## なぜ「角を丸めない」版が要るか
 * 元の SVG は角を丸めてある（`rx="140"`）ので、**角が透明**になる。
 * iOS はホーム画面のアイコンの透明部分を**黒で塗る**うえ、そのあと自分で角を丸める。
 * 結果、丸めた外側に黒い三角が残って壊れて見える。
 * ホーム画面へ渡すぶんは**四角のまま・透明なし**にして、丸めは OS に任せる。
 *
 * ## maskable
 * Android は `purpose: "maskable"` のアイコンを円や角丸で切り抜く。
 * 切られてよいのは外側2割なので、絵を8割に縮めて中央に置く。
 * 縮めないと、右上の光（`M407 48…`）が欠ける。
 *
 * ## 使い方
 *   node scripts/build-icons.mjs
 *   （rsvg-convert が要る: brew install librsvg）
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SOURCE = join(ROOT, 'public/tsukutsuku-icon.svg');
const OUT = join(ROOT, 'public');

const svg = readFileSync(SOURCE, 'utf8');
const work = mkdtempSync(join(tmpdir(), 'icons-'));

/** 角を丸めない（透明を作らない）版 */
const squared = svg.replace('rx="140"', 'rx="0"');

/** さらに絵を8割へ縮めた版。切り抜かれてよい外周を空ける */
const maskable = squared.replace(
  /(<rect width="512" height="512" rx="0" fill="#183153"\/>)/,
  '$1\n  <g transform="translate(51.2 51.2) scale(0.8)">',
).replace('</svg>', '  </g>\n</svg>');

/** @param {string} body @param {number} size @param {string} name */
const render = (body, size, name) => {
  const src = join(work, `${name}.svg`);
  const dst = join(OUT, name);
  writeFileSync(src, body);
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', dst, src]);
  return dst;
};

const made = [
  // iOS のホーム画面。180px・角は丸めない・透明なし
  render(squared, 180, 'apple-touch-icon.png'),
  // Android の切り抜き用
  render(maskable, 512, 'logo-maskable.png'),
];

console.log(made.map((p) => p.replace(ROOT, '')).join('\n'));
