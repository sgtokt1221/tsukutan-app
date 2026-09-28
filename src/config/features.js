/**
 * 機能の栓。**止めるときはコードを消さず、ここを false にする。**
 *
 * WRITING_ENABLED … 英検ライティング（2026-09-27 に一度引っ込め、同日に Jev の鍵が届いて戻した）。
 *   止めるときは false にし、functions/index.js の WRITING_ENABLED も false にして出す。
 *   鍵は Firebase の secret（JEV_API_KEY）。鍵を消すなら先に両方を false にする（鍵が無いと関数の配布が入力待ちで止まる）。
 */
export const WRITING_ENABLED = true;
