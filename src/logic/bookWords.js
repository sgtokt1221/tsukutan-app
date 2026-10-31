/**
 * 市販の単語帳を「番号の帯」で区切る。**純関数だけ。**
 *
 * 単語帳はレベルや品詞ではなく**通し番号**で進める（「今日は301〜400」）。
 * 本を開いている生徒と同じ区切りにしないと、アプリと本が別物になる。
 *
 * 帯の幅は**100語**。受験サポートの `src/exam-support/domain/mastery.ts` の
 * `BAND = 100` と同じ値で、定着の表もその幅で出ている。**揃えておかないと、
 * 「1〜100の定着」と「1〜100の学習」が別の範囲を指す。**
 */

/** 帯の幅。**受験サポートの `mastery.ts` の `BAND` と同値に保つ** */
export const BAND = 100;

/**
 * 番号の帯の一覧。**最後の帯は端数で打ち切る**（2,027語なら `2001〜2027`）。
 *
 * 満たない帯を100語に見せると、押したあとに「27語しかない」と食い違う。
 *
 * @param {number} count 収録語数
 * @param {number} [band] 帯の幅
 * @returns {{from: number, to: number, label: string, count: number}[]}
 */
export function rangesOf(count, band = BAND) {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const width = Number.isFinite(band) && band > 0 ? Math.floor(band) : BAND;
  const out = [];
  for (let from = 1; from <= total; from += width) {
    const to = Math.min(from + width - 1, total);
    // 見出しは受験サポートの定着の表と同じ形（`1〜100`）
    out.push({ from, to, label: `${from}〜${to}`, count: to - from + 1 });
  }
  return out;
}

/**
 * 帯に入る語を切り出す。**`no` で選ぶ。並び順に頼らない。**
 *
 * 配列の位置で切ると、いつか並べ替えたときに**黙って別の範囲**を出す。
 *
 * @param {{no: number}[]} words
 * @param {number} from
 * @param {number} to
 */
export function wordsInRange(words, from, to) {
  if (!Array.isArray(words)) return [];
  return words
    .filter((w) => w && Number.isFinite(Number(w.no)) && Number(w.no) >= from && Number(w.no) <= to)
    .sort((a, b) => Number(a.no) - Number(b.no));
}

/**
 * 進捗の鍵に使う範囲の名前。
 *
 * `users/{uid}/freeStudyProgress/{教材id}_{ここ}` になるので、
 * **`_` と `/` を入れない**（鍵が割れる・パスが割れる）。
 */
export const rangeKeyOf = (from, to) => `${from}-${to}`;
