/**
 * 本文の中の1語を、単語カードのデータと突き合わせる。
 *
 * 長文で気になった語をその場で「毎日みる」に入れたいが、本文の語は活用して
 * いる（makes / walked / friends）。マスターの見出しは原形なので、そのままでは
 * 当たらない。語尾を落として原形に寄せてから引く。
 *
 * 辞書は持たない。単純な規則で拾えなければ「カードにありません」と返す。
 * 当てずっぽうで別の語を登録するより、無いと言うほうがよい。
 */

/** 記号を落として小文字に。'face.' → 'face' */
export const normalizeToken = (token = '') =>
  String(token).toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');

/** 語尾を落として原形の候補を作る。 */
export const formsOf = (token) => {
  const forms = [token];
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
    if (pattern.test(token)) forms.push(token.replace(pattern, replacement));
  }
  return [...new Set(forms)].filter(Boolean);
};

/** 見出し → 単語 の索引。毎回なめると重いので、呼ぶ側で作って持ち回る。 */
export const buildWordIndex = (master = []) => {
  const index = new Map();
  for (const word of master) {
    const key = normalizeToken(word?.word);
    // 熟語（"a lot of"）は buildPhraseIndex のほうへ入れる。
    if (!key || key.includes(' ')) continue;
    // 同じ綴りが複数あればやさしいほうを採る。中高生に見せるのは基本の意味。
    const current = index.get(key);
    if (!current || (word.level || 99) < (current.level || 99)) index.set(key, word);
  }
  return index;
};

/**
 * 本文の1語からカードを引く。見つからなければ null。
 * @param {string} token 本文の語（記号付きのままでよい）
 * @param {Map} index buildWordIndex の返り値
 */
export const findWord = (token, index) => {
  const normalized = normalizeToken(token);
  if (!normalized || !index) return null;
  for (const form of formsOf(normalized)) {
    const hit = index.get(form);
    if (hit) return hit;
  }
  return null;
};

/**
 * 熟語の索引。1語目 → その語から始まる熟語（語数の多い順）。
 *
 * "a lot of" の lot だけを登録しても意味が無い。本文の中で熟語になっている
 * ところは、まとまりごと押させる。
 */
export const buildPhraseIndex = (master = []) => {
  const index = new Map();
  for (const word of master) {
    const tokens = normalizeToken(String(word?.word).replace(/[～〜]/g, ' '))
      .split(/\s+/)
      .map(normalizeToken)
      .filter(Boolean);
    if (tokens.length < 2) continue;

    const head = tokens[0];
    if (!index.has(head)) index.set(head, []);
    index.get(head).push({ tokens, word });
  }
  // 長いものから当てる。"look up" より "look up to" を優先する。
  for (const list of index.values()) list.sort((a, b) => b.tokens.length - a.tokens.length);
  return index;
};

/**
 * 文を語に割り、熟語になっているところをひとまとまりにする。
 *
 * @param {string} text 文（または意味のまとまり）
 * @param {Map} phraseIndex buildPhraseIndex の返り値
 * @returns {Array} [{ text, phrase }] text は表示する見た目、phrase は当たった熟語
 */
export const splitIntoUnits = (text, phraseIndex) => {
  // 空白も残して割る。表示のときに元の間隔へ戻せるようにする。
  const pieces = String(text || '').split(/(\s+)/).filter((piece) => piece !== '');
  const units = [];

  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i];
    if (/^\s+$/.test(piece)) { units.push({ text: piece, space: true }); continue; }

    const candidates = phraseIndex?.get(normalizeToken(piece)) || [];
    let matched = null;
    for (const candidate of candidates) {
      // 空白を飛ばしながら、熟語の語が順に並んでいるか見る
      const consumed = [];
      let cursor = i;
      let ok = true;
      for (const token of candidate.tokens) {
        while (cursor < pieces.length && /^\s+$/.test(pieces[cursor])) { consumed.push(cursor); cursor += 1; }
        if (cursor >= pieces.length || normalizeToken(pieces[cursor]) !== token) { ok = false; break; }
        consumed.push(cursor);
        cursor += 1;
      }
      if (ok) { matched = { candidate, last: consumed[consumed.length - 1] }; break; }
    }

    if (matched) {
      units.push({
        text: pieces.slice(i, matched.last + 1).join(''),
        phrase: matched.candidate.word,
      });
      i = matched.last;
    } else {
      units.push({ text: piece });
    }
  }

  return units;
};
