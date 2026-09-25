const {
  validateCreate, pickQuizWords, summarize, titleOf, QuizInputError, MAX_TARGETS,
} = require('./quizAssignments');

const base = { grade: 1, pageFrom: 10, pageTo: 12, count: 5, direction: 'en-ja', targetUids: ['u1', 'u2'] };

describe('出すときの入力', () => {
  test('そろえた形で返す（ページは小さい方から・対象の重複を除く）', () => {
    expect(validateCreate({ ...base, pageFrom: 12, pageTo: 10, targetUids: ['u1', 'u1', 'u2'] }))
      .toEqual({ source: 'textbook', grade: 1, pageFrom: 10, pageTo: 12, count: 5, direction: 'en-ja', targetUids: ['u1', 'u2'] });
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

describe('苦手な単語から出す', () => {
  const { pickWeakWords } = require('./quizAssignments');

  test('**対象は1人だけ**。学年やページは要らない', () => {
    expect(validateCreate({ source: 'weak', count: 10, direction: 'ja-en', targetUids: ['u1'] }))
      .toEqual({ source: 'weak', count: 10, direction: 'ja-en', targetUids: ['u1'] });
    expect(() => validateCreate({ source: 'weak', count: 10, direction: 'en-ja', targetUids: ['u1', 'u2'] })).toThrow(QuizInputError);
  });

  test('苦手な順に上から。0 は全部（上限つき）。無ければ出さない', () => {
    const weak = [{ id: 'a', word: 'a', meaning: 'あ', lastWrong: true }, { id: 'b', word: 'b', meaning: 'い' }, { id: 'c', word: 'c', meaning: '' }];
    expect(pickWeakWords(weak, 1)).toEqual([{ id: 'a', word: 'a', meaning: 'あ' }]);
    expect(pickWeakWords(weak, 0).map((w) => w.id)).toEqual(['a', 'b']);
    expect(() => pickWeakWords([], 10)).toThrow(QuizInputError);
  });

  test('見出し', () => {
    expect(titleOf({ source: 'weak' })).toBe('苦手な単語');
  });
});

describe('単語帳・英検から出す（2026-09-26。高校生の出題元）', () => {
  const {
    pickSourceWords, wordsInBookRange, wordsOfEiken, QUIZ_BOOKS, QUIZ_EIKEN_LEVELS, MAX_QUESTIONS, dataFileOf,
  } = require('./quizAssignments');
  const one = { count: 10, direction: 'en-ja', targetUids: ['u1'] };

  test('単語帳：本と見出し番号の範囲（小さい方から）', () => {
    expect(validateCreate({ ...one, source: 'book', bookId: 'book-leap', noFrom: 100, noTo: 1 }))
      .toEqual({ source: 'book', bookId: 'book-leap', noFrom: 1, noTo: 100, count: 10, direction: 'en-ja', targetUids: ['u1'] });
    for (const bad of [{ bookId: 'book-x' }, { bookId: undefined }, { noFrom: 0 }, { noTo: 'a' }, { targetUids: [] }]) {
      expect(() => validateCreate({ ...one, source: 'book', bookId: 'book-leap', noFrom: 1, noTo: 10, ...bad })).toThrow(QuizInputError);
    }
  });

  test('英検：級は 5〜準1級だけ（1級は語に印が無い）', () => {
    expect(validateCreate({ ...one, source: 'eiken', eiken: 'pre2' }))
      .toEqual({ source: 'eiken', eiken: 'pre2', count: 10, direction: 'en-ja', targetUids: ['u1'] });
    expect(validateCreate({ ...one, source: 'eiken', eiken: 3 }).eiken).toBe('3');
    for (const eiken of ['1', 'x', undefined]) {
      expect(() => validateCreate({ ...one, source: 'eiken', eiken })).toThrow(QuizInputError);
    }
  });

  test('知らない出題元は出さない。書いていなければ教科書（前の画面の形）', () => {
    expect(() => validateCreate({ ...one, source: 'nope' })).toThrow(QuizInputError);
    expect(validateCreate({ ...base }).source).toBe('textbook');
  });

  const book = [
    { id: 'a', word: 'a', meaning: 'あ', no: 3 },
    { id: 'b', word: 'b', meaning: 'い', no: 1 },
    { id: 'c', word: 'c', meaning: 'う', no: 2 },
    { id: 'd', word: 'd', meaning: '', no: 2 },
    { id: 'e', word: 'e', meaning: 'え', no: 9 },
  ];
  test('単語帳の範囲：はじめ〜おわりを含み番号順。意味の無い語は出さない', () => {
    expect(wordsInBookRange(book, 3, 1).map((w) => w.id)).toEqual(['b', 'c', 'a']);
  });

  const master = [
    { id: 'x', word: 'x', meaning: 'x', eikenLevels: [3, 4, 5] },
    { id: 'y', word: 'y', meaning: 'y', eikenLevels: ['pre2', 2] },
    { id: 'z', word: 'z', meaning: 'z', eikenLevels: [3] },
    { id: 'w', word: 'w', meaning: 'w' },
  ];
  test('**英検の級はいちばんやさしい級1つだけ**（[3,4,5] は5級にだけ入る）', () => {
    expect(wordsOfEiken(master, '5').map((w) => w.id)).toEqual(['x']);
    expect(wordsOfEiken(master, '3').map((w) => w.id)).toEqual(['z']);
    expect(wordsOfEiken(master, 'pre2').map((w) => w.id)).toEqual(['y']);
  });

  test('範囲・級から混ぜて count 語。0 は全部だが上限つき。写して持つのは id・語・意味（単語帳は番号も）', () => {
    const picked = pickSourceWords(book, { source: 'book', noFrom: 1, noTo: 3, count: 2 }, () => 0);
    expect(picked).toHaveLength(2);
    expect(Object.keys(picked[0]).sort()).toEqual(['id', 'meaning', 'no', 'word']);
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `m${i}`, word: `m${i}`, meaning: 'm', eikenLevels: [4] }));
    expect(pickSourceWords(many, { source: 'eiken', eiken: '4', count: 0 })).toHaveLength(MAX_QUESTIONS);
    expect(Object.keys(pickSourceWords(master, { source: 'eiken', eiken: '3', count: 1 })[0]).sort()).toEqual(['id', 'meaning', 'word']);
    expect(() => pickSourceWords(book, { source: 'book', noFrom: 50, noTo: 60, count: 1 })).toThrow(QuizInputError);
    expect(() => pickSourceWords(master, { source: 'eiken', eiken: 'pre1', count: 1 })).toThrow(QuizInputError);
  });

  test('見出しとファイル', () => {
    expect(titleOf({ source: 'book', bookId: 'book-target1900', noFrom: 1, noTo: 100 })).toBe('英単語ターゲット1900 No.1〜100');
    expect(titleOf({ source: 'book', bookId: 'book-leap', noFrom: 5, noTo: 5 })).toBe('必携英単語LEAP No.5');
    expect(titleOf({ source: 'eiken', eiken: 'pre2' })).toBe('英検準2級');
    expect(dataFileOf({ source: 'book', bookId: 'book-systan5' })).toBe('words-book-systan5.json');
    expect(dataFileOf({ source: 'eiken', eiken: '3' })).toBe('words-master.json');
    expect(QUIZ_EIKEN_LEVELS.map((l) => l.id)).toEqual(['5', '4', '3', 'pre2', '2', 'pre1']);
  });

  test('**単語帳の id・題名・ファイルは src/config/books.js（正本）と同じ**', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../../src/config/books.js'), 'utf8');
    const books = [...src.matchAll(/id: '([^']+)',\s*deckId: '([^']+)',\s*title: '([^']+)'/g)]
      .map(([, id, deckId, title]) => ({ id, title, file: `words-book-${deckId}.json` }));
    expect(books).toHaveLength(QUIZ_BOOKS.length);
    for (const b of QUIZ_BOOKS) expect(books).toContainEqual(b);
  });
});

describe('教材ごとの「間違えた単語だけ」（2026-09-26。weakOnly）', () => {
  const { weakWordsInSource, pickWeakInSource, WEAK_ONLY_SUFFIX, MAX_QUESTIONS } = require('./quizAssignments');
  const { weakWordsForQuiz } = require('./staffMaterials');
  const one = { count: 0, direction: 'en-ja', targetUids: ['u1'] };

  test('**true のときだけ weakOnly を持つ**（undefined を持つと Firestore が文書ごと拒む）', () => {
    expect(validateCreate({ ...one, source: 'eiken', eiken: '3' })).not.toHaveProperty('weakOnly');
    expect(validateCreate({ ...one, source: 'eiken', eiken: '3', weakOnly: 'yes' })).not.toHaveProperty('weakOnly');
    expect(validateCreate({ ...one, source: 'eiken', eiken: '3', weakOnly: true }).weakOnly).toBe(true);
    expect(validateCreate({ ...one, source: 'book', bookId: 'book-leap', noFrom: 1, noTo: 5, weakOnly: true }).weakOnly).toBe(true);
    expect(validateCreate({ ...one, grade: 1, pageFrom: 1, pageTo: 2, weakOnly: true }).weakOnly).toBe(true);
    // 苦手な単語にはもともと範囲が無いので付けない
    expect(validateCreate({ ...one, source: 'weak', weakOnly: true })).not.toHaveProperty('weakOnly');
  });

  test('**生徒ごとに語が違うので、対象は1人だけ**', () => {
    expect(() => validateCreate({ ...one, source: 'eiken', eiken: '3', weakOnly: true, targetUids: ['u1', 'u2'] }))
      .toThrow('間違えた単語だけの小テストは、1人ずつ出します');
  });

  test('見出しの後ろに（間違えた単語）', () => {
    expect(titleOf({ source: 'eiken', eiken: 'pre2', weakOnly: true })).toBe(`英検準2級${WEAK_ONLY_SUFFIX}`);
    expect(titleOf({ source: 'eiken', eiken: 'pre2' })).toBe('英検準2級');
  });

  const POOL = [
    { id: 'w_run', word: 'run', partOfSpeech: '動', meaning: '走る', no: 1 },
    { id: 'w_go', word: 'go', partOfSpeech: '動', meaning: '行く', no: 2 },
    { id: 'w_up', word: 'give up', partOfSpeech: '熟語', meaning: 'あきらめる', no: 3 },
    { id: 'w_inc', word: 'increase', partOfSpeech: '動', meaning: '増える', no: 4 },
  ];

  test('結びつけは id → 語＋品詞＋意味（品詞の「熟」は「熟語」とそろえる）。並びは苦手な順', () => {
    const weak = [
      { id: 'old_random', word: 'give up', partOfSpeech: '熟', meaning: 'あきらめる', lastWrong: true },
      { id: 'w_go', word: 'go', partOfSpeech: '動', meaning: '行く', lastWrong: false },
      { id: 'x', word: 'apple', partOfSpeech: '名', meaning: 'りんご' },
    ];
    expect(weakWordsInSource(POOL, weak).map((w) => [w.id, w.lastWrong])).toEqual([['w_up', true], ['w_go', false]]);
  });

  test('**単語帳だけ綴りでも結びつける**（本の訳はマスタと違う。英検・教科書では綴りで見ない）', () => {
    const weak = [{ id: 'w_master_inc', word: 'Increase ', partOfSpeech: '動', meaning: '増加する' }];
    expect(weakWordsInSource(POOL, weak, { bySpelling: true }).map((w) => w.id)).toEqual(['w_inc']);
    expect(weakWordsInSource(POOL, weak)).toEqual([]);
  });

  test('教材の1語は1回だけ（苦手の記録が2件当たっても）', () => {
    const weak = [{ id: 'w_run', word: 'run' }, { id: 'r2', word: 'run', partOfSpeech: '動', meaning: '走る' }];
    expect(weakWordsInSource(POOL, weak)).toHaveLength(1);
  });

  test('**範囲の外の苦手は出さない**。苦手な順に上から count 語。教材の語（訳・番号）を写す', () => {
    const weak = [
      { id: 'w_inc', word: 'increase' }, { id: 'w_go', word: 'go' }, { id: 'w_run', word: 'run' },
    ];
    const input = { source: 'book', bookId: 'book-leap', noFrom: 1, noTo: 2, count: 0 };
    expect(pickWeakInSource(POOL, weak, input)).toEqual([
      { id: 'w_go', word: 'go', meaning: '行く', no: 2 },
      { id: 'w_run', word: 'run', meaning: '走る', no: 1 },
    ]);
    expect(pickWeakInSource(POOL, weak, { ...input, count: 1 }).map((w) => w.id)).toEqual(['w_go']);
  });

  test('**範囲に間違えた単語が無ければ出さない**（空の小テストを作らない）', () => {
    expect(() => pickWeakInSource(POOL, [{ id: 'zzz', word: 'zzz' }], { source: 'book', noFrom: 1, noTo: 4, count: 0 }))
      .toThrow('この範囲には、この生徒が間違えた単語がありません');
  });

  test('英検の級・教科書のページでも絞れる。0 は上限 MAX_QUESTIONS まで', () => {
    const master = Array.from({ length: 80 }, (_, i) => ({ id: `m${i}`, word: `m${i}`, meaning: 'い', eikenLevels: [3] }));
    const weak = master.map((w) => ({ id: w.id, word: w.word }));
    expect(pickWeakInSource(master, weak, { source: 'eiken', eiken: '3', count: 0 })).toHaveLength(MAX_QUESTIONS);
    expect(() => pickWeakInSource(master, weak, { source: 'eiken', eiken: '2', count: 0 })).toThrow(QuizInputError);
    const cards = [
      { id: 't1', word: 'a', meaning: 'あ', grade: 1, page: 10, order: 1 },
      { id: 't2', word: 'b', meaning: 'い', grade: 1, page: 20, order: 1 },
    ];
    expect(pickWeakInSource(cards, [{ id: 't2' }, { id: 't1' }], { source: 'textbook', grade: 1, pageFrom: 10, pageTo: 12, count: 0 }))
      .toEqual([{ id: 't1', word: 'a', meaning: 'あ', page: 10 }]);
  });

  test('**「苦手」の決め方は weakWordsForQuiz そのもの**（覚えた語・苦手でない語は教材で絞っても出ない）', () => {
    const docs = [
      { id: 'w_run', data: { word: 'run', partOfSpeech: '動', meaning: '走る', lastReviewed: 't', repetitions: 0, easeFactor: 2.5 } },
      { id: 'w_go', data: { word: 'go', partOfSpeech: '動', meaning: '行く', lastReviewed: 't', repetitions: 3, easeFactor: 2.7 } },
      { id: 'w_inc', data: { word: 'increase', partOfSpeech: '動', meaning: '増える', lastReviewed: 't', repetitions: 0, status: 'mastered' } },
    ];
    expect(pickWeakInSource(POOL, weakWordsForQuiz(docs), { source: 'book', noFrom: 1, noTo: 4, count: 0 }).map((w) => w.id))
      .toEqual(['w_run']);
  });
});
