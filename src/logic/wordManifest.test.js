/**
 * **単語データの目録（manifest.json）が、今のファイルと一致していること**（2026-09-24）。
 *
 * 端末は manifest の sha256 を鍵に単語データを保存する。データを書き換えても manifest が古いと、
 * 鍵が変わらないので端末は古いデータを使い続ける（エラーは出ない）。words-master が
 * 7,949語の版の鍵のまま 8,160語になっていた。
 *
 * 赤くなったら：`npm run build:manifest`（データは作り直さず、目録だけ合わせる）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', '..', 'public', 'data');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));

describe('単語データの目録', () => {
  for (const [name, entry] of Object.entries(manifest.files)) {
    test(`${name} の件数・sha256 が今のファイルと同じ`, () => {
      const text = fs.readFileSync(path.join(DIR, name), 'utf8');
      const data = JSON.parse(text);
      const count = Array.isArray(data) ? data.length : Object.keys(data).length;
      expect({ count, sha256: crypto.createHash('sha256').update(text).digest('hex') })
        .toEqual({ count: entry.count, sha256: entry.sha256 });
    });
  }
});
