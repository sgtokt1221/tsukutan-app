/**
 * スラッシュリーディングの区切り。
 *
 * ## SVOCM の切れ目で必ず切る（2026-09-23 に変えた）
 *
 * 読みもののデータ（`chunks`）は S / V / O / C / M の単位で切ってある。
 * **その切れ目をそのままスラッシュにする。**
 *
 *   I / get up / at six / in the morning.
 *   My mother / makes / breakfast / at home.
 *
 * もとは「主語と動詞は一息で読む」として S と V をくっつけ、前置詞・接続詞・
 * 関係詞などの目印（下の語の一覧）で切る場所を決めていた。**塾の教え方に合わせて
 * 切り方を変えた**——意味のカタマリごとに切る。その結果、
 *
 * - 短い文でも細かく割れる（5級の `I / get up` も割れる）
 * - 動詞が1語だけのまとまりになることがある（`One of the causes / is / …`）。
 *   **これは正しい**——V は V で1つのカタマリなので
 *
 * ## 区切りは2か所で決まる
 *
 * 1. **チャンクとチャンクの間** … ここ（`slashUnits`）。実行時に決まる
 * 2. **チャンクの中** … データに焼き込み済み（`chunk.slash`）。訳が付いているので
 *    実行時には作れない。作るのは `scripts/slash-translate.mjs` で、
 *    切る位置は下の `splitInside` が決める
 *
 * **2を勝手に計算し直さない。** 訳が無いまとまりができる。
 *
 * ## 下の語の一覧は「チャンクの中」用
 *
 * 前置詞・接続詞・関係詞の一覧は、**いまは `splitInside` だけが使う**
 * （＝チャンクの中をどこで切るか）。チャンク間の判定には使わない。
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

const words = (text) => String(text || '').trim().split(/\s+/).filter(Boolean);

/** 記号を落として比べる。`(`、引用符、末尾の句読点を外す */
const bareWord = (word) => String(word || '').toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');

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

/**
 * **この語の前では切らない。**
 *
 * `than` は比較級とひと続きで読む。前置詞の一覧に入っているせいで
 * 「a history of more / than five hundred years.」「safer / than before.」の
 * ように割れていた（2026-09-23 に実データで12か所）。
 * **一覧から外さない**——`than` は前置詞であることに変わりなく、
 * ここで「切らない」と決めているだけ。
 */
const NEVER_BEFORE = new Set(['than']);
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
    const cut = !insideCompound && !NEVER_BEFORE.has(word) && (
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

/** 札の許可値。データに無い役割が来たら M として沈める（札が空になるよりまし） */
const ROLES = new Set(['S', 'V', 'O', 'C', 'M']);

/**
 * チャンクを「札1つ＋中の小片」の組へ組み直す。**スラッシュ画面はこれを描く。**
 *
 * ## スラッシュと SVOC を1画面にした（2026-09-23）
 *
 * SVOCM の切れ目で必ず切るようにしたので、スラッシュと SVOC は同じ区切りを
 * 見るようになった。違いは (1) チャンクの中の区切りと (2) `than` だけ。
 * そこで**組（= SVOCM の1要素）の上に札を1つ**載せ、組の中の小片ごとに訳を出す。
 *
 *   組と組の間   … 太い `/`（SVOCM の切れ目。塾で教えている切り方）
 *   組の中の小片 … 細い `/`（長い主語・修飾語を読みやすく割っただけ）
 *
 * **中の区切りをここで計算し直さない。** 訳はチャンク単位でしか無く、
 * 小片の訳は `scripts/slash-translate.mjs` が作って `chunk.slash` に入れてある。
 * 計算し直すと「区切りはあるのに訳が無い」まとまりができる。
 *
 * @param {Array<{en: string, ja: string, role: string, slash?: Array<{en: string, ja: string}>}>} chunks
 * @returns {Array<{role: string, pieces: Array<{en: string, ja: string}>}>} 前から読む順
 */
export function slashGroups(chunks) {
  const groups = [];
  for (const chunk of (chunks || [])) {
    if (!chunk || !String(chunk.en || '').trim()) continue;
    const inner = Array.isArray(chunk.slash) && chunk.slash.length > 0
      ? chunk.slash
      : [{ en: chunk.en, ja: chunk.ja }];
    const pieces = inner
      .map((part) => ({ en: String(part?.en || '').trim(), ja: String(part?.ja || '').trim() }))
      .filter((part) => part.en !== '');
    if (pieces.length === 0) continue;

    /*
      **`than` の前だけは切らない**（SVOCM で必ず切ることへの唯一の例外）。
      比較級とひと続きで読むもので、データ上は `than before.` が M として
      独立していることがある。切ると「fewer books / than before.」と
      比較が割れる（2026-09-23 に実データで8か所）。
      **札も付けない**——前の組の最後の小片に足す。独立した M 札を立てると、
      「ひと続きで読む」と画面の見た目が食い違う（2026-09-23 に決めた）。
    */
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && NEVER_BEFORE.has(bareWord(words(pieces[0].en)[0]))) {
      const tail = lastGroup.pieces[lastGroup.pieces.length - 1];
      const head = pieces.shift();
      tail.en = `${tail.en} ${head.en}`;
      tail.ja = [tail.ja, head.ja].filter(Boolean).join(' ');
      lastGroup.pieces.push(...pieces);
      continue;
    }

    const role = String(chunk.role || '').toUpperCase();
    groups.push({ role: ROLES.has(role) ? role : 'M', pieces });
  }
  return groups;
}

/**
 * スラッシュのまとまりを平たく並べたもの。**正本は `slashGroups`**
 * （同じ切り方を2か所に書かない）。訳の検査（`readingSlashData.test.js`）が使う。
 *
 * @returns {Array<{en: string, ja: string}>} 前から読む順に並んだまとまり
 */
export function slashUnits(chunks) {
  return slashGroups(chunks).flatMap((group) => group.pieces);
}

/**
 * そのチャンクを切るとしたらどこか。**訳を作るときだけ使う**（→ `scripts/slash-translate.mjs`）。
 * 画面はここではなく `chunk.slash` を見る。
 */
export const slashPiecesFor = (chunk) => splitInside(String(chunk?.en || ''));

export default slashUnits;
