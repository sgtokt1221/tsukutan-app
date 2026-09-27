/**
 * 市販の単語帳は公開ファイルでなく Firestore のチャンクから読む（2026-09-27）。
 * 欠けたまま使うと番号の帯がずれて別の語が出るので、件数が合わなければ止める。
 */
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
jest.mock('../firebaseConfig', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: (...path) => path.slice(1).join('/'),
  collection: (...path) => path.slice(1).join('/'),
  getDoc: (ref) => mockGetDoc(ref),
  getDocs: (ref) => mockGetDocs(ref),
}));

const chunk = (id, words) => ({ id, data: () => ({ words }) });

beforeEach(() => {
  jest.resetModules();
  mockGetDoc.mockReset();
  mockGetDocs.mockReset();
});

test('チャンクを番号順につないで返す', async () => {
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ count: 3 }) });
  mockGetDocs.mockResolvedValue({ docs: [chunk('01', [{ no: 3 }]), chunk('00', [{ no: 1 }, { no: 2 }])] });
  const { loadBookWords } = require('./licensedWords');
  const words = await loadBookWords({ deckId: 'leap' });
  expect(words.map((w) => w.no)).toEqual([1, 2, 3]);
  expect(mockGetDocs).toHaveBeenCalledWith('licensedWordBooks/leap/chunks');
});

test('**件数が合わなければ止める**（途中のチャンクが欠けている）', async () => {
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ count: 5 }) });
  mockGetDocs.mockResolvedValue({ docs: [chunk('00', [{ no: 1 }])] });
  const { loadBookWordsByDeck } = require('./licensedWords');
  await expect(loadBookWordsByDeck('leap')).rejects.toThrow('途中で止まりました');
});

test('失敗は覚えない（電波が戻れば読み直せる）。成功は覚える', async () => {
  mockGetDoc.mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ exists: () => true, data: () => ({ count: 1 }) });
  mockGetDocs.mockResolvedValue({ docs: [chunk('00', [{ no: 1 }])] });
  const { loadBookWordsByDeck } = require('./licensedWords');
  await expect(loadBookWordsByDeck('leap')).rejects.toThrow('offline');
  await expect(loadBookWordsByDeck('leap')).resolves.toHaveLength(1);
  await loadBookWordsByDeck('leap');
  expect(mockGetDoc).toHaveBeenCalledTimes(2);
});
