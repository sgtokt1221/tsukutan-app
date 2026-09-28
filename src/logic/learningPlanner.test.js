// firebaseConfig は gitignore 済みの実ファイルを読ませない（GoalSetter.test.js と同じ）
jest.mock('../firebaseConfig', () => ({ auth: {}, db: {} }));
jest.mock('firebase/firestore', () => ({}));

// eslint-disable-next-line import/first
import { getNewWordsFromSource } from './learningPlanner';

const source = (words) => ({ id: 'book-test', title: 'テストの本', load: async () => words });
const w = (id, level, extra = {}) => ({ id, word: id, partOfSpeech: '名', meaning: `${id}の意味`, ...(level ? { level } : {}), ...extra });
const ids = (words) => words.map((word) => word.id);

describe('getNewWordsFromSource', () => {
  test('生徒のレベル帯の語から出す', async () => {
    const words = [w('a', 1), w('b', 3), w('c', 4), w('d', 6), w('e', 3)];
    const result = await getNewWordsFromSource(source(words), 3, 3, []);
    expect(ids(result.words).sort()).toEqual(['b', 'c', 'e']);
    expect(result.sourceFinished).toBe(false);
  });

  test('帯の語が足りなければ近いレベルへ広げて埋める', async () => {
    const words = [w('a', 1), w('b', 3), w('d', 6), w('f', 7)];
    const result = await getNewWordsFromSource(source(words), 3, 3, []);
    // 帯（3,4）は b だけ。距離1の語は無く、距離2の a(1) と d(6) で埋める
    expect(result.words).toHaveLength(3);
    expect(ids(result.words)[0]).toBe('b');
    expect(ids(result.words).slice(1).sort()).toEqual(['a', 'd']);
    expect(ids(result.remainingCandidates)).toEqual(['f']);
  });

  test('学習済みは id でも中身（語＋品詞＋意味）でも外す', async () => {
    const words = [w('a', 3), w('b', 3), w('c', 3)];
    const learned = [
      { id: 'a' },
      // 別の教材（id 違い）で覚えた同じ語
      { id: 'w_other', word: 'b', partOfSpeech: '名', meaning: 'bの意味' },
    ];
    const result = await getNewWordsFromSource(source(words), 10, 3, learned);
    expect(ids(result.words)).toEqual(['c']);
  });

  test('単語帳は、ほかの教材で覚えた同じ綴りの語も出さない', async () => {
    // 本だけの語は id も訳もマスタと違う
    const words = [w('increase', 3, { meaning: '増加する（本の訳）' }), w('improve', 3)];
    const learned = [{ id: 'w_master', word: 'Increase', partOfSpeech: '動', meaning: '増える' }];
    const book = { ...source(words), matchBySpelling: true };
    expect(ids((await getNewWordsFromSource(book, 10, 3, learned)).words)).toEqual(['improve']);
    // 英検などマスタの教材は綴りでは見ない（意味違いの札が別にある）
    expect(ids((await getNewWordsFromSource(source(words), 10, 3, learned)).words).sort()).toEqual(['improve', 'increase']);
  });

  test('全部学び終えたら sourceFinished を立てる（黙って0語にしない）', async () => {
    const words = [w('a', 3), w('b', 5)];
    const result = await getNewWordsFromSource(source(words), 10, 3, [{ id: 'a' }, { id: 'b', status: 'mastered' }]);
    expect(result.words).toEqual([]);
    expect(result.sourceFinished).toBe(true);
  });

  test('level の無い語にも level を書き足さない', async () => {
    const words = [w('a', 3), w('b'), w('c', 3)];
    const result = await getNewWordsFromSource(source(words), 10, 3, []);
    expect(result.words.find((word) => word.id === 'b')).not.toHaveProperty('level');
    // 前後の語から 3 とみなすので、帯の中として出る
    expect(ids(result.words).sort()).toEqual(['a', 'b', 'c']);
  });
});
