/**
 * 教科書（開隆堂 Sunshine）の語彙一覧を、つくつくのカードの形に直す。**純関数だけ。**
 *
 * ## なぜ（2026-09-24）
 * 塾の中学生は学校で Sunshine を使っている。「教科書の p.30〜45 の単語」を覚えられるように、
 * また管理画面からページを指定して小テストを出せるようにする。
 *
 * ## 意味は単語データから引く（一覧には意味が無い）
 * 引き方の順:
 *   1. つづりが単語データに1件 → その語
 *   2. 複数ある（close 動/形 など）→ **いちばんレベルの低い意味**（中学の教科書なので、やさしい方が当たる）
 *   3. 不規則な活用形（eaten / went / children）と複数形・三単現の -s → 原形の語。語は教科書の表記のまま、意味に「（eat の変化形）」を添える
 *   4. 単語帳（LEAP など）につづりが1件 → その語
 *   5. どれも無ければ出さない（意味の無いカードは学習にも小テストにも使えない）
 * **人名・地名は外す**（ユーザーの指定）。大文字で始まる語は、単語データでも大文字で始まる語にだけ当てる。
 *
 * ## id
 * 1・2 は単語データの id をそのまま使う（覚えた記録・語彙数・苦手な単語とつながる）。
 * 4 は単語帳の id。3 は原形とは別の語なので、教科書と表記から決めた id を振る。
 * 同じ学年で同じ id が2回出たら、先に出たページだけ残す（1回の学習で同じカードが2枚出ない）。
 */

const crypto = require('crypto');

/** 単語データから借りてよい欄（`build-book-words.js` の BORROW と同じ。訳とつづりは借りない） */
const BORROW = ['level', 'partOfSpeech', 'theme', 'example', 'exampleJa', 'pronunciation'];
/** 活用形・単語帳の語には level を付けない（語彙数の分子だけが増える。build-book-words.js の注記） */
const BORROW_NO_LEVEL = BORROW.filter((key) => key !== 'level');

const norm = (text) => String(text || '')
  .replace(/[’‘]/g, "'")
  .replace(/[～~…]|\.\.\./g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/** 不規則に変わる語（教科書に出てくるものだけ）。変化形 → 原形 */
const IRREGULAR = {
  am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be',
  ate: 'eat', eaten: 'eat', became: 'become', began: 'begin', begun: 'begin',
  bought: 'buy', brought: 'bring', built: 'build', caught: 'catch', chose: 'choose', chosen: 'choose',
  came: 'come', did: 'do', done: 'do', does: 'do', drew: 'draw', drawn: 'draw', drank: 'drink', drunk: 'drink',
  drove: 'drive', driven: 'drive', fell: 'fall', fallen: 'fall', felt: 'feel', found: 'find', flew: 'fly', flown: 'fly',
  forgot: 'forget', forgotten: 'forget', gave: 'give', given: 'give', went: 'go', gone: 'go', got: 'get', gotten: 'get',
  grew: 'grow', grown: 'grow', had: 'have', has: 'have', heard: 'hear', held: 'hold', hid: 'hide', hidden: 'hide',
  hurt: 'hurt', kept: 'keep', knew: 'know', known: 'know', left: 'leave', led: 'lead', lent: 'lend', lost: 'lose',
  made: 'make', meant: 'mean', met: 'meet', paid: 'pay', ran: 'run', rang: 'ring', rode: 'ride', ridden: 'ride',
  rose: 'rise', risen: 'rise', said: 'say', sang: 'sing', sung: 'sing', sat: 'sit', saw: 'see', seen: 'see',
  sold: 'sell', sent: 'send', shook: 'shake', shaken: 'shake', shot: 'shoot', showed: 'show', shown: 'show',
  slept: 'sleep', spoke: 'speak', spoken: 'speak', spent: 'spend', stood: 'stand', stole: 'steal', stolen: 'steal',
  swam: 'swim', swum: 'swim', took: 'take', taken: 'take', taught: 'teach', told: 'tell', thought: 'think',
  threw: 'throw', thrown: 'throw', understood: 'understand', woke: 'wake', woken: 'wake', wore: 'wear', worn: 'wear',
  won: 'win', wrote: 'write', written: 'write', fought: 'fight', fed: 'feed', broke: 'break', broken: 'break',
  woven: 'weave', wove: 'weave', children: 'child', men: 'man', women: 'woman', people: 'person', feet: 'foot',
  teeth: 'tooth', mice: 'mouse', lives: 'life', leaves: 'leaf', knives: 'knife', wives: 'wife',
  better: 'good', best: 'good', worse: 'bad', worst: 'bad',
};

/**
 * 活用形から原形の候補。元の語そのものは含めない。
 *
 * **使うのは上の表と、複数形・三単現の -s だけ。** -er / -ly / -ing / -ed まで削ると、
 * 語を作る接尾辞まで拾って別の意味になる（2026-09-24 の下読みで `kindly`→kind「種類」、
 * `butter`→but「しかし」、`outing`→out、`annoyed`→annoy「を悩ます」が出た）。
 * 複数形も、原形が名詞か動詞のときだけ当てる（→ resolveRow）。
 */
function baseCandidates(key) {
  if (key.includes(' ')) return [];
  if (IRREGULAR[key]) return [IRREGULAR[key]];
  const out = [];
  for (const [suffix, repl] of [['ies', 'y'], ['es', ''], ['s', '']]) {
    if (key.endsWith(suffix) && key.length > suffix.length + 2) out.push(key.slice(0, -suffix.length) + repl);
  }
  return out;
}

const byKey = (list) => {
  const map = new Map();
  for (const entry of list) {
    const key = norm(entry.word);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  }
  return map;
};

/** 複数あればいちばんレベルの低いもの（同じなら単語データの並びで先のもの） */
const easiestOf = (entries) => entries.reduce((best, e) => ((e.level ?? 99) < (best.level ?? 99) ? e : best));

const idFor = (word) => `w_${crypto.createHash('sha256').update(`textbook-sunshine|${norm(word)}`).digest('hex').slice(0, 16)}`;

const borrow = (card, from, keys) => {
  for (const key of keys) {
    if (from[key] === undefined || from[key] === null || from[key] === '') continue;
    card[key] = from[key];
  }
  return card;
};

/**
 * 1行の語の意味を引く。見つからなければ null。
 * @returns {{ card: object, via: 'master'|'master-easiest'|'inflection'|'book' } | { skip: 'proper-noun'|'no-meaning' }}
 */
function resolveRow(row, masterByKey, bookByKey) {
  const key = norm(row.word);
  /*
    **大文字で始まる語（人名・地名）は、大文字で始まる語にしか当てない。** 登場人物の Bob が
    動詞 bob「上下に動く」に当たっていた（2026-09-24。英検の級の lib/textbookEiken.js と同じ規則）。
    I や Japan は単語データでも大文字なので当たる
  */
  const upper = /^[A-Z]/.test(String(row.word).trim());
  const found = (masterByKey.get(key) || []).filter((m) => !upper || /^[A-Z]/.test(String(m.word).trim()));
  if (upper && found.length === 0) return { skip: 'proper-noun' };

  const base = { word: row.word, grade: row.grade, page: row.page, order: row.order, partOfSpeech: '' };

  if (found.length > 0) {
    const m = found.length === 1 ? found[0] : easiestOf(found);
    const card = borrow({ ...base, id: m.id, meaning: m.meaning }, m, BORROW);
    return { card, via: found.length === 1 ? 'master' : 'master-easiest' };
  }

  const fromTable = Boolean(IRREGULAR[key]);
  for (const candidate of baseCandidates(key)) {
    // -s で削った候補は、原形が名詞か動詞のときだけ（`news`→new「新しい」を拾わない）
    const hits = (masterByKey.get(candidate) || [])
      .filter((m) => fromTable || /名|動/.test(String(m.partOfSpeech || '')));
    if (hits.length === 0) continue;
    const m = easiestOf(hits);
    const card = borrow({ ...base, id: idFor(row.word), meaning: `（${m.word} の変化形）${m.meaning}` }, m, BORROW_NO_LEVEL);
    return { card, via: 'inflection' };
  }

  const books = bookByKey.get(key) || [];
  if (books.length === 1) {
    const b = books[0];
    const card = borrow({ ...base, id: b.id, meaning: b.meaning }, b, BORROW_NO_LEVEL);
    return { card, via: 'book' };
  }
  return { skip: 'no-meaning' };
}

/**
 * 教科書の全行をカードにする。
 * @param {Array<{grade, page, order, word}>} rows data-sources/textbook-sunshine-r7.json の rows
 * @param {Array} master words-master.json
 * @param {Array} bookWords words-book-*.json を連結したもの
 * @returns {{ cards: Array, skipped: Array<{row, reason}>, counts: object }}
 */
function buildTextbookCards(rows, master, bookWords) {
  const masterByKey = byKey(master);
  const bookByKey = byKey(bookWords);
  const cards = [];
  const skipped = [];
  const counts = {};
  const seen = new Set();
  for (const row of rows) {
    const result = resolveRow(row, masterByKey, bookByKey);
    const tag = result.via || result.skip;
    counts[tag] = (counts[tag] || 0) + 1;
    if (!result.card) {
      skipped.push({ row, reason: result.skip });
      continue;
    }
    // 同じ学年で同じ語は1枚（先に出たページ）
    const dupKey = `${row.grade}|${result.card.id}`;
    if (seen.has(dupKey)) {
      counts.duplicate = (counts.duplicate || 0) + 1;
      continue;
    }
    seen.add(dupKey);
    cards.push(result.card);
  }
  return { cards, skipped, counts };
}

module.exports = { norm, baseCandidates, resolveRow, buildTextbookCards, IRREGULAR };
