import { levelProgressKey } from './freeStudyProgress';

jest.mock('../firebaseConfig', () => ({ db: {} }));

test('**単語の集まりが変わった教材は続きの鍵を替える**（古い位置から別の語で再開しない）', () => {
  expect(levelProgressKey('highschool-english', 5)).toBe('r3-5');
  expect(levelProgressKey('osaka-koukou-nyuushi', '3')).toBe('r3-3');
  expect(levelProgressKey('eiken-2', 4)).toBe('r3-4');
});

test('レベルで分けない教材（単語帳の番号の帯など）は今までの鍵のまま', () => {
  expect(levelProgressKey('leap', '1-100')).toBe('1-100');
});
