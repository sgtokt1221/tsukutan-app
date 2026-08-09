import THEMES from '../config/themes.json';

/**
 * 単語を意味のまとまり（テーマ）に振り分ける。
 *
 * 正本は src/config/themes.json。以前は StudentDashboard.js と
 * knowledgeAnalysis.js に同じ定義が2つあり、片方だけ直すとずれた。
 *
 * 判定は英語と日本語で分ける。
 *   英語 : 語として一致させる。部分一致だと 'go' が ago / algorithm /
 *          good に当たり、「移動」に無関係な語が大量に混ざっていた。
 *          活用や派生は語尾を落として吸収する。
 *   日本語: 漢字は部分一致で十分に効く（「見」が「見る」「見つける」に当たる）。
 */

export { THEMES };

export const THEME_IDS = THEMES.map((theme) => theme.id);

export const themeLabels = Object.fromEntries(THEMES.map((t) => [t.id, t.label]));
export const themeDescriptions = Object.fromEntries(THEMES.map((t) => [t.id, t.description]));

/** 語尾を落として原形に寄せる。単純な規則で十分（辞書は持たない）。 */
const stems = (token) => {
  const forms = new Set([token]);
  const rules = [
    [/ies$/, 'y'], [/ied$/, 'y'], [/ier$/, 'y'], [/iest$/, 'y'],
    [/ves$/, 'f'],
    [/([^aeiou])\1(ing|ed|er|est)$/, '$1'], // running → run
    [/ing$/, ''], [/ing$/, 'e'],            // making → mak / make
    [/ed$/, ''], [/ed$/, 'e'],
    [/es$/, ''], [/s$/, ''],
    [/er$/, ''], [/est$/, ''], [/ly$/, ''],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(token)) forms.add(token.replace(pattern, replacement));
  }
  return forms;
};

/** 見出しを語に割る。'look up to' → ['look','up','to'] */
const tokenize = (text) =>
  (text || '')
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((token) => token.length > 1);

const enIndex = new Map();
for (const theme of THEMES) {
  for (const term of theme.en) {
    const key = term.toLowerCase();
    if (!enIndex.has(key)) enIndex.set(key, []);
    enIndex.get(key).push(theme.id);
  }
}

/** 単語1件が属するテーマIDの配列。どこにも入らなければ空。 */
export const themesForWord = (word) => {
  if (!word) return [];
  const matched = new Set();

  for (const token of tokenize(word.word)) {
    for (const form of stems(token)) {
      const ids = enIndex.get(form);
      if (ids) ids.forEach((id) => matched.add(id));
    }
  }

  const meaning = [word.meaning, word.japanese].filter(Boolean).join(' ');
  if (meaning) {
    for (const theme of THEMES) {
      if (matched.has(theme.id)) continue;
      if (theme.ja.some((term) => meaning.includes(term))) matched.add(theme.id);
    }
  }

  return [...matched];
};

/**
 * テーマごとに単語をまとめる。
 * @returns {Object<string, {label: string, words: Array}>}
 */
export const buildThemeGroups = (words = []) => {
  const groups = {};
  if (!Array.isArray(words)) return groups;

  for (const word of words) {
    for (const themeId of themesForWord(word)) {
      if (!groups[themeId]) groups[themeId] = { label: themeLabels[themeId], words: [] };
      // 同じ単語を二重に入れない
      if (!groups[themeId].words.some((entry) => entry.id === word.id && entry.word === word.word)) {
        groups[themeId].words.push(word);
      }
    }
  }

  return groups;
};
