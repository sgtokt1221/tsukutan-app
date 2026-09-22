/**
 * 音読した本文の色分け。
 *
 * **語の切り方がサーバ（`functions/lib/transcription.js` の `normalize`）と
 * 食い違うと、色だけが静かにずれる**。ここで同じであることを固定する。
 */
import { markPassage, normalizeWord, readAloudScore } from './readAloudMarks';

/** サーバの normalize（写し）。**向こうを直したら、ここも落ちるようにしてある** */
const serverNormalize = (text) => String(text || '')
  .toLowerCase()
  .replace(/[^a-z0-9\s']/g, ' ')
  .split(/\s+/)
  .filter(Boolean);

describe('語の切り方がサーバと同じ', () => {
  it.each([
    'I get up at six.',
    "Don't worry, it's fine!",
    'He is well-known in town.',
    'We met in 2024 — really?',
  ])('%s', (text) => {
    const mine = markPassage(text, []).filter((p) => p.word).map((p) => normalizeWord(p.text));
    expect(mine).toEqual(serverNormalize(text));
  });
});

describe('本文に印を付ける', () => {
  it('読み飛ばした語だけ read:false になる', () => {
    const parts = markPassage('I get up at six.', ['at', 'six']);
    const words = parts.filter((p) => p.word);
    expect(words.map((p) => p.text)).toEqual(['I', 'get', 'up', 'at', 'six']);
    expect(words.map((p) => p.read)).toEqual([true, true, true, false, false]);
  });

  /*
    **句読点と空白を落とさない。** 落とすと本文が1行に潰れて読めなくなる。
  */
  it('句読点と空白はそのまま残る（つなげると元の本文に戻る）', () => {
    const text = "Don't stop. Keep going!";
    expect(markPassage(text, []).map((p) => p.text).join('')).toBe(text);
  });

  it('句読点には色を付けない', () => {
    const parts = markPassage('Hi, there.', ['hi']);
    expect(parts.filter((p) => !p.word).map((p) => p.text)).toEqual([', ', '.']);
  });

  /*
    サーバは「言った語の集合」で判定している（`said.has(word)`）ので、
    飛ばした語は**どこにも出てこなかった**ということ。
    2つ目の the だけ読めた、という状態は作れない。
  */
  it('**同じ語は出てくるところ全部が同じ色になる**', () => {
    const parts = markPassage('The dog and the cat.', ['the']);
    const the = parts.filter((p) => p.word && normalizeWord(p.text) === 'the');
    expect(the).toHaveLength(2);
    expect(the.every((p) => p.read === false)).toBe(true);
  });

  it('大文字・小文字の違いで取りこぼさない', () => {
    const parts = markPassage('The dog.', ['the']);
    expect(parts.find((p) => p.text === 'The').read).toBe(false);
  });

  it('端の値で落ちない', () => {
    expect(markPassage('', ['a'])).toEqual([]);
    expect(markPassage(null, null)).toEqual([]);
    expect(markPassage('Hi.', null).filter((p) => p.word).every((p) => p.read)).toBe(true);
  });
});

describe('読めた割合', () => {
  it('分母はサーバが数えた異なり語数', () => {
    expect(readAloudScore(5, [])).toBe(100);
    expect(readAloudScore(5, ['at', 'six'])).toBe(60);
  });

  /*
    **数えられないときは 0% と言わない。** 0% は「全部飛ばした」という意味になり、
    「まだ測れていない」と区別が付かない。
  */
  it('**数えられなければ null**（0% と言わない）', () => {
    expect(readAloudScore(0, [])).toBeNull();
    expect(readAloudScore(undefined, [])).toBeNull();
    expect(readAloudScore(null, ['a'])).toBeNull();
  });
});
