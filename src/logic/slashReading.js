/**
 * スラッシュリーディングの区切り。
 *
 * **SVOC の区切りをそのまま使わない。** 読みもののデータ（`chunks`）は
 * S / V / O / C / M の単位で切ってある。それをそのまま `/` にすると
 * 「I / get up / at six / in the morning.」のように**主語と動詞まで割れる**。
 * 頭から読む練習では、主語と動詞はふつう一息で読む。
 *
 * **区切りを2つ持たない。** データに slash 用の区切りを別に書くと、片方だけ
 * 直したときにズレても画面は普通に動いてしまう（docs/reading-format.md）。
 * ここでは chunks を**まとめ直すだけ**で、新しいデータは持たない。
 *
 * ## 区切る目印（塾で教えている5つ）
 * 1. 前置詞の前（in, on, at, to, with …）
 * 2. 接続詞の前（and, but, because, if …）
 * 3. 関係代名詞・関係副詞・疑問詞の前（who, which, that, where …）
 * 4. 不定詞・動名詞・分詞（準動詞）の前
 * 5. カンマ（,）コロン（:）セミコロン（;）の後ろ
 * 6. 主語や長い目的語・補語の後ろ（**文の構造が長くなるときだけ**）
 *
 * 絶対的な正解は無いので、**迷ったらまとめる**。切りすぎた区切りは
 * 「頭から意味を取る」練習の邪魔になる。
 */

/** 1. 前置詞。`to` は不定詞の目印も兼ねる（どちらでも区切るので分けない） */
export const PREPOSITIONS = new Set([
  'in', 'on', 'at', 'to', 'with', 'for', 'from', 'by', 'of', 'about',
  'into', 'onto', 'over', 'under', 'above', 'below', 'after', 'before',
  'during', 'through', 'between', 'among', 'against', 'without', 'within',
  'across', 'around', 'near', 'since', 'until', 'till', 'like', 'than',
  'behind', 'beside', 'beyond', 'toward', 'towards', 'upon', 'off',
]);

/** 2. 接続詞 */
export const CONJUNCTIONS = new Set([
  'and', 'but', 'or', 'nor', 'so', 'yet', 'because', 'if', 'when', 'while',
  'although', 'though', 'unless', 'whether', 'as', 'once', 'whenever',
]);

/** 3. 関係代名詞・関係副詞・疑問詞。`that` は接続詞も兼ねる */
export const RELATIVES = new Set([
  'who', 'whom', 'whose', 'which', 'that', 'where', 'why', 'how', 'what',
]);

/**
 * 4. 動名詞・分詞に**見えるだけ**の語。`-ing` で終わるが準動詞ではない。
 * これを外さないと「in the morning」の morning などで切ってしまう。
 */
const NOT_PARTICIPLE = new Set([
  'everything', 'something', 'nothing', 'anything', 'morning', 'evening',
  'during', 'spring', 'king', 'thing', 'things', 'ring', 'wing', 'string',
  'ceiling', 'building', 'buildings', 'meaning', 'feeling', 'feelings',
  'clothing', 'shopping', 'swimming',
]);

/** 6. 「長い」の目安。これ以上の語数なら、そこで一度切る */
export const LONG_CHUNK_WORDS = 3;

const words = (text) => String(text || '').trim().split(/\s+/).filter(Boolean);

/** 記号を落として比べる。`(`、引用符、末尾の句読点を外す */
const bareWord = (word) => String(word || '').toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');

/** 5. カンマ・コロン・セミコロンで終わっているか */
const endsWithPause = (text) => /[,:;]["')\]]?$/.test(String(text || '').trim());

/** 4. 準動詞（動名詞・分詞）で始まっているか。`to` 不定詞は前置詞側で拾う */
const startsWithVerbal = (chunk) => {
  // 主語・動詞の位置で `-ing` が出るのは進行形なので切らない。
  // 修飾（M）や補語（C）の頭に出るものだけを準動詞とみなす。
  if (chunk.role !== 'M' && chunk.role !== 'C') return false;
  const first = bareWord(words(chunk.en)[0]);
  if (!first || first.length < 5) return false;
  if (NOT_PARTICIPLE.has(first)) return false;
  return first.endsWith('ing');
};

/**
 * 接続詞ではない `so`。「so much interest」「so many people」の `so` は
 * 程度を表す副詞で、節の頭ではない。ここで外さないと
 * 「have / so much interest?」と動詞と目的語が割れる。
 */
const DEGREE_AFTER_SO = new Set(['much', 'many', 'little', 'few', 'long', 'far', 'big', 'small', 'hard']);

/**
 * 2語で1つの前置詞になるもの（next to / close to / according to …）。
 * 後ろの語だけ見て切ると「the house next / to number one」と割れる。
 */
const COMPOUND_BEFORE = new Set(['next', 'close', 'due', 'according', 'thanks', 'prior', 'out', 'because', 'instead']);
const isDegreeSo = (chunk) => {
  const [first, second] = words(chunk.en).map(bareWord);
  return first === 'so' && DEGREE_AFTER_SO.has(second || '');
};

/** 1〜4. このまとまりの**前**で切る目印があるか */
const startsBoundary = (chunk) => {
  const first = bareWord(words(chunk.en)[0]);
  if (!first) return false;
  // 接続詞は動詞のまとまりの頭に来ることがある（and ran …）ので先に見る
  if (CONJUNCTIONS.has(first) && !isDegreeSo(chunk)) return true;
  /*
    **動詞のまとまりは、主語から切り離さない。**
    `like` / `off` / `near` のように前置詞と同じ綴りの動詞があり、
    綴りだけで見ると「I / like everything」と割れる。役割で外す。
  */
  if (chunk.role === 'V') return false;
  if (PREPOSITIONS.has(first)) return true;
  if (RELATIVES.has(first)) return true;
  return startsWithVerbal(chunk);
};

/** 6. 主語・目的語・補語が長いか。長いときだけ後ろで切る */
const isLongPhrase = (chunk) => (
  (chunk.role === 'S' || chunk.role === 'O' || chunk.role === 'C')
  && words(chunk.en).length >= LONG_CHUNK_WORDS
);

/**
 * まとまりの**中**も切る。
 *
 * 区切れるのがチャンクとチャンクの間だけだと、1つのチャンクが長いときに
 * 目印が中に埋もれて切れない（実データで接続詞163・前置詞593・関係詞187か所）。
 * 語の並びを見て、同じ目印の前で切る。
 *
 * **訳は切らない。** 訳はチャンク単位でしか無いので、中で切った小片には
 * 付けられない。英語だけに `/` を足し、訳はまとまり全体に1つ付ける。
 *
 * @param {string} en まとまりの英語
 * @returns {string[]} 切った小片。切るところが無ければ1つだけ
 */
const splitInside = (en) => {
  const list = words(en);
  if (list.length < 2) return [en];

  const pieces = [];
  let current = [list[0]];
  for (let i = 1; i < list.length; i += 1) {
    const word = bareWord(list[i]);
    const previous = bareWord(list[i - 1]);
    const next = bareWord(list[i + 1] || '');
    // next to / according to … は2語で1つの前置詞。**手前**で切り、間では切らない
    const insideCompound = COMPOUND_BEFORE.has(previous) && word === 'to';
    const startsCompound = COMPOUND_BEFORE.has(word) && next === 'to';
    const cut = !insideCompound && (
      startsCompound
      || (CONJUNCTIONS.has(word) && !(word === 'so' && DEGREE_AFTER_SO.has(next)))
      || PREPOSITIONS.has(word)
      || RELATIVES.has(word)
    );
    // **1語だけの小片を作らない。** 「and / new things」のように切ると読みにくい
    if (cut && current.length >= 2) {
      pieces.push(current.join(' '));
      current = [list[i]];
    } else {
      current.push(list[i]);
    }
  }
  pieces.push(current.join(' '));

  // **終わりが1語だけになったら戻す。** 「the time / that the bowl has passed / through.」
  // のように、最後の1語だけが浮いて読みにくくなる
  if (pieces.length > 1 && words(pieces[pieces.length - 1]).length < 2) {
    const tail = pieces.pop();
    pieces[pieces.length - 1] = `${pieces[pieces.length - 1]} ${tail}`;
  }
  return pieces;
};

/**
 * チャンクをスラッシュ読みのまとまりへ組み直す。
 *
 * まとまりの中の区切りは、**訳が用意してあるチャンク（`chunk.slash`）だけ**。
 * 訳の無いところで切ると「区切りはあるのに訳が無い」まとまりができる。
 * 訳は `scripts/slash-translate.mjs` が作る（切る位置は `splitInside` が決める）。
 *
 * @param {Array<{en: string, ja: string, role: string, slash?: Array<{en: string, ja: string}>}>} chunks
 * @returns {Array<{en: string, ja: string}>} 前から読む順に並んだまとまり
 */
export function slashUnits(chunks) {
  const list = (chunks || []).filter((chunk) => chunk && String(chunk.en || '').trim());
  if (list.length === 0) return [];

  // 1. チャンクとチャンクの間で切るかを決める
  const groups = [];
  let current = [list[0]];
  for (let i = 1; i < list.length; i += 1) {
    const chunk = list[i];
    const previous = list[i - 1];
    const cut = endsWithPause(previous.en)   // 5
      || startsBoundary(chunk)               // 1〜4
      || isLongPhrase(previous);             // 6
    if (cut) {
      groups.push(current);
      current = [chunk];
    } else {
      current.push(chunk);
    }
  }
  groups.push(current);

  // 2. まとまりの中を開く。チャンクの中の区切りだけが新しい切れ目になる
  const units = [];
  for (const parts of groups) {
    let unit = [];
    for (const chunk of parts) {
      const inner = Array.isArray(chunk.slash) && chunk.slash.length > 0
        ? chunk.slash
        : [{ en: chunk.en, ja: chunk.ja }];
      // 先頭はいま作っているまとまりに続ける（チャンクの境目では切らない）
      unit.push(inner[0]);
      for (let k = 1; k < inner.length; k += 1) {
        units.push(unit);
        unit = [inner[k]];
      }
    }
    units.push(unit);
  }

  return units.map((parts) => ({
    en: parts.map((part) => String(part.en).trim()).join(' '),
    // 頭から順に訳す練習なので、**英語の並びのまま**つなぐ
    ja: parts.map((part) => String(part.ja || '').trim()).filter(Boolean).join(' '),
  }));
}

/**
 * そのチャンクを切るとしたらどこか。**訳を作るときだけ使う**（→ `scripts/slash-translate.mjs`）。
 * 画面はここではなく `chunk.slash` を見る。
 */
export const slashPiecesFor = (chunk) => splitInside(String(chunk?.en || ''));

export default slashUnits;
