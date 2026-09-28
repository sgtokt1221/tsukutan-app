/**
 * 英検の級まわり。StudentDashboard（自由学習の英検教材）と、日々の新しい単語
 * （logic/newWordSources.js）の両方が使う。**級の判定をここ1か所にする。**
 *
 * つくばホームの管理画面の定着度（functions/lib/textbookMastery.js の easiestEiken）も
 * 同じ規則——複数の級に属する語は、いちばんやさしい級1つにだけ入れる。
 */

/** 英検の級を、やさしい順に並べたもの。実データに1級の語は無い。 */
export const EIKEN_ORDER = [5, 4, 3, 'pre2', 2, 'pre1'];

/**
 * その単語が属する英検の級。複数の級に入っている語は
 * 一番やさしい級のものとして扱う。
 *
 * 実データでは 2,462 件が複数の級に属していて（"a lot of" は 3級・4級・5級）、
 * 級ごとに数えると同じ語を何度も数えてしまう。準1級だと合計 7,867 語と、
 * 実際の収録 4,478 語の倍近くになっていた。
 */
export const easiestEikenLevel = (word) => {
  if (!Array.isArray(word?.eikenLevels)) return null;
  const known = word.eikenLevels.filter((level) => EIKEN_ORDER.includes(level));
  if (known.length === 0) return null;
  return known.reduce((a, b) => (EIKEN_ORDER.indexOf(a) < EIKEN_ORDER.indexOf(b) ? a : b));
};

/** 教材ID（eiken-3 / eiken-pre2 など）からその級を取り出す。 */
export const eikenTargetOf = (textbookId = '') => {
  const levelPart = textbookId.split('-')[1];
  if (levelPart === 'pre2' || levelPart === 'pre1') return levelPart;
  const numeric = parseInt(levelPart, 10);
  return Number.isNaN(numeric) ? null : numeric;
};
