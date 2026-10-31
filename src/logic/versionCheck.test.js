import { runningMainJs, deployedMainJs, startVersionCheck, AWAY_MS } from './versionCheck';

const withMain = (name) => {
  document.body.innerHTML = '';
  const s = document.createElement('script');
  s.setAttribute('src', `/static/js/${name}`);
  document.body.appendChild(s);
};
const ok = (body) => ({ ok: true, json: async () => body });
const setVisibility = (state) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

let reload;
beforeEach(() => {
  reload = jest.fn();
  delete window.location;
  window.location = { reload };
});

test('動いている本体の JS のファイル名（開発中は null）', () => {
  withMain('main.0b3d148d.js');
  expect(runningMainJs()).toBe('main.0b3d148d.js');
  withMain('bundle.js');
  expect(runningMainJs()).toBeNull();
});

test('本番のファイル名。読めなければ null', async () => {
  expect(await deployedMainJs(async () => ok({ mainJs: 'main.aaaa.js' }))).toBe('main.aaaa.js');
  expect(await deployedMainJs(async () => { throw new Error('offline'); })).toBeNull();
});

test('**しばらく離れて戻ったら、新しい版なら読み直す**', async () => {
  withMain('main.0000.js');
  let t = 0;
  const stop = startVersionCheck({ fetchImpl: async () => ok({ mainJs: 'main.1111.js' }), now: () => t });
  setVisibility('hidden');
  t = AWAY_MS + 1;
  setVisibility('visible');
  await new Promise((r) => setTimeout(r, 0));
  expect(reload).toHaveBeenCalled();
  stop();
});

test('**すぐ戻っただけなら読み直さず、更新を出す**（勉強の途中で変えない）', async () => {
  withMain('main.0000.js');
  let t = 0;
  const stop = startVersionCheck({ fetchImpl: async () => ok({ mainJs: 'main.1111.js' }), now: () => t });
  setVisibility('hidden');
  t = 5000;
  setVisibility('visible');
  await new Promise((r) => setTimeout(r, 0));
  expect(reload).not.toHaveBeenCalled();
  expect(document.getElementById('tsukutan-update').textContent).toContain('新しいつくつく');
  stop();
});

test('同じ版なら何もしない', async () => {
  withMain('main.0000.js');
  let t = 0;
  const stop = startVersionCheck({ fetchImpl: async () => ok({ mainJs: 'main.0000.js' }), now: () => t });
  setVisibility('hidden'); t = AWAY_MS + 1; setVisibility('visible');
  await new Promise((r) => setTimeout(r, 0));
  expect(reload).not.toHaveBeenCalled();
  expect(document.getElementById('tsukutan-update')).toBeNull();
  stop();
});
