import { flashcardGesture, wordbookGesture, TAP_SLOP } from './cardGestures';

describe('フラッシュカードの指の動き', () => {
  it('右＝わかった／左＝もう一度', () => {
    expect(flashcardGesture(150, 10, false)).toBe('good');
    expect(flashcardGesture(-150, 10, false)).toBe('again');
  });

  it('**上スワイプは、効くモードのときだけ外す**', () => {
    expect(flashcardGesture(0, -150, true)).toBe('remove');
    expect(flashcardGesture(0, -150, false)).toBeNull();
  });

  it('下スワイプは何もしない', () => {
    expect(flashcardGesture(0, 150, true)).toBeNull();
  });

  it('ほとんど動かなければめくる', () => {
    expect(flashcardGesture(0, 0, true)).toBe('flip');
    expect(flashcardGesture(TAP_SLOP - 1, 0, true)).toBe('flip');
    expect(flashcardGesture(TAP_SLOP, 0, true)).toBeNull();
  });

  it('短いスワイプは何もしない（めくりもしない）', () => {
    expect(flashcardGesture(60, 0, true)).toBeNull();
  });
});

describe('単語帳の指の動き', () => {
  it('横に払えば採点', () => {
    expect(wordbookGesture(80, 10)).toBe('good');
    expect(wordbookGesture(-80, 10)).toBe('again');
  });

  it('**縦は何もしない**（一覧のスクロール）', () => {
    expect(wordbookGesture(0, -200)).toBeNull();
    expect(wordbookGesture(60, 90)).toBeNull();
  });
});
