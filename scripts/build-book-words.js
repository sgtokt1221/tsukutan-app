#!/usr/bin/env node
/**
 * scripts/build-book-words.js
 *
 * 市販の単語帳（受験サポートの小テストと同じ収録語）を、つくつくのカードの形に直す。
 *
 *   node scripts/build-book-words.js          # 生成
 *   node scripts/build-book-words.js --check  # 差分があるかだけ見る（書き込まない）
 *
 * 入力
 *   data-sources/exam-support-decks/*.json   `{no, en, ja}`。正本はつくばホーム
 *   public/data/words-master.json            例文・発音・品詞を借りる相手
 *
 * 出力
 *   public/data/words-book-<deckId>.json
 *
 * ## 訳は本のものが正
 *
 * 生徒は**その本を開いて覚えている**ので、アプリだけ別の訳を出すと混乱する。
 * つくつくのマスタから借りるのは**例文・発音・品詞・テーマ**だけ。
 *
 * ## 綴りが1件だけ一致するときにしか借りない
 *
 * `close`（動/形/副）のように、同じ綴りでマスタに複数ある語がある。
 * そこから適当に1つ借りると、**別の意味の例文が付く**（本文と噛み合わない
 * 例文が出るのは、何も出ないより悪い）。実測の一致率は
 * シス単 68% / ターゲット1900 78% / LEAP 71% / 英熟語 54%。
 *
 * ## 本だけの語に level を付けない
 *
 * 学習すると `users/{uid}/reviewWords` に載る（`src/logic/reviewLogic.js`）。
 * 到達語数（`src/logic/vocabularyCount.js`）と見積もりレベル
 * （`src/logic/estimatedLevel.js`）は、**分母をマスタのレベル別語数**に取りつつ
 * **分子を reviewWords** から数える。マスタに無い語に level を付けると
 * 分子だけが増え、比率が1を超えて「レベル6相当です」と誤って出る。
 * level が無ければどちらの式からも外れる（安全側）。
 *
 * ## undefined の欄を作らない
 *
 * `reviewLogic.js` が `{...word}` をそのまま `setDoc` する。undefined が1つでも
 * 混じると**書き込みごと拒否**され、採点が黙って保存されなくなる。
 * 持たせない欄は**キーごと入れない**。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DECK_DIR = path.join(ROOT, 'data-sources', 'exam-support-decks');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const MASTER = path.join(OUT_DIR, 'words-master.json');

/**
 * IDの名前空間。**`build-word-master.js` の `'tsukutan'` と分ける。**
 * 混ぜると、同じ署名から別の語に同じIDが出る恐れがある。
 */
const ID_SOURCE = 'exam-support';

/** マスタから借りてよい欄。**訳（meaning）と綴り（word）は借りない** */
const BORROW = ['level', 'partOfSpeech', 'theme', 'example', 'exampleJa', 'pronunciation'];

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

/** 本だけの語のID。**本と番号から決まる**ので、並べ替えても変わらない */
const idOf = (deckId, no) =>
  `w_${crypto.createHash('sha256').update(`${ID_SOURCE}|${deckId}|${no}`).digest('hex').slice(0, 16)}`;

/** 綴り → マスタの札。**1件のときだけ借りる**ので配列で持つ */
const indexMaster = (master) => {
  const by = new Map();
  for (const w of master) {
    const key = norm(w.word);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(w);
  }
  return by;
};

const cardOf = (deckId, entry, byWord) => {
  const card = {
    id: idOf(deckId, entry.no),
    word: String(entry.en),
    // **本の訳が正。** マスタの訳で上書きしない
    meaning: String(entry.ja),
    no: entry.no,
    // 品詞タブの `word.partOfSpeech.includes()` は無防備なので、空でも必ず置く
    partOfSpeech: '',
  };

  const found = byWord.get(norm(entry.en)) || [];
  if (found.length !== 1) return card;

  // 綴りが1件だけ一致した。**IDもマスタのものを使う**——同じ語を本と
  // マスタで別々に覚え直させない（復習の間隔が2本に割れる）
  const m = found[0];
  card.id = m.id;
  for (const key of BORROW) {
    if (m[key] === undefined || m[key] === null || m[key] === '') continue;
    card[key] = m[key];
  }
  return card;
};

const main = () => {
  const check = process.argv.includes('--check');

  if (!fs.existsSync(DECK_DIR)) {
    console.error(`× ${DECK_DIR} がありません。先に node scripts/import-exam-support-decks.js`);
    return 1;
  }
  const master = JSON.parse(fs.readFileSync(MASTER, 'utf8'));
  const byWord = indexMaster(master);

  const decks = fs.readdirSync(DECK_DIR).filter((f) => f.endsWith('.json')).sort();
  let changed = 0;

  for (const file of decks) {
    const deck = JSON.parse(fs.readFileSync(path.join(DECK_DIR, file), 'utf8'));
    const cards = deck.words.map((entry) => cardOf(deck.deckId, entry, byWord));

    // **番号順のまま出す。** 本を開いて「301〜400」と進むので、並べ替えない
    const borrowed = cards.filter((c) => c.example !== undefined).length;
    const text = `${JSON.stringify(cards, null, 2)}\n`;
    const out = path.join(OUT_DIR, `words-book-${deck.deckId}.json`);
    const before = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;

    const note = `${deck.deckId.padEnd(18)} ${String(cards.length).padStart(5)}語  例文あり ${borrowed}（${Math.round((borrowed / cards.length) * 100)}%）`;
    if (before === text) {
      console.log(`  ${note}  そのまま`);
      continue;
    }
    changed += 1;
    console.log(`${check ? '差分' : '更新'}  ${note}`);
    if (!check) fs.writeFileSync(out, text);
  }

  if (check && changed > 0) {
    console.error(`\n${changed}件ずれています。 node scripts/build-book-words.js で作り直してください。`);
    return 1;
  }
  return 0;
};

process.exit(main());
