/**
 * 中学の語の英検の級（5級・4級・3級）を、教科書の初出学年で決め直す。**規則の正本はここだけ。**
 *
 * ## なぜ（2026-09-24）
 * 単語データの英検の印（eikenLevels）は出どころの記録が無い。頻度と突き合わせると準2級より上は
 * 筋が通っていたが、5級と4級は区別できておらず（51%）、`but` `his` `they` が4級、`so` `more` が
 * 3級に入っていた。今の「5級」はほぼ「小学校で学んだ語」だけで、中1で初めて出る語は4級・3級に
 * 散っていた。
 *
 * 英検の公式の目安は 5級＝中1程度・4級＝中2程度・3級＝中学卒業程度。そこで教科書会社が配っている
 * 語彙一覧（開隆堂 Sunshine、data-sources/textbook-sunshine-r7.json）の初出学年を使う。
 *
 * ## 規則
 * - 小学校・中1 → 5級、中2 → 4級、中3 → 3級
 * - 語の照合はつづりだけ（大文字小文字・「～」「…」・空白の揺れはそろえる）
 * - **教科書は級をやさしくする方向にだけ使う。** 今の印のほうがやさしければそのまま。
 *   初出の学年は教科書の話題の順で決まるので、`easy` `difficult` `future` `clock` が中2・中3で
 *   初めて出る。これを5級から4級・3級へ上げるのは誤り（2026-09-24 の下読みで20語あった）
 * - やさしくするときは 5・4・3級の印を外して教科書の級を入れる。準2級より上の印はそのまま残す
 * - 同じつづりの語が複数あるとき（last「最後の」と last「続く」など）、教科書の学年が当たるのは
 *   **いちばんやさしい意味**だけ。今の英検の印がいちばんやさしい行（同じなら全部）に当てる。
 *   印がどれにも無ければ全部に当てる
 * - 教科書に無い語は触らない
 *
 * 何度流しても同じ結果になる（やさしくしかしないので、当てた行は組の中でいちばんやさしいまま）。
 */

const EIKEN_ORDER = ['5', '4', '3', 'pre2', '2', 'pre1', '1'];
const JUNIOR = new Set(['5', '4', '3']);
/** 教科書の初出（0=小学校, 1〜3=中学の学年）→ 英検の級 */
const GRADE_TO_EIKEN = { 0: 5, 1: 5, 2: 4, 3: 3 };

/** つづりの照合キー */
const spellingKey = (text) => String(text || '')
  .replace(/[’‘]/g, "'")
  .replace(/[～~…]|\.\.\./g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/** いちばんやさしい英検の級の順位。印が無ければ Infinity */
const easiestRank = (entry) => {
  const ranks = (Array.isArray(entry.eikenLevels) ? entry.eikenLevels : [])
    .map((x) => EIKEN_ORDER.indexOf(String(x)))
    .filter((i) => i >= 0);
  return ranks.length ? Math.min(...ranks) : Infinity;
};

const startsUpper = (text) => /^[A-Z]/.test(String(text || '').trim());

/**
 * 教科書の語 → いちばん早い学年。
 * **大文字で始まる語（人名・地名）は、大文字で始まる語にしか当てない。** 教科書の登場人物 Frank が
 * 形容詞 frank（率直な）を5級にしていた（2026-09-24 の下読み）。
 * @returns {{ lower: Map<string, number>, upper: Map<string, number> }}
 */
const buildTextbookIndex = (words) => {
  const lower = new Map();
  const upper = new Map();
  for (const { word, grade } of words || []) {
    const key = spellingKey(word);
    if (!key) continue;
    // 小文字の語は大文字の語（文頭の I など）にも当てる。大文字の語は大文字にだけ
    for (const index of startsUpper(word) ? [upper] : [lower, upper]) {
      if (!index.has(key) || grade < index.get(key)) index.set(key, grade);
    }
  }
  return { lower, upper };
};

const gradeOf = (index, word) => (startsUpper(word) ? index.upper : index.lower).get(spellingKey(word));

/** 印を差し替える。準2級より上はそのまま、数値の級は数値で入れる（既存データと同じ形） */
const withJuniorGrade = (eikenLevels, eiken) => {
  const kept = (Array.isArray(eikenLevels) ? eikenLevels : []).filter((x) => !JUNIOR.has(String(x)));
  return [eiken, ...kept];
};

/**
 * 単語データ全体の新しい eikenLevels。
 * @param {Array} master words-master.json
 * @param {Array<{word: string, grade: number}>} textbookWords 教科書の語彙一覧
 * @returns {Map<string, Array>} 変わる行の id → 新しい eikenLevels
 */
function textbookEikenChanges(master, textbookWords) {
  const index = buildTextbookIndex(textbookWords);
  const groups = new Map();
  for (const entry of master) {
    const grade = gradeOf(index, entry.word);
    if (grade === undefined) continue;
    const key = `${grade}|${spellingKey(entry.word)}`;
    if (!groups.has(key)) groups.set(key, { grade, entries: [] });
    groups.get(key).entries.push(entry);
  }

  const changes = new Map();
  for (const { grade, entries } of groups.values()) {
    const eiken = GRADE_TO_EIKEN[grade];
    const best = Math.min(...entries.map(easiestRank));
    const targets = entries.filter((e) => easiestRank(e) === best);
    for (const entry of targets) {
      // 今の印が教科書の級と同じかやさしければ触らない
      if (easiestRank(entry) <= EIKEN_ORDER.indexOf(String(eiken))) continue;
      changes.set(entry.id, withJuniorGrade(entry.eikenLevels, eiken));
    }
  }
  return changes;
}

module.exports = { GRADE_TO_EIKEN, spellingKey, buildTextbookIndex, withJuniorGrade, textbookEikenChanges };
