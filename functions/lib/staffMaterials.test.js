const {
  assertStaffClaims,
  reviewWordsForQuiz,
  storiesForPrint,
  StaffAccessError,
} = require('./staffMaterials');

describe('誰に渡すか', () => {
  test('管理者はどの校舎の生徒でも', () => {
    expect(() => assertStaffClaims({ role: 'admin', school: 'makami' }, 'hokkan')).not.toThrow();
    expect(() => assertStaffClaims({ role: 'admin' }, '')).not.toThrow();
  });

  test('講師は自分の校舎の生徒だけ', () => {
    expect(() => assertStaffClaims({ role: 'teacher', school: 'makami' }, 'makami')).not.toThrow();
    expect(() => assertStaffClaims({ role: 'teacher', school: 'makami' }, 'hokkan')).toThrow(StaffAccessError);
  });

  test('**生徒の校舎が分からなければ、講師には渡さない**', () => {
    expect(() => assertStaffClaims({ role: 'teacher', school: 'makami' }, '')).toThrow(StaffAccessError);
    expect(() => assertStaffClaims({ role: 'teacher' }, '')).toThrow(StaffAccessError);
  });

  test('**生徒本人・保護者・役割なしには渡さない**', () => {
    expect(() => assertStaffClaims({ role: 'learner', school: 'makami' }, 'makami')).toThrow(StaffAccessError);
    expect(() => assertStaffClaims({ role: 'student', school: 'makami' }, 'makami')).toThrow(StaffAccessError);
    expect(() => assertStaffClaims({}, 'makami')).toThrow(StaffAccessError);
    expect(() => assertStaffClaims(null, 'makami')).toThrow(StaffAccessError);
  });
});

describe('小テストに出す復習語', () => {
  test('**もう覚えた語と、移した古い文書は除く**', () => {
    const words = reviewWordsForQuiz([
      { id: 'a', data: { word: 'apple', meaning: 'りんご' } },
      { id: 'b', data: { word: 'banana', meaning: 'バナナ', status: 'mastered' } },
      { id: 'c', data: { word: 'cherry', meaning: 'さくらんぼ', migratedTo: 'x' } },
    ]);
    expect(words).toEqual([{ id: 'a', word: 'apple', meaning: 'りんご' }]);
  });

  test('意味の欄の名前が違っても拾う', () => {
    expect(reviewWordsForQuiz([{ id: 'a', data: { word: 'apple', japanese: 'りんご' } }])[0].meaning).toBe('りんご');
  });

  test('綴りの無い文書は出さない', () => {
    expect(reviewWordsForQuiz([{ id: 'a', data: { meaning: 'りんご' } }])).toEqual([]);
  });
});

describe('印刷する長文', () => {
  const story = (overrides) => ({
    title: '今月の長文',
    status: 'complete',
    createdAt: { seconds: 1758585600 },
    sentences: [{ english: 'I like apples.', japanese: '私はりんごが好きです。' }],
    usedWords: ['apple'],
    unusedWords: ['banana'],
    ...overrides,
  });

  test('**本文は sentences から取る**', () => {
    const [s] = storiesForPrint([{ id: '2025-09', data: story() }]);
    expect(s.sentences).toEqual([{ english: 'I like apples.', japanese: '私はりんごが好きです。' }]);
    expect(s.createdAt).toBe('2025-09-23T00:00:00.000Z');
  });

  test('**使えなかった単語は文字列の配列のまま**（以前の印刷は空になっていた）', () => {
    const [s] = storiesForPrint([{ id: 'x', data: story() }]);
    expect(s.usedWords).toEqual(['apple']);
    expect(s.unusedWords).toEqual(['banana']);
  });

  test('古い長文の語オブジェクトも綴りに直す', () => {
    const [s] = storiesForPrint([{ id: 'x', data: story({ unusedWords: [{ word: 'cat', meaning: 'ねこ' }] }) }]);
    expect(s.unusedWords).toEqual(['cat']);
  });

  test('**失敗・生成中・本文なしは出さない**', () => {
    expect(storiesForPrint([
      { id: 'f', data: story({ status: 'failed' }) },
      { id: 'g', data: story({ status: 'generating' }) },
      { id: 'e', data: story({ sentences: [] }) },
    ])).toEqual([]);
  });

  test('新しい順', () => {
    const list = storiesForPrint([
      { id: 'old', data: story({ createdAt: '2025-08-01T00:00:00Z' }) },
      { id: 'new', data: story({ createdAt: '2025-09-01T00:00:00Z' }) },
    ]);
    expect(list.map((s) => s.id)).toEqual(['new', 'old']);
  });
});
