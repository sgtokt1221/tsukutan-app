#!/usr/bin/env node
/**
 * ビルドのあとに build/version.json を書く（2026-09-27）。中身は本体の JS のファイル名（ハッシュ入り）。
 * 開いたままの画面が「新しい版が出たか」を見比べるのに使う（src/logic/versionCheck.js）。
 * npm run build が自動で呼ぶ（package.json の build）。
 */
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '..', 'build');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'asset-manifest.json'), 'utf8'));
const mainJs = path.basename(manifest.files['main.js']);
fs.writeFileSync(path.join(dir, 'version.json'), `${JSON.stringify({ mainJs, builtAt: new Date().toISOString() })}\n`);
console.log(`version.json: ${mainJs}`);
