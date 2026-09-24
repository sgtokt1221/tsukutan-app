#!/usr/bin/env node
/**
 * 単語データを元データから一続きで作り直す（`npm run build:words`）。**手順の正本はここだけ。**
 *
 *   node scripts/build-words.js           作り直して public/data/ へ書き込む
 *   node scripts/build-words.js --check   一時フォルダで作り直し、今のファイルと1バイトでも違えば exit 1
 *
 * ## なぜ一続きか（2026-09-24）
 * 以前は build-word-master.js だけが `build:words` で、テーマ・英検ライティング表現・
 * 品詞の統一・レベルの付け直しは**あとから別に**流していた。うっかり `build:words` を流すと
 * それらが黙って消え、熟語647語の id も変わる作りだった。
 * いまは下の手順を順に流せば、リポジトリの public/data/ と**バイト単位で同じもの**ができる
 * （2026-09-24 に一時フォルダで確かめた。`--check` がその番人）。
 *
 * 手順を足すときはここに足す。後から手で流す手順を作らない。
 * 本番 Firestore は触らない。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const STEPS = [
  ['build-word-master.js'], // 元データ → master / 大阪府 / 高校英語（id は今のファイルから引き継ぐ）
  ['normalizePartOfSpeech.js', '--write'], // 「熟」→「熟語」
  ['importWritingPhrases.js', '--write'], // 英検ライティング表現
  ['assignThemes.js', '--write'], // 意味のまとまり
  ['apply-textbook-eiken.js', '--write'], // 中学の語の英検の級を教科書の初出学年で（scripts/lib/textbookEiken.js）
  ['relevel-words.js', '--write'], // レベル1〜7（scripts/lib/relevel.js）。英検の級を使うので上の段のあと
  ['build-book-words.js'], // 単語帳4冊（master のレベルを借りる）
  ['refresh-word-manifest.js'], // 端末が読み直す目印
];

/** 手順が読むもの。--check はこれだけを一時フォルダへ写して流す */
const INPUTS = ['scripts', 'data-sources', 'public/data', 'public/words.json', 'words.json', 'highschool.json', 'src/config'];

const run = (root, quiet) => {
  for (const [script, ...args] of STEPS) {
    if (!quiet) console.log(`\n== ${script} ${args.join(' ')}`);
    execFileSync(process.execPath, [path.join(root, 'scripts', script), ...args], {
      cwd: root,
      stdio: quiet ? 'pipe' : 'inherit',
    });
  }
};

const check = () => {
  const root = path.join(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tsukutan-words-'));
  try {
    for (const rel of INPUTS) fs.cpSync(path.join(root, rel), path.join(tmp, rel), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'docs', 'baseline'), { recursive: true });
    run(tmp, true);
    const dir = 'public/data';
    const names = fs.readdirSync(path.join(root, dir)).filter((name) => name.endsWith('.json'));
    const differ = names.filter((name) => !fs.readFileSync(path.join(root, dir, name)).equals(fs.readFileSync(path.join(tmp, dir, name))));
    if (differ.length) {
      console.log('作り直すと変わるファイル:');
      differ.forEach((name) => console.log(`  ${dir}/${name}`));
      console.log('元データか手順が、今のファイルとずれています。npm run build:words で作り直してから差分を確かめてください。');
      process.exitCode = 1;
    } else {
      console.log(`作り直しても同じです（${names.length}ファイル）。`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

if (process.argv.includes('--check')) check();
else run(path.join(__dirname, '..'), false);
