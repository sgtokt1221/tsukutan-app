import { levelProgressKey } from './freeStudyProgress';

jest.mock('../firebaseConfig', () => ({ db: {} }));

test('**レベルを付け直した2冊は続きの鍵を替える**（古い位置から別の語で再開しない）', () => {
  expect(levelProgressKey('highschool-english', 5)).toBe('r2-5');
  expect(levelProgressKey('osaka-koukou-nyuushi', '3')).toBe('r2-3');
});

test('英検の級別は今までの鍵のまま（レベルではなく英検の級で分けている）', () => {
  expect(levelProgressKey('eiken-2', 4)).toBe('4');
});
