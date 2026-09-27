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
 * ## 同じ綴りが複数あるときは、本の訳にいちばん近い意味から借りる（2026-09-26）
 *
 * `increase` のように**同じ意味で2件あるだけ**の語まで外していた（シス単で256語）。
 * 訳の近さ（2文字ずつの重なり）で1つに決まるときだけ借りる——別の品詞の候補が
 * 同じくらい近ければ決めない（`close` の「閉める」に「近い」の例文を付けない）。
 *
 * ## どこにも例文が無い語は、手で書いた例文を使う（2026-09-26）
 *
 * マスタに無い語（respond / acquire / a piece of ～ …）は `data-sources/book-examples/<deckId>.json`
 * （番号 → 例文・和訳）から付ける。**API で作らず、会話の中で書いた**もの（沖藤さんの指定）。
 * 本の訳の意味で書いてある。**出所は `exampleSource: 'written'` で残す**（借りたものと見分ける）。
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
/**
 * 英検の でる順パス単（2級・準1級。2026-09-27）。受験サポートの小テストには無い本なので別の棚に置く
 * （上は `import-exam-support-decks.js` が書き直す）。形は同じ `{deckId, words: [{no, en, ja}]}`
 */
const EXTRA_DECK_DIR = path.join(ROOT, 'data-sources', 'passtan-decks');
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
const EXAMPLES_DIR = path.join(ROOT, 'data-sources', 'book-examples');

/** 訳の近さ。記号を除いた2文字ずつの重なりを、短い方の数で割る（0〜1） */
const meaningCloseness = (a, b) => {
  const grams = (s) => {
    const t = String(s || '').replace(/[～〜~、，,。（）()「」・\s]/g, '');
    const out = new Set();
    for (let i = 0; i < t.length - 1; i += 1) out.add(t.slice(i, i + 2));
    if (t.length === 1) out.add(t);
    return out;
  };
  const A = grams(a);
  const B = grams(b);
  let n = 0;
  for (const g of A) if (B.has(g)) n += 1;
  return n / Math.max(1, Math.min(A.size, B.size));
};

/**
 * 同じ綴りの候補から、本の訳にいちばん近いものを1つ選ぶ。決まらなければ null。
 * 近さ 0.5 未満は選ばない。**品詞の違う候補が 0.2 以内に迫っていれば選ばない**
 */
const pickByMeaning = (found, bookMeaning) => {
  const scored = found.map((m) => ({ m, s: meaningCloseness(m.meaning, bookMeaning) }))
    .sort((x, y) => y.s - x.s);
  const best = scored[0];
  if (!best || best.s < 0.5) return null;
  const rival = scored.slice(1).find((x) => x.m.partOfSpeech !== best.m.partOfSpeech && best.s - x.s < 0.2);
  return rival ? null : best.m;
};

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

/**
 * **意味を本から取らない単語帳**（英検5級パス単。2026-09-27）。索引から綴りと番号だけ起こしたので、
 * 意味・例文・レベル・id は単語データ（マスタ）の同じ語から取る。同じ綴りが複数あれば
 * 英検5級の印がある方 → やさしい方を選ぶ。**マスタの id を使う**（英検5級として覚えた記録がつながる）。
 * 1冊の中で同じ語に2回当たったら（you の主格・目的格など）、2回目は本の id にする（札が2枚重ならないように）
 */
const masterCardOf = (deckId, entry, byWord, usedIds, { eiken = null, written = {}, pools = [] } = {}) => {
  /*
    熟語は書き方を寄せてから引く：「～」、( ) の中（無くてもよい部分）、[ ] の中（言い換え）を外す
    （例: 「go (back) home」→「go home」、「start doing [to do]」→「start doing」）
  */
  const loose = String(entry.en).replace(/[～~]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const keys = [...new Set([entry.en, String(entry.en).split(',')[0], loose].map(norm))];
  /*
    **照合する順：単語データ（マスタ）→ 高校英語・大阪府 → 先に作った単語帳**（2026-09-27）。
    マスタに無い語（replace など）も、ほかの本に同じ語があればその札を使う（同じ語が本ごとに別の札に
    ならない＝覚えた記録が1つにまとまる）。どこにも無い語だけ新しく作る
  */
  let found = [];
  for (const pool of [byWord, ...pools]) {
    found = keys.map((k) => pool.get(k) || []).find((list) => list.length > 0) || [];
    if (found.length) break;
  }
  // 本の訳があれば、いちばん近い意味の語を先に見る（2級・準1級。5級は訳が無い）
  const byMeaning = entry.ja ? pickByMeaning(found, entry.ja) : null;
  const rank = (m) => [eiken && (m.eikenLevels || []).map(String).includes(eiken) ? 0 : 1, Number.isFinite(m.level) ? m.level : 99];
  const m = byMeaning || [...found].sort((a, b) => {
    const [a1, a2] = rank(a); const [b1, b2] = rank(b);
    return a1 - b1 || a2 - b2;
  })[0];
  // **単語データに無い語だけ、本の訳で新しい札を作る**（照合が先。2026-09-27 沖藤さんの指定）
  if (!m) return cardOf(deckId, entry, new Map(), written);
  const own = usedIds.has(m.id);
  const card = { id: own ? idOf(deckId, entry.no) : m.id, word: String(entry.en), meaning: m.meaning || '', no: entry.no, partOfSpeech: '' };
  for (const key of [...BORROW, 'exampleSource']) {
    if (own && key === 'level') continue;
    if (m[key] === undefined || m[key] === null || m[key] === '') continue;
    card[key] = m[key];
  }
  usedIds.add(card.id);
  return card;
};

const cardOf = (deckId, entry, byWord, written = {}) => {
  const card = {
    id: idOf(deckId, entry.no),
    word: String(entry.en),
    // **本の訳が正。** マスタの訳で上書きしない（訳を持たない本＝照合する本では空。下で埋める）
    meaning: entry.ja == null ? '' : String(entry.ja),
    no: entry.no,
    // 品詞タブの `word.partOfSpeech.includes()` は無防備なので、空でも必ず置く
    partOfSpeech: '',
  };

  const found = byWord.get(norm(entry.en)) || [];
  const m = found.length === 1 ? found[0] : (found.length > 1 ? pickByMeaning(found, entry.ja) : null);
  if (!m) {
    const w = written[String(entry.no)];
    if (w && w.example && w.exampleJa) {
      card.example = String(w.example);
      card.exampleJa = String(w.exampleJa);
      card.exampleSource = 'written';
    }
    return card;
  }

  /*
    **訳で選んだもの（候補が複数）は、IDと level を借りない**（2026-09-26 に足した道）。
    前からこの本の語として覚えている生徒がいる。IDを替えると覚えた記録が切れ、
    level を付けるとマスタの同じ語と二重に数える
  */
  if (found.length > 1) {
    for (const key of BORROW) {
      if (key === 'level') continue;
      if (m[key] === undefined || m[key] === null || m[key] === '') continue;
      card[key] = m[key];
    }
    return card;
  }

  // マスタの札が決まった。**IDもマスタのものを使う**——同じ語を本と
  // マスタで別々に覚え直させない（復習の間隔が2本に割れる）
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

  /*
    **パス単はやさしい級から作る**（5→4→3→2→準1。2026-09-27）。後ろの級は前の級の札と照合する
    （「want to do」を4級で作ってあれば、3級も同じ札を使う＝覚えた記録が級をまたいでつながる）
  */
  const EIKEN_RANK = { 5: 0, 4: 1, 3: 2, pre2: 3, 2: 4, pre1: 5, 1: 6 };
  const rankOf = (file) => {
    try { return EIKEN_RANK[JSON.parse(fs.readFileSync(file, 'utf8')).eiken] ?? 99; } catch (e) { return 99; }
  };
  const decks = [DECK_DIR, EXTRA_DECK_DIR]
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f))
      .sort((a, b) => (dir === EXTRA_DECK_DIR ? rankOf(a) - rankOf(b) : 0)));
  let changed = 0;
  /** 作り終えた単語帳の語（綴り → 例文のある札）。後ろの本が例文を借りる */
  const bookPool = new Map();
  /**
   * **ほかの級のパス単の札（前回作ったもの）**。級の順に作ると、上の級の札は下の級から見えない
   * （3級の「too A to do」が2級の札に当たらない）。作ってある出力を読んで、自分以外の級から引く
   */
  const passtanPoolFor = (deckId) => {
    const pool = new Map();
    for (const f of fs.readdirSync(OUT_DIR).filter((n) => /^words-book-passtan.*\.json$/.test(n))) {
      if (f === `words-book-${deckId}.json`) continue;
      for (const card of JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'))) {
        if (!card.meaning) continue;
        const key = norm(card.word);
        if (!pool.has(key)) pool.set(key, []);
        pool.get(key).push(card);
      }
    }
    return pool;
  };
  /** 高校英語・大阪府の語（照合する本が、マスタの次に見る） */
  const extraByWord = indexMaster(['words-highschool.json', 'words-osaka.json']
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'))));

  for (const file of decks) {
    const deck = JSON.parse(fs.readFileSync(file, 'utf8'));
    const writtenPath = path.join(EXAMPLES_DIR, `${deck.deckId}.json`);
    const written = fs.existsSync(writtenPath) ? JSON.parse(fs.readFileSync(writtenPath, 'utf8')) : {};
    const usedIds = new Set();
    const otherPasstan = deck.meaningFrom === 'master' ? passtanPoolFor(deck.deckId) : new Map();
    /*
      meaningFrom: 'master' … 単語データと照合する本（英検パス単）。同じ語があればその意味・id・例文を使い、
      無い語だけ本の訳で作る。品詞・格で分けた語（hint 付き）は訳をこちらで決めてあるので本の札にする
    */
    const cards = deck.words.map((entry) => (deck.meaningFrom === 'master' && !entry.hint
      ? masterCardOf(deck.deckId, entry, byWord, usedIds, { eiken: deck.eiken || null, written, pools: [extraByWord, bookPool, otherPasstan] })
      : cardOf(deck.deckId, entry, byWord, written)));
    /*
      **1冊の中で id を重ねない。** 品詞・格で分けた語（you の主格と目的格など）が同じマスタの語に
      当たると、札が2枚同じ id になる（学習の記録が1つに潰れる）。2枚目は本の id にし、level は外す
    */
    const seenIds = new Set();
    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i];
      if (seenIds.has(card.id)) {
        card.id = idOf(deck.deckId, deck.words[i].no);
        delete card.level;
      }
      seenIds.add(card.id);
      // 手で書いた例文は、どの道で作った札でも最後の手当てとして付ける
      const w = written[String(card.no)];
      if (!card.example && w && w.example && w.exampleJa) {
        card.example = String(w.example);
        card.exampleJa = String(w.exampleJa);
        card.exampleSource = 'written';
      }
    }
    /*
      **前に作った単語帳の例文も借りる**（2026-09-27。パス単のため）。マスタに無い語でも、ほかの本に
      同じ綴り・近い訳の語があれば、その例文（本の訳に合わせて書いたもの）を使う。借りるのは例文だけ
    */
    for (const card of cards) {
      if (card.example) continue;
      const pick = pickByMeaning(bookPool.get(norm(card.word)) || [], card.meaning);
      if (!pick) continue;
      card.example = pick.example;
      card.exampleJa = pick.exampleJa;
      if (pick.exampleSource) card.exampleSource = pick.exampleSource;
    }
    for (const card of cards) {
      if (!card.example) continue;
      const key = norm(card.word);
      if (!bookPool.has(key)) bookPool.set(key, []);
      bookPool.get(key).push(card);
    }

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

if (require.main === module) process.exit(main());

module.exports = { meaningCloseness, pickByMeaning, cardOf };
