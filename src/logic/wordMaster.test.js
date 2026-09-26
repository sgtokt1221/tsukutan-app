import { loadWordMaster, loadTextbookWords, clearWordCache } from './wordMaster';

const jsonResponse = (data) => ({
  ok: true,
  headers: { get: () => 'application/json; charset=UTF-8' },
  json: async () => data,
});

const htmlResponse = () => ({
  ok: true,
  headers: { get: () => 'text/html; charset=utf-8' },
  json: async () => { throw new SyntaxError('Unexpected token <'); },
});

beforeEach(() => {
  clearWordCache();
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
});

test('マスターを読み込める', async () => {
  global.fetch.mockResolvedValue(jsonResponse([{ id: 'w1' }]));
  await expect(loadWordMaster()).resolves.toEqual([{ id: 'w1' }]);
  expect(global.fetch).toHaveBeenCalledWith('/data/words-master.json');
});

test('同じファイルは1回しか取りに行かない', async () => {
  global.fetch.mockResolvedValue(jsonResponse([]));
  await Promise.all([loadWordMaster(), loadWordMaster(), loadWordMaster()]);
  // manifest（鍵と大きさを見るため）と本体で2回。何度呼んでも増えない。
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(global.fetch).toHaveBeenCalledWith('/data/words-master.json');
});

test('404はHTTPステータス付きで失敗する', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 404, headers: { get: () => null } });
  await expect(loadWordMaster()).rejects.toThrow(/HTTP 404/);
});

test('SPAのrewriteでindex.htmlが200で返っても気づける', async () => {
  // ファイルが無いと SPA の rewrite で index.html が 200 で返る。
  // response.ok だけ見ていると JSON.parse の例外になって原因が分からない。
  global.fetch.mockResolvedValue(htmlResponse());
  await expect(loadWordMaster()).rejects.toThrow(/JSONではありません/);
});

test('一度失敗したら、呼び出すたびに取りに行かない', async () => {
  // 失敗を覚えないと、呼び出し箇所の数だけ同じ取得を繰り返してしまう
  global.fetch.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null } });

  await expect(loadWordMaster()).rejects.toThrow();
  await expect(loadWordMaster()).rejects.toThrow();
  await expect(loadWordMaster()).rejects.toThrow();
  // manifest と本体で2回。失敗を覚えるので、呼び出すたびには増えない。
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('force を付ければやり直せる', async () => {
  // manifest → 本体 の順に取りに行く。1回目の本体を失敗させる。
  global.fetch
    .mockResolvedValueOnce(jsonResponse({ files: {} }))
    .mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => null } })
    .mockResolvedValue(jsonResponse([{ id: 'w1' }]));

  await expect(loadWordMaster()).rejects.toThrow();
  await expect(loadWordMaster({ force: true })).resolves.toEqual([{ id: 'w1' }]);
});

test('教材ごとのファイルを引く', async () => {
  global.fetch.mockResolvedValue(jsonResponse([]));
  await loadTextbookWords('osaka-koukou-nyuushi');
  expect(global.fetch).toHaveBeenCalledWith('/data/words-osaka.json');
});

test('未知の教材IDは空配列で、取得もしない', async () => {
  await expect(loadTextbookWords('なにこれ')).resolves.toEqual([]);
  expect(global.fetch).not.toHaveBeenCalled();
});
