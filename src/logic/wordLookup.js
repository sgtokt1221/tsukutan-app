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
    // 熟語（"a lot of"）は1語では引けないので入れない。
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
