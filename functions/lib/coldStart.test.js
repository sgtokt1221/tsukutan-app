/*
  起動の重さの番人（2026-10-31）。

  index.js は**どの関数も起きるたびに丸ごと読む**。先頭で Vertex AI・Translation を
  読むと、初めての生徒の入場（exchangeTsukubaToken）のコールドスタートまで重くなる。
  使う関数の中で読むこと（Speech-to-Text の getSpeechClient と同じ形）。
*/
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const HEAVY = ['@google-cloud/vertexai', '@google-cloud/translate', '@google-cloud/speech'];

/** 字下げ無しの行（＝ファイルの先頭で走る行）で読んでいるか */
const topLevelRequires = (pkg) => source
  .split('\n')
  .filter((line) => /^\S/.test(line) && line.includes(`require('${pkg}')`));

describe('functions/index.js の起動', () => {
  test.each(HEAVY)('%s をファイルの先頭で読まない', (pkg) => {
    expect(topLevelRequires(pkg)).toEqual([]);
  });

  test('使う場所では読んでいる（消してしまっていない）', () => {
    for (const pkg of HEAVY) expect(source).toContain(`require('${pkg}')`);
  });

  test('入場は入場券と生徒の記録を同時に作り、両方を待つ', () => {
    const body = source.slice(source.indexOf('exports.exchangeTsukubaToken'));
    const end = body.indexOf('\n});');
    const fn = body.slice(0, end);
    expect(fn).toMatch(/await Promise\.all\(\[\s*admin\.auth\(\)\.createCustomToken\(decoded\.uid\),\s*ensureStudentProfile\(db, decoded\),\s*\]\)/);
  });
});
