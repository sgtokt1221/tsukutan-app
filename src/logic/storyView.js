/**
 * src/logic/storyView.js
 *
 * 生成されたストーリーを画面へ出すための変換。React に依存しない。
 * IMPLEMENTATION_PLAN.md 12.4。
 */

/**
 * 復習単語の位置でテキストを分割する。
 *
 * AI が生成した文章を dangerouslySetInnerHTML で流し込むと、
 * 生成物に含まれる HTML がそのまま実行される。
 * ここでは印を付けた区間の配列を返すだけにして、
 * 描画側が React 要素として組み立てられるようにする。
 *
 * @returns {Array<{text: string, highlight: boolean}>}
 */
export const splitHighlightTokens = (text, words = []) => {
  if (typeof text !== 'string' || text === '') return [];

  const targets = (words || [])
    .filter((word) => typeof word === 'string' && word.trim() !== '')
    // 長い語から先に当てないと "in front" が "in" で切られる
    .sort((a, b) => b.length - a.length);

  if (targets.length === 0) return [{ text, highlight: false }];

  // 語境界（\b）は英数字の隣でしか成立しない。
  // "(all) on one's own" のように記号で始まる項目があるので、
  // 語ごとに端が英数字かどうかを見て \b を付けるか決める。
  const alternatives = targets.map((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const left = /^[A-Za-z0-9]/.test(word) ? '\\b' : '';
    const right = /[A-Za-z0-9]$/.test(word) ? '\\b' : '';
    return `${left}${escaped}${right}`;
  });
  const regex = new RegExp(`(${alternatives.join('|')})`, 'gi');

  const tokens = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[0].length === 0) {
      regex.lastIndex += 1;
      continue;
    }
    if (match.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, match.index), highlight: false });
    }
    tokens.push({ text: match[0], highlight: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), highlight: false });
  }
  return tokens;
};

/**
 * 保存済みストーリーを画面が扱う形へそろえる。
 *
 * 現行スキーマ : { status, title, sentences: [{english, japanese}], usedWords, unusedWords }
 * 旧スキーマ1  : { story1, translation1, story2, translation2 }
 * 旧スキーマ2  : { story, translation }
 *
 * 読み込み時にだけ変換する。保存は現行スキーマだけで行う。
 */
export const normalizeStory = (raw) => {
  if (!raw) return null;
  const story = { ...raw };

  if (story.createdAt && typeof story.createdAt === 'object' && story.createdAt.seconds) {
    story.createdAt = new Date(story.createdAt.seconds * 1000).toLocaleDateString('ja-JP');
  }

  if (!Array.isArray(story.sentences) || story.sentences.length === 0) {
    const sentences = [];
    if (story.story1 && story.translation1) {
      sentences.push({ english: story.story1, japanese: story.translation1 });
    }
    if (story.story2 && story.translation2) {
      sentences.push({ english: story.story2, japanese: story.translation2 });
    }
    if (sentences.length === 0 && story.story) {
      sentences.push({ english: story.story, japanese: story.translation || '' });
    }
    story.sentences = sentences;
  }

  if (!Array.isArray(story.usedWords)) {
    const unused = new Set(story.unusedWords || []);
    story.usedWords = (story.words || [])
      .map((word) => (typeof word === 'string' ? word : word?.word))
      .filter((word) => word && !unused.has(word));
  }

  if (!Array.isArray(story.unusedWords)) story.unusedWords = [];
  if (!story.title) story.title = '今月の長文';
  return story;
};

/** 一覧に出してよいストーリーか（生成中・失敗は出さない） */
export const isDisplayableStory = (story) =>
  Boolean(story) && story.status !== 'failed' && story.status !== 'generating';
