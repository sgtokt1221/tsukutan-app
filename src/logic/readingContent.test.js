/**
 * 買った教材の長文は、公開の長文と別の置き場（Firestore）から読む（2026-09-27）。
 * 読めない人（生徒でない）には、公開の長文だけを出して止めない。
 */
const mockGetDoc = jest.fn();
jest.mock('../firebaseConfig', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: (...path) => path.slice(1).join('/'),
  getDoc: (ref) => mockGetDoc(ref),
}));

const PUBLIC_INDEX = { categories: [], grades: [{ id: '2', label: '英検2級', readings: [] }] };

beforeEach(() => {
  jest.resetModules();
  mockGetDoc.mockReset();
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(PUBLIC_INDEX) }));
});

test('生徒なら、一覧の最後に本が足される', async () => {
  // 入門編はまだ入っていない（文書が無い）ときは、その本だけ出さない
  mockGetDoc.mockImplementation((ref) => Promise.resolve(ref === 'licensedReadings/sokutan-advanced'
    ? { exists: () => true, data: () => ({ label: '速読英単語 上級編', readings: [{ id: 'sokutan-adv-01' }] }) }
    : { exists: () => false }));
  const { loadReadingIndex } = require('./readingContent');
  const index = await loadReadingIndex();
  expect(index.grades.map((g) => g.id)).toEqual(['2', 'sokutan-advanced']);
  expect(index.grades[1].licensed).toBe(true);
});

test('**生徒でない（規則で弾かれる）ときは、公開の長文だけを出す**', async () => {
  mockGetDoc.mockRejectedValue(new Error('Missing or insufficient permissions.'));
  const { loadReadingIndex } = require('./readingContent');
  const index = await loadReadingIndex();
  expect(index.grades.map((g) => g.id)).toEqual(['2']);
});

test('本の長文は公開ファイルではなく Firestore から読む', async () => {
  mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ id: 'sokutan-adv-01', sentences: [] }) });
  const { loadReading } = require('./readingContent');
  const reading = await loadReading('sokutan-advanced', 'sokutan-adv-01');
  expect(reading.id).toBe('sokutan-adv-01');
  expect(mockGetDoc).toHaveBeenCalledWith('licensedReadings/sokutan-advanced/items/sokutan-adv-01');
  expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('sokutan'));
});
