/**
 * 市販の単語帳の「番号の帯」。
 *
 * 本を開いている生徒と同じ区切りでなければ意味が無いので、
 * **端数の出し方**と**帯の幅**をここで固定する。
 */
import { rangesOf, wordsInRange, rangeKeyOf, BAND } from './bookWords';

describe('番号の帯', () => {
  it('**幅は100語。** 受験サポートの定着の表（mastery.ts の BAND）と同じ', () => {
    expect(BAND).toBe(100);
  });

  it('ちょうど割り切れる本（ターゲット1900 = 19本）', () => {
    const r = rangesOf(1900);
    expect(r).toHaveLength(19);
    expect(r[0]).toEqual({ from: 1, to: 100, label: '1〜100', count: 100 });
    expect(r[18]).toEqual({ from: 1801, to: 1900, label: '1801〜1900', count: 100 });
  });

  it('**端数は最後の帯で打ち切る**（シス単 2,027語 → 最後は 2001〜2027）', () => {
    const r = rangesOf(2027);
    expect(r).toHaveLength(21);
    expect(r[20]).toEqual({ from: 2001, to: 2027, label: '2001〜2027', count: 27 });
  });

  /*
    満たない帯を「100語」と見せると、押したあとに件数が食い違う。
    選ぶ前に本当の数が読めることが大事。
  */
  it('**最後の帯の語数は本当の数**（27語を100語と言わない）', () => {
    expect(rangesOf(2027)[20].count).toBe(27);
    expect(rangesOf(150)).toEqual([
      { from: 1, to: 100, label: '1〜100', count: 100 },
      { from: 101, to: 150, label: '101〜150', count: 50 },
    ]);
  });

  it('端の値で落ちない', () => {
    expect(rangesOf(0)).toEqual([]);
    expect(rangesOf(-5)).toEqual([]);
    expect(rangesOf(null)).toEqual([]);
    expect(rangesOf(undefined)).toEqual([]);
    expect(rangesOf(1)).toEqual([{ from: 1, to: 1, label: '1〜1', count: 1 }]);
  });
});

describe('帯の語を切り出す', () => {
  const words = [
    { no: 1, word: 'a' },
    { no: 2, word: 'b' },
    { no: 3, word: 'c' },
    { no: 4, word: 'd' },
  ];

  it('範囲の内側だけ返す', () => {
    expect(wordsInRange(words, 2, 3).map((w) => w.word)).toEqual(['b', 'c']);
  });

  /*
    **配列の位置で切らない。** いつか並べ替えたときに、黙って別の範囲を出す。
  */
  it('**並びが崩れていても `no` で選び、番号順に戻す**', () => {
    const shuffled = [words[3], words[0], words[2], words[1]];
    expect(wordsInRange(shuffled, 1, 3).map((w) => w.no)).toEqual([1, 2, 3]);
  });

  it('壊れた中身を混ぜても落ちない', () => {
    expect(wordsInRange([null, { no: 'x' }, { no: 2 }], 1, 3)).toEqual([{ no: 2 }]);
    expect(wordsInRange(null, 1, 3)).toEqual([]);
  });
});

describe('進捗の鍵', () => {
  /*
    鍵は `users/{uid}/freeStudyProgress/{教材id}_{範囲}`。
    `_` を入れると画面側が組み立てる鍵と割れて、いつまでも「未学習」に見える。
    `/` を入れると Firestore のパスが割れる。
  */
  it('**`_` も `/` も入れない**', () => {
    const key = rangeKeyOf(101, 200);
    expect(key).toBe('101-200');
    expect(key).not.toContain('_');
    expect(key).not.toContain('/');
  });
});
