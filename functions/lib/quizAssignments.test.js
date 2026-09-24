const {
  validateCreate, pickQuizWords, summarize, titleOf, QuizInputError, MAX_TARGETS,
} = require('./quizAssignments');

const base = { grade: 1, pageFrom: 10, pageTo: 12, count: 5, direction: 'en-ja', targetUids: ['u1', 'u2'] };

describe('出すときの入力', () => {
  test('そろえた形で返す（ページは小さい方から・対象の重複を除く）', () => {
    expect(validateCreate({ ...base, pageFrom: 12, pageTo: 10, targetUids: ['u1', 'u1', 'u2'] }))
      .toEqual({ grade: 1, pageFrom: 10, pageTo: 12, count: 5, direction: 'en-ja', targetUids: ['u1', 'u2'] });
  });

  test('**学年・ページ・向き・対象がおかしければ出さない**', () => {
    for (const bad of [
      { grade: 4 }, { pageFrom: 0 }, { count: 51 }, { direction: 'x' }, { targetUids: [] },
      { targetUids: ['a/b'] }, { targetUids: Array.from({ length: MAX_TARGETS + 1 }, (_, i) => `u${i}`) },
    ]) {
      expect(() => validateCreate({ ...base, ...bad })).toThrow(QuizInputError);
    }
  });
});

describe('出題する語', () => {
  const cards = [
    { id: 'a', word: 'a', meaning: 'あ', grade: 1, page: 10, order: 1 },
    { id: 'b', word: 'b', meaning: 'い', grade: 1, page: 11, order: 2 },
    { id: 'c', word: 'c', meaning: 'う', grade: 1, page: 13, order: 3 },
    { id: 'd', word: 'd', meaning: 'え', grade: 2, page: 10, order: 4 },
  ];

  test('その学年のページ範囲からだけ。0 なら全部', () => {
    const ids = pickQuizWords(cards, { ...base, count: 0 }, () => 0).map((w) => w.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  test('問題数ぶん。写して持つのは id・語・意味・ページだけ', () => {
    const words = pickQuizWords(cards, { ...base, count: 1 }, () => 0);
    expect(words).toHaveLength(1);
    expect(Object.keys(words[0]).sort()).toEqual(['id', 'meaning', 'page', 'word']);
  });

  test('語が無いページなら出さない', () => {
    expect(() => pickQuizWords(cards, { ...base, pageFrom: 50, pageTo: 60 })).toThrow(QuizInputError);
  });
});

test('集計：済みの人数と平均の正答率', () => {
  const s = summarize({ targetUids: ['u1', 'u2', 'u3'] }, new Map([['u1', { score: 8, total: 10 }], ['u2', { score: 5, total: 10 }]]));
  expect(s.doneCount).toBe(2);
  expect(s.targetCount).toBe(3);
  expect(s.averageRate).toBeCloseTo(0.65);
  expect(s.perStudent[2]).toEqual({ uid: 'u3', done: false });
});

test('見出し', () => {
  expect(titleOf({ grade: 2, pageFrom: 30, pageTo: 45 })).toBe('Sunshine 2年 p.30〜45');
  expect(titleOf({ grade: 1, pageFrom: 8, pageTo: 8 })).toBe('Sunshine 1年 p.8');
});
