/**
 * 実力テストの問題を単語マスターから作る。
 * ASSESSMENT_RANK_SYSTEM_PLAN.md 4.1 / 6.2。
 *
 * 先生の校閲を通さずそのまま出題する運用にしたので、
 * 「明らかにダメな問題」は作らせない側で防ぐ。とくに危ないのは
 * 誤答が正解と同じ意味になっている場合で、achieve「を達成する；を
 * 成し遂げる」と accomplish「を成し遂げる」のような組み合わせが
 * 同レベル・同品詞に普通に存在する。
 */

/** 意味を語義ごとに割る。「を捨てる；を放棄する，断念する」→ 3語義 */
const splitSenses = (meaning) =>
  String(meaning || '')
    .split(/[；;、,・\n]/)
    .map((sense) => sense.trim())
    .filter(Boolean);

/** 語義の比較用に、助詞や記号など意味を持たない飾りを落とす */
const normalizeSense = (sense) =>
  String(sense || '')
    .replace(/[〜～]/g, '')
    .replace(/^[（(][^）)]*[）)]/g, '')
    .replace(/[（(][^）)]*[）)]$/g, '')
    .replace(/^[をにでとがはへの]/, '')
    .replace(/[。．\s]/g, '')
    .trim();

/** 2つの意味が実質同じか。どちらかの語義が一致・包含していれば同じとみなす。 */
const meaningsOverlap = (a, b) => {
  const sensesA = splitSenses(a).map(normalizeSense).filter((s) => s.length >= 2);
  const sensesB = splitSenses(b).map(normalizeSense).filter((s) => s.length >= 2);
  if (sensesA.length === 0 || sensesB.length === 0) return true; // 判定できないものは使わない

  for (const x of sensesA) {
    for (const y of sensesB) {
      if (x === y) return true;
      // 3文字以上の包含も同義とみなす（「成し遂げる」⊂「を成し遂げる」）
      if (x.length >= 3 && y.includes(x)) return true;
      if (y.length >= 3 && x.includes(y)) return true;
    }
  }
  return false;
};

/**
 * 選択肢の長さが偏っていないか。
 * 正解だけが極端に長いと、読まずに当てられる（計画書6.2）。
 */
const choiceLengthsBalanced = (choices) => {
  const lengths = choices.map((choice) => String(choice).length);
  const longest = Math.max(...lengths);
  const shortest = Math.min(...lengths);
  if (shortest === 0) return false;
  return longest / shortest <= 2.5;
};

/** 見出し語のうち、空所にできる主要な英単語を取る */
const primaryToken = (word) => {
  const tokens = String(word || '')
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((token) => token.length >= 3);
  return tokens[0] || null;
};

/** 空所補充に使える例文の最低語数。短いと文脈がなく、当てずっぽうで解ける。 */
const MIN_SENTENCE_TOKENS = 4;

/** 空所補充に使えるのは1語の見出しだけ。熟語は選択肢が文に嵌まらない。 */
const isSingleWord = (word) => /^[A-Za-z][A-Za-z'-]*$/.test(String(word || '').trim());

/**
 * 例文の中でその語を空所にできるか。
 *
 * 条件:
 *   - 見出しが1語。熟語だと "Why don't we ...?" がそのまま選択肢に並ぶ
 *   - 例文に「原形のまま」1回だけ現れる。活用形（crying）を見出し（cry）で
 *     置き換えると "A baby is cry." のような非文になる
 *   - 文として成立している。マスターの example には "a speech contest" の
 *     ような句が混ざっており、空所にすると文脈が消える
 */
const canMakeCloze = (word) => {
  if (!isSingleWord(word?.word) || !word?.example) return false;

  const example = String(word.example).trim();
  if (!/[.!?]$/.test(example)) return false;
  if (example.split(/\s+/).length < MIN_SENTENCE_TOKENS) return false;

  const token = String(word.word).trim().toLowerCase();
  // 原形と完全一致するものだけ数える（cry は拾い、crying は拾わない）
  const exact = example.toLowerCase().match(new RegExp(`\\b${token}\\b`, 'g'));
  if (!Array.isArray(exact) || exact.length !== 1) return false;

  // 活用形が別に混ざっていると、空所以外にも同じ語が見えてしまう
  const loose = example.toLowerCase().match(new RegExp(`\\b${token}\\w+`, 'g'));
  return !loose || loose.length === 0;
};

/** 例文の対象語を空所にする。原形が一致した1箇所だけを置き換える。 */
const blankExample = (word) => {
  const token = String(word.word).trim();
  return String(word.example).replace(new RegExp(`\\b${token}\\b`, 'i'), '____');
};

/**
 * 誤答を3つ選ぶ。同レベル・同品詞の中から、意味が重ならないものだけ。
 * 足りなければ null（その語では問題を作らない）。
 */
const pickDistractors = (word, pool, pickIndex) => {
  const candidates = pool.filter(
    (other) =>
      other.word !== word.word
      && other.meaning
      && !meaningsOverlap(word.meaning, other.meaning)
  );
  if (candidates.length < 3) return null;

  // 決まった位置から選ぶ。実行のたびに問題が変わらないようにする。
  const picked = [];
  const step = Math.max(1, Math.floor(candidates.length / 3));
  for (let i = 0; i < 3; i += 1) {
    const index = (pickIndex + i * step) % candidates.length;
    const candidate = candidates[index];
    if (picked.some((p) => p.word === candidate.word)) return null;
    // 誤答同士も意味が被っていると「2つ正解」に見える
    if (picked.some((p) => meaningsOverlap(p.meaning, candidate.meaning))) return null;
    picked.push(candidate);
  }
  return picked;
};

module.exports = {
  isSingleWord,
  meaningsOverlap,
  choiceLengthsBalanced,
  primaryToken,
  canMakeCloze,
  blankExample,
  pickDistractors,
};
