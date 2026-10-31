import { useCallback, useRef } from 'react';

/**
 * 進行中の Firestore 書き込みを覚えておき、画面を閉じる前に待つ（計画書10.2.10）。
 *
 * 待たずに閉じると、最後の1語の採点が書き終わる前に一覧が読み直され、
 * 「やったのに数に入っていない」になる。
 *
 * @returns {{ trackWrite: (p: Promise) => Promise, flushWrites: () => Promise<void> }}
 */
export function usePendingWrites() {
  const pending = useRef([]);
  const trackWrite = useCallback((promise) => {
    if (promise && typeof promise.then === 'function') pending.current.push(promise);
    return promise;
  }, []);
  const flushWrites = useCallback(async () => {
    const inFlight = pending.current;
    pending.current = [];
    await Promise.allSettled(inFlight);
  }, []);
  return { trackWrite, flushWrites };
}
