/**
 * 単語のレベル（1〜7）を付け直す規則（ルールC）。**正本はここだけ。**
 *
 * ## なぜ（2026-09-24）
 * 語彙力チェックの監査で、レベル7の英検の難しさ（平均4.87）がレベル6（4.95）を下回っていた。
 * 高校英語5,307語を**ファイルの並び順だけで**5/6/7に振り分け（reclassifyHighschoolLevels.js）、
 * 大阪府の旧1〜9を「7より上は7」に丸めていた（build-word-master.js）のが原因。
 * 分析と9つの決めごとは https://claude.ai/artifact/PQgrtVhsHEzeXbxypSjM8h（すべておすすめどおりで了承）。
 *
 * ## 規則
 * 1. 英検の値がある語は、いちばんやさしい級で決める（5→1, 4→2, 3→3, 準2→4, 2→5）。
 *    準1級は、高校英語の元レベルが8以下なら6、それ以外は7（大阪府だけの語は6）
 * 2. 英検の値が無い語は、取り込む前の元レベルから（高校 1-3→3, 4→4, 5-7→5, 8→6, 9-10→7 ／
 *    大阪府 1-2→1, 3-4→2, 5-6→3, 7-10→4。両方にあれば低い方）
 * 3. 英検と元レベルが2以上ずれたら、両方の平均を四捨五入（英検側にも元レベル側にも誤りがある）
 * 4. 同じつづり＋同じ品詞の組は同じレベルに揃える（英検で決まった語の最小、無ければ組の最小）
 *
 * 単語の `id` は変えない（生徒の復習データが id で結びついている）。
 * 単語帳3冊の掲載順との順位相関は 0.18〜0.42 → 0.69〜0.72 に上がる（分析で確認）。
 */

/** 英検の級。やさしい順 */
const EIKEN_ORDER = [5, 4, 3, 'pre2', 2, 'pre1', 1];
/** 英検の級 → レベル（準1級は別に分ける） */
const EIKEN_TO_LEVEL = { 5: 1, 4: 2, 3: 3, pre2: 4, 2: 5 };

/** 高校英語の元レベル（1〜10）→ 新しいレベル */
const hsMap = (l) => (l <= 3 ? 3 : l === 4 ? 4 : l <= 7 ? 5 : l === 8 ? 6 : 7);
/** 大阪府の元レベル（1〜10）→ 新しいレベル */
const osakaMap = (l) => (l <= 2 ? 1 : l <= 4 ? 2 : l <= 6 ? 3 : 4);

/** 品詞の書き方をそろえる（「熟」→「熟語」。normalizePartOfSpeech.js と同じ） */
const normPos = (p) => String(p || '').split(/\s*[,、]\s*/).map((s) => s.trim()).map((s) => (s === '熟' ? '熟語' : s)).join(', ');
const normText = (s) => String(s || '').trim().toLowerCase();

const keyExact = (e) => [normText(e.word), normPos(e.partOfSpeech), normText(e.meaning)].join('|');
const keyWordPos = (e) => [normText(e.word), normPos(e.partOfSpeech)].join('|');
const keyWord = (e) => normText(e.word);

/**
 * 元の教材（取り込む前）の索引。語＋品詞＋意味 → 語＋品詞 → 語 の順に引く。
 * @param {Array<{word, partOfSpeech, meaning, level}>} list
 */
function buildOriginIndex(list) {
  const maps = [new Map(), new Map(), new Map()];
  for (const e of list || []) {
    [keyExact(e), keyWordPos(e), keyWord(e)].forEach((k, i) => {
      if (!maps[i].has(k)) maps[i].set(k, []);
      maps[i].get(k).push(Number(e.level));
    });
  }
  return maps;
}

/** 元レベルを引く。見つからなければ null。複数あれば一番やさしいもの */
function lookupOrigin(index, entry) {
  const keys = [keyExact(entry), keyWordPos(entry), keyWord(entry)];
  for (let i = 0; i < 3; i += 1) {
    const levels = index[i].get(keys[i]);
    if (levels && levels.length) return Math.min(...levels);
  }
  return null;
}

/** いちばんやさしい英検の級。値が無ければ null（数値と 'pre2' などの文字列が混ざっている） */
function easiestEiken(entry) {
  if (!Array.isArray(entry.eikenLevels)) return null;
  const known = entry.eikenLevels.filter((x) => EIKEN_ORDER.includes(x));
  if (known.length === 0) return null;
  return known.reduce((a, b) => (EIKEN_ORDER.indexOf(a) <= EIKEN_ORDER.indexOf(b) ? a : b));
}

/**
 * 1語の新しいレベル。
 * @param {object} entry 単語（eikenLevels・level を見る）
 * @param {{ origHs: number|null, origOsaka: number|null }} origin 取り込む前の元レベル（教材に所属していなければ null）
 * @returns {{ level: number, basis: string }}
 */
function levelFor(entry, { origHs = null, origOsaka = null } = {}) {
  const mapped = [];
  if (origHs != null) mapped.push(hsMap(origHs));
  if (origOsaka != null) mapped.push(osakaMap(origOsaka));
  const fromOrigin = mapped.length ? Math.min(...mapped) : null;

  const eiken = easiestEiken(entry);
  if (eiken == null) {
    if (fromOrigin != null) return { level: fromOrigin, basis: 'origin' };
    // 根拠が無い語は今のレベルのまま（2026-09-24 時点で該当0語）
    return { level: Number(entry.level), basis: 'keep' };
  }

  let byEiken;
  if (eiken === 'pre1') {
    const o = origHs != null ? origHs : (origOsaka != null ? 5 : null);
    byEiken = o != null && o <= 8 ? 6 : 7;
  } else {
    byEiken = EIKEN_TO_LEVEL[eiken] ?? 7;
  }
  if (fromOrigin != null && Math.abs(fromOrigin - byEiken) >= 2) {
    return { level: Math.round((fromOrigin + byEiken) / 2), basis: 'eiken+origin' };
  }
  return { level: byEiken, basis: 'eiken' };
}

/**
 * 同じつづり＋同じ品詞の組を同じレベルに揃える。
 * 英検で決まった語があればその最小、無ければ組の最小。
 * @param {Array<{ entry: object, level: number, basis: string }>} results
 * @returns {Map<string, number>} id → 揃えたレベル
 */
function alignGroups(results) {
  const groups = new Map();
  for (const r of results) {
    const k = keyWordPos(r.entry);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = new Map();
  for (const group of groups.values()) {
    const byEiken = group.filter((r) => r.basis.startsWith('eiken'));
    const level = Math.min(...(byEiken.length ? byEiken : group).map((r) => r.level));
    for (const r of group) out.set(r.entry.id, level);
  }
  return out;
}

/**
 * 単語データ全体の新しいレベル。
 * @param {object} p
 * @param {Array} p.master words-master.json
 * @param {Set<string>} p.highschoolIds words-highschool.json の id
 * @param {Set<string>} p.osakaIds words-osaka.json の id
 * @param {Array} p.highschoolOrigin 高校英語の取り込む前の語（旧1〜10）
 * @param {Array} p.osakaOrigin 大阪府の取り込む前の語（旧1〜10）
 * @returns {Map<string, { level: number, basis: string }>} id → 新しいレベル
 */
function relevelAll({ master, highschoolIds, osakaIds, highschoolOrigin, osakaOrigin }) {
  const hsIndex = buildOriginIndex(highschoolOrigin);
  const osakaIndex = buildOriginIndex(osakaOrigin);
  const results = master.map((entry) => {
    const origHs = highschoolIds.has(entry.id) ? lookupOrigin(hsIndex, entry) : null;
    const origOsaka = osakaIds.has(entry.id) ? lookupOrigin(osakaIndex, entry) : null;
    return { entry, ...levelFor(entry, { origHs, origOsaka }) };
  });
  const aligned = alignGroups(results);
  const out = new Map();
  for (const r of results) out.set(r.entry.id, { level: aligned.get(r.entry.id), basis: r.basis });
  return out;
}

module.exports = {
  EIKEN_ORDER, EIKEN_TO_LEVEL, hsMap, osakaMap, normPos,
  buildOriginIndex, lookupOrigin, easiestEiken, levelFor, alignGroups, relevelAll,
};
