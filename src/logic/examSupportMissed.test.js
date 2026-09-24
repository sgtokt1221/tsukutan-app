import { cardsForMissed, reviewEntryOf, lapseUpdateOf } from './examSupportMissed';

jest.mock('../firebaseConfig', () => ({ db: {}, auth: {} }));
jest.mock('firebase/firestore', () => ({ deleteField: () => '__delete__', doc: () => ({}), getDoc: () => ({}), updateDoc: () => ({}) }));
jest.mock('./reviewLogic', () => ({ addWordToReview: () => Promise.resolve() }));

const leap = [{ id: 'w_1', no: 1, word: 'agree', meaning: '賛成する', example: undefined }, { id: 'w_2', no: 2, word: 'oppose', meaning: '反対する' }];

test('受験サポートの番号を、つくつくの単語帳のカードに直す。無い番号・無い単語帳は飛ばし、同じ語は1つ', () => {
  const cards = cardsForMissed(
    [{ deckId: 'leap', no: 2 }, { deckId: 'leap', no: 99 }, { deckId: 'target1900', no: 1 }, { deckId: 'leap', no: 2 }],
    { leap },
  );
  expect(cards.map((c) => c.id)).toEqual(['w_2']);
});

test('**復習に足す形に undefined を入れない**（Firestore が書き込みごと拒否する）', () => {
  const entry = reviewEntryOf(leap[0]);
  expect(entry).toEqual({ id: 'w_1', word: 'agree', meaning: '賛成する', source: 'exam-support' });
  expect(Object.values(entry).includes(undefined)).toBe(false);
});

test('**もうある語は「間違えた」扱い**：間隔を1日・今日が復習日。卒業していたら外す', () => {
  const today = new Date('2026-09-25T00:00:00');
  expect(lapseUpdateOf({ repetitions: 4, interval: 30 }, today)).toEqual({ repetitions: 0, interval: 1, nextReviewDate: today });
  expect(lapseUpdateOf({ status: 'mastered' }, today).status).toBe('__delete__');
});
