import { loadDashboard } from './dashboardStartup';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('loadDashboard', () => {
  test('ホームのデータが揃えば、ストーリー・自由学習を待たずに骨組みを外す', async () => {
    const home = deferred();
    const stories = deferred();
    const freeStudy = deferred();
    const onHomeSettled = jest.fn();
    const storiesLoad = jest.fn(() => stories.promise);
    const freeLoad = jest.fn(() => freeStudy.promise);

    const done = loadDashboard({ home: () => home.promise, extras: [storiesLoad, freeLoad], onHomeSettled });
    await Promise.resolve();
    // 3つとも同時に投げている
    expect(storiesLoad).toHaveBeenCalledTimes(1);
    expect(freeLoad).toHaveBeenCalledTimes(1);
    expect(onHomeSettled).not.toHaveBeenCalled();

    home.resolve();
    await done;
    expect(onHomeSettled).toHaveBeenCalledTimes(1);
  });

  test('ホームの読み込みが失敗しても骨組みは外す（エラー画面へ進める）', async () => {
    const onHomeSettled = jest.fn();
    await loadDashboard({ home: () => Promise.reject(new Error('x')), onHomeSettled }).catch(() => {});
    expect(onHomeSettled).toHaveBeenCalledTimes(1);
  });

  test('ホームに出ないものが失敗しても巻き込まない', async () => {
    const onHomeSettled = jest.fn();
    await loadDashboard({
      home: () => Promise.resolve(),
      extras: [() => Promise.reject(new Error('stories')), () => { throw new Error('sync'); }],
      onHomeSettled,
    });
    expect(onHomeSettled).toHaveBeenCalledTimes(1);
  });
});
