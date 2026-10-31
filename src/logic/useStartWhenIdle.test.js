import { renderHook, act } from '@testing-library/react';
import { runWhenIdle, useStartWhenIdle } from './useStartWhenIdle';

describe('runWhenIdle', () => {
  test('requestIdleCallback があればそれで走らせる', () => {
    const calls = [];
    const win = {
      requestIdleCallback: (cb, opts) => { calls.push(opts); cb(); return 1; },
      cancelIdleCallback: jest.fn(),
    };
    const fn = jest.fn();
    runWhenIdle(fn, { win });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls[0]).toEqual({ timeout: 2000 });
  });

  test('無い端末（iOS Safari）では次の番に回す。取り消せる', () => {
    jest.useFakeTimers();
    const fn = jest.fn();
    runWhenIdle(fn, { win: {} });
    expect(fn).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(1);

    const later = jest.fn();
    const cancel = runWhenIdle(later, { win: {} });
    cancel();
    jest.runAllTimers();
    expect(later).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('useStartWhenIdle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('ホームのデータが届くまでは読みに行かない。届いたら1回だけ', () => {
    const start = jest.fn();
    const { rerender } = renderHook(({ ready }) => useStartWhenIdle(ready, start), {
      initialProps: { ready: false },
    });
    act(() => { jest.runAllTimers(); });
    expect(start).not.toHaveBeenCalled();

    rerender({ ready: true });
    act(() => { jest.runAllTimers(); });
    expect(start).toHaveBeenCalledTimes(1);

    // 学習を始めるたびに loading が行き来しても、2回目は読まない
    rerender({ ready: false });
    rerender({ ready: true });
    act(() => { jest.runAllTimers(); });
    expect(start).toHaveBeenCalledTimes(1);
  });

  test('初回の案内を出しているときは待たずにすぐ始める', () => {
    const start = jest.fn();
    renderHook(() => useStartWhenIdle(false, start, { now: true }));
    expect(start).toHaveBeenCalledTimes(1);
  });

  test('走る前に画面を離れたら読まない', () => {
    const start = jest.fn();
    const { unmount } = renderHook(() => useStartWhenIdle(true, start));
    unmount();
    act(() => { jest.runAllTimers(); });
    expect(start).not.toHaveBeenCalled();
  });
});
