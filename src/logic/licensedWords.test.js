/**
 * 市販の単語帳は公開ファイルでなく Firestore のチャンクから読む（2026-09-27）。**REST で読む**（SDK だと止まった）。
 * 欠けたまま使うと番号の帯がずれて別の語が出るので、件数が合わなければ止める。
 */
jest.mock('../firebaseConfig', () => ({ auth: { currentUser: null } }));

const user = { getIdToken: async () => 'T' };
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const chunk = (n, words) => ({ name: `.../chunks/${n}`, fields: { json: { stringValue: JSON.stringify(words) } } });

beforeEach(() => jest.resetModules());

const fetchWith = (count, chunks) => jest.fn(async (url) => (url.includes('/chunks')
  ? ok({ documents: chunks })
  : ok({ fields: { count: { integerValue: String(count) } } })));

test('チャンクを番号順につないで返す（ログインの証明を付けて REST で）', async () => {
  const fetchImpl = fetchWith(3, [chunk('01', [{ no: 3 }]), chunk('00', [{ no: 1 }, { no: 2 }])]);
  const { loadBookWordsByDeck } = require('./licensedWords');
  const words = await loadBookWordsByDeck('leap', { fetchImpl, user });
  expect(words.map((w) => w.no)).toEqual([1, 2, 3]);
  expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer T');
  expect(fetchImpl.mock.calls.map((c) => c[0]).some((u) => u.endsWith('/licensedWordBooks/leap/chunks?pageSize=100'))).toBe(true);
});

test('**件数が合わなければ止める**（途中のチャンクが欠けている）', async () => {
  const { loadBookWordsByDeck } = require('./licensedWords');
  await expect(loadBookWordsByDeck('leap', { fetchImpl: fetchWith(5, [chunk('00', [{ no: 1 }])]), user })).rejects.toThrow('途中で止まりました');
});

test('失敗は覚えない（電波が戻れば読み直せる）。成功は覚える', async () => {
  const { loadBookWordsByDeck } = require('./licensedWords');
  const bad = jest.fn(async () => ({ ok: false, status: 503 }));
  await expect(loadBookWordsByDeck('leap', { fetchImpl: bad, user })).rejects.toThrow('503');
  const good = fetchWith(1, [chunk('00', [{ no: 1 }])]);
  await expect(loadBookWordsByDeck('leap', { fetchImpl: good, user })).resolves.toHaveLength(1);
  await loadBookWordsByDeck('leap', { fetchImpl: good, user });
  expect(good).toHaveBeenCalledTimes(2); // 頭とチャンク一覧の2本だけ（2回目は覚えたものを返す）
});

test('ログインしていなければ読まない', async () => {
  const { loadBookWordsByDeck } = require('./licensedWords');
  await expect(loadBookWordsByDeck('leap', { fetchImpl: jest.fn(), user: null })).rejects.toThrow('ログイン');
});

test('チャンクは JSON の文字列でも、古い配列の形でも読める', () => {
  const { wordsOfChunk } = require('./licensedWords');
  expect(wordsOfChunk({ json: '[{"no":1}]' })).toEqual([{ no: 1 }]);
  expect(wordsOfChunk({ words: [{ no: 2 }] })).toEqual([{ no: 2 }]);
});
