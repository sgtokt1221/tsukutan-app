/**
 * ARPAbet（CMU Pronouncing Dictionary の表記）を IPA に変換する。
 *
 * 発音は General American を採る。学校英語の教材が米音基準なので、
 * cot/caught や r音を米音のまま出す。
 *
 * ストレス記号は音節の頭に置く（ˈ = 第一強勢 / ˌ = 第二強勢）。
 * 音節の切れ目は「最大オンセット原則」で決める。子音の連なりは
 * 英語として頭に立てる範囲だけ後ろの音節に渡す。
 */

// 母音。ARPAbet の末尾の数字（0/1/2）は強勢なので、ここでは外した形で持つ。
const VOWELS = {
  AA: 'ɑ',
  AE: 'æ',
  AH: 'ʌ', // 強勢なしは 'ə'（下で分岐）
  AO: 'ɔ',
  AW: 'aʊ',
  AY: 'aɪ',
  EH: 'ɛ',
  ER: 'ɝ', // 強勢なしは 'ɚ'（下で分岐）
  EY: 'eɪ',
  IH: 'ɪ',
  IY: 'i',
  OW: 'oʊ',
  OY: 'ɔɪ',
  UH: 'ʊ',
  UW: 'u',
};

const CONSONANTS = {
  B: 'b',
  CH: 'tʃ',
  D: 'd',
  DH: 'ð',
  F: 'f',
  G: 'ɡ',
  HH: 'h',
  JH: 'dʒ',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: 'ŋ',
  P: 'p',
  R: 'r',
  S: 's',
  SH: 'ʃ',
  T: 't',
  TH: 'θ',
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: 'ʒ',
};

// 英語で語頭に立てる子音連結。ここに無い並びは前の音節の末尾に残す。
const ONSET_CLUSTERS = new Set([
  // 阻害音 + r
  'pr', 'br', 'tr', 'dr', 'kr', 'ɡr', 'fr', 'θr', 'ʃr',
  // 阻害音 + l
  'pl', 'bl', 'kl', 'ɡl', 'fl', 'sl',
  // 子音 + w
  'tw', 'dw', 'kw', 'ɡw', 'sw', 'θw', 'hw',
  // 子音 + j
  'pj', 'bj', 'tj', 'dj', 'kj', 'ɡj', 'fj', 'vj', 'mj', 'nj', 'hj', 'lj',
  // s + 無声阻害音・鼻音
  'sp', 'st', 'sk', 'sf', 'sm', 'sn',
  // 3子音
  'spr', 'spl', 'spj', 'str', 'stj', 'skr', 'skl', 'skw', 'skj',
]);

/** ARPAbet の1音素を { symbol, isVowel, stress } に分解する */
const parsePhoneme = (token) => {
  const match = /^([A-Z]+)([0-2])?$/.exec(token);
  if (!match) return null;
  const [, base, stressDigit] = match;

  if (Object.prototype.hasOwnProperty.call(VOWELS, base)) {
    const stress = stressDigit === undefined ? 0 : Number(stressDigit);
    let symbol = VOWELS[base];
    // 弱母音は曖昧母音になる
    if (base === 'AH' && stress === 0) symbol = 'ə';
    if (base === 'ER' && stress === 0) symbol = 'ɚ';
    return { symbol, isVowel: true, stress };
  }

  if (Object.prototype.hasOwnProperty.call(CONSONANTS, base)) {
    return { symbol: CONSONANTS[base], isVowel: false, stress: 0 };
  }

  return null;
};

/**
 * 子音の連なりのうち、後ろの音節の頭に渡せる分を返す。
 * 語頭の音節は連なり全部を頭に持てるので呼び出し側で分岐する。
 */
const splitOnset = (consonants) => {
  for (let take = Math.min(3, consonants.length); take >= 1; take -= 1) {
    const candidate = consonants.slice(consonants.length - take);
    if (take === 1 || ONSET_CLUSTERS.has(candidate.join(''))) {
      return consonants.length - take;
    }
  }
  return consonants.length;
};

const STRESS_MARK = { 1: 'ˈ', 2: 'ˌ' };

/**
 * ARPAbet の音素列（例: ["AH0", "B", "AW1", "T"]）を IPA 文字列にする。
 * 変換できない音素が混ざっていたら null を返す（中途半端な表記を出さない）。
 */
const arpabetToIpa = (phonemes) => {
  const parsed = [];
  for (const token of phonemes) {
    const phoneme = parsePhoneme(token);
    if (!phoneme) return null;
    parsed.push(phoneme);
  }
  if (parsed.length === 0) return null;

  const vowelCount = parsed.filter((p) => p.isVowel).length;
  // 単一音節しかない語に強勢記号は付けない（辞書の慣習に合わせる）
  const markStress = vowelCount > 1;

  const out = [];
  let pendingConsonants = [];
  let seenVowel = false;

  for (const phoneme of parsed) {
    if (!phoneme.isVowel) {
      pendingConsonants.push(phoneme.symbol);
      continue;
    }

    // この母音の音節がどこから始まるかを決める
    const boundary = seenVowel ? splitOnset(pendingConsonants) : 0;
    out.push(...pendingConsonants.slice(0, boundary));
    const mark = markStress ? STRESS_MARK[phoneme.stress] : undefined;
    if (mark) out.push(mark);
    out.push(...pendingConsonants.slice(boundary));
    out.push(phoneme.symbol);

    pendingConsonants = [];
    seenVowel = true;
  }

  out.push(...pendingConsonants);
  return out.join('');
};

module.exports = { arpabetToIpa, parsePhoneme, splitOnset, VOWELS, CONSONANTS };
