/**
 * 音読した本文に、読めた／読み飛ばした の印を付ける。**純関数だけ。**
 *
 * 「85% 読みました」だけでは、**どこを飛ばしたのか分からない**。
 * 本文を並べて色を付ければ、読み直す場所がそのまま見える。
 *
 * ## 語の切り方はサーバと同じにする
 *
 * 読み飛ばしを決めているのは `functions/lib/transcription.js` の `normalize`:
 *
 *   小文字にして、`a-z0-9` と `'` 以外を空白にして、空白で割る
 *
 * **ここが食い違うと、色だけが静かにずれる**（本文では赤いのに一覧には無い、
 * その逆、など）。だから同じ規則で切り、同じ形に直してから突き合わせる。
 *
 * ## 同じ語は、出てくるところ全部が同じ色になる
 *
 * サーバは「言った語の集合」に入っているかで決めている（`said.has(word)`）ので、
 * ある語を飛ばしたなら**その語はどこにも出てこなかった**ということ。
 * 2つ目の `the` だけ読めた、という状態はそもそも作れない。
 */

/** サーバの `normalize` と同じ形に直す。**片方だけ変えない** */
export const normalizeWord = (text) =>
  String(text || '').toLowerCase().replace(/[^a-z0-9']/g, '');

/**
 * 本文を、語と語でないもの（空白・句読点）に割る。
 *
 * 句読点や改行をそのまま残すので、**本文の見た目が崩れない**。
 *
 * @param {string} referenceText 読むべき英文
 * @param {string[]} missing 読み飛ばした語（サーバが返す。すでに正規化済み）
 * @returns {{text: string, word: boolean, read: boolean}[]}
 *   `word` が false のものは句読点・空白（色を付けない）
 */
export function markPassage(referenceText, missing) {
  const text = String(referenceText || '');
  if (text === '') return [];
  const missed = new Set((missing || []).map(normalizeWord).filter(Boolean));

  // 語を捕まえる形で割る。捕まえた組も残るので、句読点と空白がそのまま残る
  return text
    .split(/([A-Za-z0-9']+)/)
    .filter((part) => part !== '')
    .map((part) => {
      const key = normalizeWord(part);
      // **数字だけ・記号だけの塊は語として扱わない。** 色を付けても読み直せない
      if (key === '' || !/[A-Za-z0-9]/.test(part)) return { text: part, word: false, read: true };
      return { text: part, word: true, read: !missed.has(key) };
    });
}

/**
 * 読めた割合。**分母はサーバが数えた異なり語数**（`uniqueWordCount`）。
 *
 * ここで本文から数え直さない。サーバと1語でもずれると、
 * 画面の％と読み飛ばしの数が合わなくなる。
 *
 * @param {number} total 読むべき異なり語数
 * @param {string[]} missing 読み飛ばした語
 * @returns {number|null} 数えられないときは null（0% と言わない）
 */
export function readAloudScore(total, missing) {
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return null;
  const missed = Array.isArray(missing) ? missing.length : 0;
  return Math.round(((n - missed) / n) * 100);
}
