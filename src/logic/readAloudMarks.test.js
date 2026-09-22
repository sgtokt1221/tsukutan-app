/**
 * 音読した本文の色分け。
 *
 * **語の集合で見ると、読んでいないところまで緑になる。**
 * `the` や `is` を前半で一度読んだだけで、後半の同じ語まで「読めた」になっていた
 * （2026-09-22 に指摘）。読んだ順に突き合わせることをここで固定する。
 */
import { markPassage, normalizeWord, readAloudScore, countsAsAloud, ALOUD_PASS } from './readAloudMarks';

/** 読めた語／飛ばした語を取り出す */
const readOf = (parts) => parts.filter((p) => p.word && p.read).map((p) => p.text);
const missedOf = (parts) => parts.filter((p) => p.word && !p.read).map((p) => p.text);

describe('読んだ順に突き合わせる', () => {
  /*
    **これが今回の指摘。** 集合で見ると、後半を読んでいなくても
    前半に出た語（the / is / a …）が全部緑になる。
  */
  it('**途中でやめたら、その先は全部 読み飛ばしになる**', () => {
    const text = 'The dog is big. The cat is small.';
    const parts = markPassage(text, 'the dog is big');

    expect(readOf(parts)).toEqual(['The', 'dog', 'is', 'big']);
    // 後半の The と is も、読んでいないので赤のまま
    expect(missedOf(parts)).toEqual(['The', 'cat', 'is', 'small']);
  });

  it('**同じ語は、読んだ回数ぶんだけ緑になる**', () => {
    const parts = markPassage('the dog and the cat', 'the dog');
    expect(readOf(parts)).toEqual(['the', 'dog']);
    expect(missedOf(parts)).toEqual(['and', 'the', 'cat']);
  });

  it('途中を飛ばしても、その前後は読めたままになる', () => {
    const parts = markPassage('I get up at six.', 'I get at six');
    expect(readOf(parts)).toEqual(['I', 'get', 'at', 'six']);
    expect(missedOf(parts)).toEqual(['up']);
  });

  it('全部読めば全部緑', () => {
    const parts = markPassage('I get up at six.', 'I get up at six');
    expect(missedOf(parts)).toEqual([]);
  });

  it('何も読まなければ全部赤', () => {
    const parts = markPassage('I get up at six.', '');
    expect(readOf(parts)).toEqual([]);
    expect(missedOf(parts)).toHaveLength(5);
  });

  /*
    聞き取りは余計な語を拾うことがある（雑音・言い直し）。
    **本文に無い語は無視する**——本文の並びを崩さない。
  */
  it('言い直しや余計な語が混ざっても、本文の並びで決める', () => {
    const parts = markPassage('I get up at six.', 'um I get uh get up at six you know');
    expect(missedOf(parts)).toEqual([]);
  });

  it('大文字・小文字と句読点の違いで取りこぼさない', () => {
    const parts = markPassage("Don't stop. Keep going!", "dont stop keep going");
    // `don't` は聞き取り側が `dont` なので一致しない。それ以外は読めている
    expect(missedOf(parts)).toEqual(["Don't"]);
  });
});

describe('本文の形を崩さない', () => {
  it('句読点と空白はそのまま残る（つなげると元の本文に戻る）', () => {
    const text = "Don't stop. Keep going!";
    expect(markPassage(text, 'x').map((p) => p.text).join('')).toBe(text);
  });

  it('句読点には色を付けない', () => {
    const parts = markPassage('Hi, there.', 'hi there');
    expect(parts.filter((p) => !p.word).map((p) => p.text)).toEqual([', ', '.']);
  });

  it('語の切り方はサーバの normalize と同じ', () => {
    const serverNormalize = (t) => String(t || '')
      .toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(Boolean);
    for (const text of ['I get up at six.', "Don't worry, it's fine!", 'He is well-known.', 'We met in 2024 — really?']) {
      const mine = markPassage(text, '').filter((p) => p.word).map((p) => normalizeWord(p.text));
      expect(mine).toEqual(serverNormalize(text));
    }
  });

  it('端の値で落ちない', () => {
    expect(markPassage('', 'a')).toEqual([]);
    expect(markPassage(null, null)).toEqual([]);
    expect(markPassage('Hi.', null).filter((p) => p.word).every((p) => p.read === false)).toBe(true);
  });
});

describe('読めた割合', () => {
  /*
    **分母は本文の語数**（異なり語数ではない）。「本文のどれだけを声に出せたか」
    なので、同じ語が2回出てくるなら2回数える。
  */
  it('本文の語数を分母にする', () => {
    expect(readAloudScore(markPassage('I get up at six.', 'I get up at six'))).toBe(100);
    expect(readAloudScore(markPassage('I get up at six.', 'I get up'))).toBe(60);
  });

  it('**後半を読んでいなければ、そのぶん下がる**（集合で見ると100%になっていた）', () => {
    const parts = markPassage('The dog is big. The cat is small.', 'the dog is big');
    expect(readAloudScore(parts)).toBe(50);
  });

  it('**数えられなければ null**（0% と言わない）', () => {
    expect(readAloudScore([])).toBeNull();
    expect(readAloudScore(markPassage('...', 'x'))).toBeNull();
    expect(readAloudScore(null)).toBeNull();
  });
});

/**
 * **つくばホームに出る「音読 ○」は習慣を見るもの**（2026-09-22 に決めた）。
 * 開いて少し声を出しただけの日まで数えると、塾が見ている○の意味が薄まる。
 */
describe('「音読した日」に数える線', () => {
  it('8割', () => {
    expect(ALOUD_PASS).toBe(80);
  });

  it('**ちょうど8割は数える**（境目で落とさない）', () => {
    expect(countsAsAloud(80)).toBe(true);
    expect(countsAsAloud(79)).toBe(false);
    expect(countsAsAloud(100)).toBe(true);
  });

  it('測れていないものは数えない', () => {
    expect(countsAsAloud(null)).toBe(false);
    expect(countsAsAloud(undefined)).toBe(false);
    expect(countsAsAloud(NaN)).toBe(false);
  });

  it('本文の途中でやめた回は数えない', () => {
    const parts = markPassage('The dog is big. The cat is small.', 'the dog is big');
    expect(countsAsAloud(readAloudScore(parts))).toBe(false);
  });

  it('つかえながらでも最後まで読めば数える', () => {
    const parts = markPassage('The dog is big. The cat is small.', 'the dog is big the cat is');
    expect(readAloudScore(parts)).toBe(88);
    expect(countsAsAloud(readAloudScore(parts))).toBe(true);
  });
});
