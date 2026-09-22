/**
 * 音読した本文に、読めた／読み飛ばした の印を付ける。**純関数だけ。**
 *
 * 「85% 読みました」だけでは、**どこを飛ばしたのか分からない**。
 * 本文を並べて色を付ければ、読み直す場所がそのまま見える。
 *
 * ## 語の集合で見ない。読んだ順に突き合わせる
 *
 * サーバの `missingWords`（`functions/lib/transcription.js`）は
 * **「言った語の集合」に入っているか**で決めている。これを色分けに使うと、
 * `the` や `is` を前半で一度読んだだけで、**読んでいない後半の同じ語まで緑**になる
 * （2026-09-22 に指摘された。半分でやめた生徒ほど、実際より読めたように出る）。
 *
 * ここでは**最長共通部分列**で、本文の語と読み上げの語を**前から順に**対応させる。
 * 順番を保ったまま対応が付いた語だけを「読めた」とするので、
 *
 * - 途中でやめたら、その先は全部「読み飛ばし」になる
 * - 同じ語が何度出てきても、**読んだ回数ぶんだけ**緑になる
 * - 途中を飛ばしても、その前後は緑のまま
 *
 * ## サーバは変えていない
 *
 * `missingWords` は英検二次（面接）でも使っている。あちらは「言うべき語を
 * 言えたか」を見ており、順番は関係ないので、**集合で正しい**。
 */

/** サーバの `normalize` と同じ形に直す（小文字・`a-z0-9'` 以外は落とす） */
export const normalizeWord = (text) =>
  String(text || '').toLowerCase().replace(/[^a-z0-9']/g, '');

/** 読み上げを語に割る。サーバの `normalize` と同じ規則 */
const tokensOf = (text) => String(text || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s']/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

/**
 * 本文の語のうち、読み上げと順番どおりに対応が付いたものに印を付ける。
 *
 * 最長共通部分列。本文 n 語 × 読み上げ m 語の表を作る。長文は100語ほどなので、
 * 掛け算しても十分に軽い。
 *
 * @param {string[]} ref 本文の語（正規化済み）
 * @param {string[]} said 読み上げの語（正規化済み）
 * @returns {boolean[]} `ref` と同じ長さ。true が「読めた」
 */
function alignedMask(ref, said) {
  const n = ref.length;
  const m = said.length;
  const mask = new Array(n).fill(false);
  if (n === 0 || m === 0) return mask;

  // len[i][j] … ref の i 以降と said の j 以降で、共通して取れる最大の語数
  const len = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      len[i][j] = ref[i] === said[j]
        ? len[i + 1][j + 1] + 1
        : Math.max(len[i + 1][j], len[i][j + 1]);
    }
  }

  // 前から辿り直して、対応が付いた語に印を付ける
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ref[i] === said[j]) {
      mask[i] = true;
      i += 1;
      j += 1;
    } else if (len[i + 1][j] >= len[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return mask;
}

/**
 * 本文を、語と語でないもの（空白・句読点）に割り、読めたかどうかを付ける。
 *
 * 句読点や改行をそのまま残すので、**本文の見た目が崩れない**。
 *
 * @param {string} referenceText 読むべき英文
 * @param {string} transcript 聞き取れた文（`transcribeSpeaking` が返すもの）
 * @returns {{text: string, word: boolean, read: boolean}[]}
 *   `word` が false のものは句読点・空白（色を付けない）
 */
export function markPassage(referenceText, transcript) {
  const text = String(referenceText || '');
  if (text === '') return [];

  // 語を捕まえる形で割る。捕まえた組も残るので、句読点と空白がそのまま残る
  const parts = text
    .split(/([A-Za-z0-9']+)/)
    .filter((part) => part !== '')
    .map((part) => {
      const key = normalizeWord(part);
      // **数字だけ・記号だけの塊は語として扱わない。** 色を付けても読み直せない
      const word = key !== '' && /[A-Za-z0-9]/.test(part);
      return { text: part, word, key };
    });

  const refWords = parts.filter((p) => p.word);
  const mask = alignedMask(refWords.map((p) => p.key), tokensOf(transcript));

  let at = 0;
  return parts.map(({ text: t, word }) => {
    if (!word) return { text: t, word: false, read: true };
    const read = mask[at];
    at += 1;
    return { text: t, word: true, read };
  });
}

/**
 * 読めた割合。**本文の語数を分母にする**（異なり語数ではない）。
 *
 * 「本文のどれだけを声に出せたか」なので、同じ語が2回出てくるなら2回数える。
 *
 * @param {{word: boolean, read: boolean}[]} parts `markPassage` の結果
 * @returns {number|null} 数えられないときは null（0% と言わない）
 */
export function readAloudScore(parts) {
  const words = (Array.isArray(parts) ? parts : []).filter((p) => p && p.word);
  if (words.length === 0) return null;
  return Math.round((words.filter((p) => p.read).length / words.length) * 100);
}
