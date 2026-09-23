const { assertStaffClaims, weakWordsForQuiz, StaffAccessError } = require('./staffMaterials');

describe('誰に渡すか', () => {
  test('管理者だけ', () => {
    expect(() => assertStaffClaims({ role: 'admin', school: 'makami' })).not.toThrow();
  });

  test('**講師・生徒本人・保護者・役割なしには渡さない**（2026-09-23 に管理者だけと決めた）', () => {
    for (const decoded of [{ role: 'teacher', school: 'makami' }, { role: 'learner' }, { role: 'student' }, {}, null]) {
      expect(() => assertStaffClaims(decoded)).toThrow(StaffAccessError);
    }
  });
});

describe('苦手な単語', () => {
  const doc = (id, data) => ({ id, data: { word: id, meaning: `${id}の意味`, lastReviewed: '2026-09-20', repetitions: 2, easeFactor: 2.6, ...data } });

  test('**直近で間違えた語は苦手**', () => {
    const [w] = weakWordsForQuiz([doc('miss', { repetitions: 0, easeFactor: 2.6 })]);
    expect(w).toEqual({ id: 'miss', word: 'miss', meaning: 'missの意味', lastWrong: true });
  });

  test('**覚えやすさが初期値より下がった語は苦手**', () => {
    expect(weakWordsForQuiz([doc('low', { easeFactor: 2.18 })]).map((w) => w.id)).toEqual(['low']);
  });

  test('**正解が続いている語は出さない**', () => {
    expect(weakWordsForQuiz([doc('ok', { repetitions: 3, easeFactor: 2.7 })])).toEqual([]);
    // 初期値ちょうど（まだ間違えていない）も出さない
    expect(weakWordsForQuiz([doc('new', { repetitions: 1, easeFactor: 2.5 })])).toEqual([]);
  });

  test('**覚えた語と、移した古い文書は除く**', () => {
    expect(weakWordsForQuiz([
      doc('m', { repetitions: 0, status: 'mastered' }),
      doc('g', { repetitions: 0, migratedTo: 'x' }),
    ])).toEqual([]);
  });

  test('一度も答えていない語（答えた時刻なし）は「直近で間違えた」にしない', () => {
    expect(weakWordsForQuiz([doc('fresh', { repetitions: 0, lastReviewed: null, easeFactor: 2.5 })])).toEqual([]);
  });

  test('**並び：直近で間違えた語が先、次に覚えやすさの低い順**', () => {
    const list = weakWordsForQuiz([
      doc('a', { easeFactor: 2.3 }),
      doc('b', { repetitions: 0, easeFactor: 2.4 }),
      doc('c', { easeFactor: 1.5 }),
      doc('d', { repetitions: 0, easeFactor: 1.9 }),
    ]);
    expect(list.map((w) => w.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  test('意味の欄の名前が違っても拾う・綴りの無い文書は出さない', () => {
    expect(weakWordsForQuiz([doc('x', { repetitions: 0, meaning: undefined, japanese: 'エックス' })])[0].meaning).toBe('エックス');
    expect(weakWordsForQuiz([{ id: 'y', data: { repetitions: 0, lastReviewed: 't' } }])).toEqual([]);
  });
});
