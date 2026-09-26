/**
 * 英文の語数と短縮形。**サーバ（functions/lib/writingScore.js）と同じ規則**で数える。
 * 片方だけ直すと、画面の語数と採点の語数が食い違う（writingText.test.js が同じ例で確かめる）。
 */

/** 英字か数字を含むまとまりを1語と数える（記号だけの塊は数えない） */
export const countWords = (text) => String(text || '')
  .split(/\s+/)
  .filter((token) => /[A-Za-z0-9]/.test(token))
  .length;

/**
 * 短縮形（I'm / It's / don't …）。塾の教材が「短縮しちゃだめ」としているので印を付ける。
 * 所有の 's（Tom's）と区別がつかないものは数えない
 */
const CONTRACTION = /\b(?:I'm|I've|I'll|I'd|you're|you've|you'll|you'd|we're|we've|we'll|we'd|they're|they've|they'll|they'd|he's|she's|it's|that's|there's|what's|let's|\w+n't)\b/gi;
export const findContractions = (text) => (String(text || '').replace(/[’`]/g, "'").match(CONTRACTION) || []);

/** 語数の状態：足りない／ちょうど／多い */
export const lengthState = (words, min, max) => {
  if (words < min) return 'short';
  if (words > max) return 'long';
  return 'ok';
};
