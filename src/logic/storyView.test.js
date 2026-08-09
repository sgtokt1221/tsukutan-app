import { splitHighlightTokens, normalizeStory, isDisplayableStory } from './storyView';

describe('splitHighlightTokens', () => {
  test('該当語だけに印を付ける', () => {
    expect(splitHighlightTokens('I gather apples.', ['gather'])).toEqual([
      { text: 'I ', highlight: false },
      { text: 'gather', highlight: true },
      { text: ' apples.', highlight: false },
    ]);
  });

  test('大文字小文字を区別しないが、原文の表記を保つ', () => {
    const tokens = splitHighlightTokens('Gather and gather.', ['gather']);
    expect(tokens.filter((t) => t.highlight).map((t) => t.text)).toEqual(['Gather', 'gather']);
  });

  test('語境界を守る', () => {
    // together の中の gather は拾わない
    expect(splitHighlightTokens('We work together.', ['gather']))
      .toEqual([{ text: 'We work together.', highlight: false }]);
  });

  test('長い語を優先して当てる', () => {
    const tokens = splitHighlightTokens('It stands in front of the store.', ['in', 'in front']);
    expect(tokens.filter((t) => t.highlight).map((t) => t.text)).toEqual(['in front']);
  });

  test('正規表現の記号を含む語でも壊れない', () => {
    const tokens = splitHighlightTokens('Use a (special) word.', ['(special)']);
    expect(tokens.filter((t) => t.highlight).map((t) => t.text)).toEqual(['(special)']);
  });

  test('HTMLを含む生成文をそのまま文字列として返す', () => {
    // ここで <script> がタグとして解釈されないことが要点。
    // 戻り値はテキストの配列なので、描画側は React 要素として組み立てる。
    const malicious = 'Hello <script>alert(1)</script> world';
    const tokens = splitHighlightTokens(malicious, ['world']);
    expect(tokens.map((t) => t.text).join('')).toBe(malicious);
    expect(tokens.some((t) => t.highlight && t.text === 'world')).toBe(true);
  });

  test('対象語が無ければ1区間で返す', () => {
    expect(splitHighlightTokens('plain text', [])).toEqual([{ text: 'plain text', highlight: false }]);
  });

  test('空文字やnullは空配列', () => {
    expect(splitHighlightTokens('', ['a'])).toEqual([]);
    expect(splitHighlightTokens(null, ['a'])).toEqual([]);
  });

  test('空文字の語は無視する', () => {
    expect(splitHighlightTokens('abc', ['', '  ']))
      .toEqual([{ text: 'abc', highlight: false }]);
  });

  test('分割して結合すると元の文章に戻る', () => {
    const text = 'The gather of goods in front of the shop was a disaster.';
    const words = ['gather', 'goods', 'in front of', 'disaster'];
    expect(splitHighlightTokens(text, words).map((t) => t.text).join('')).toBe(text);
  });
});

describe('normalizeStory', () => {
  test('現行スキーマはそのまま通る', () => {
    const story = normalizeStory({
      id: '2026-08',
      status: 'complete',
      title: '今月の長文',
      sentences: [{ english: 'A', japanese: 'あ' }],
      usedWords: ['apple'],
      unusedWords: [],
    });
    expect(story.sentences).toHaveLength(1);
    expect(story.usedWords).toEqual(['apple']);
  });

  test('旧スキーマ（story1 / story2）を変換する', () => {
    const story = normalizeStory({
      id: '2026-07',
      story1: 'First story',
      translation1: '1本目',
      story2: 'Second story',
      translation2: '2本目',
      words: [{ word: 'apple' }, { word: 'banana' }],
      unusedWords: ['banana'],
    });
    expect(story.sentences).toEqual([
      { english: 'First story', japanese: '1本目' },
      { english: 'Second story', japanese: '2本目' },
    ]);
    expect(story.usedWords).toEqual(['apple']);
  });

  test('さらに古い形（story / translation）も変換する', () => {
    const story = normalizeStory({ id: '2026-06', story: 'Only one', translation: '1本だけ' });
    expect(story.sentences).toEqual([{ english: 'Only one', japanese: '1本だけ' }]);
  });

  test('story2 だけ欠けていても1本分は出す', () => {
    const story = normalizeStory({ story1: 'A', translation1: 'あ', story2: null, translation2: null });
    expect(story.sentences).toHaveLength(1);
  });

  test('Firestore Timestamp を日付文字列にする', () => {
    const story = normalizeStory({ createdAt: { seconds: 1786000000 } });
    expect(typeof story.createdAt).toBe('string');
  });

  test('タイトルが無ければ既定値を入れる', () => {
    expect(normalizeStory({}).title).toBe('今月の長文');
  });

  test('usedWords が無ければ words と unusedWords から作る', () => {
    const story = normalizeStory({
      words: ['apple', 'banana', 'cherry'],
      unusedWords: ['cherry'],
    });
    expect(story.usedWords).toEqual(['apple', 'banana']);
  });

  test('null は null', () => {
    expect(normalizeStory(null)).toBeNull();
  });
});

describe('isDisplayableStory', () => {
  test('完成したものだけ表示する', () => {
    expect(isDisplayableStory({ status: 'complete' })).toBe(true);
    // status を持たない旧文書も表示対象
    expect(isDisplayableStory({ sentences: [] })).toBe(true);
    expect(isDisplayableStory({ status: 'generating' })).toBe(false);
    expect(isDisplayableStory({ status: 'failed' })).toBe(false);
    expect(isDisplayableStory(null)).toBe(false);
  });
});
