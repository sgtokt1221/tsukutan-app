/**
 * 機能の栓。**止めるときはコードを消さず、ここを false にする。**
 *
 * WRITING_ENABLED … 英検ライティング（2026-09-27 に引っ込めた）。採点の Jev がウェイティングリストで
 *   鍵がまだ無い。戻すときは true にし、functions/index.js の WRITING_ENABLED も true にして
 *   `firebase functions:secrets:set JEV_API_KEY` を入れてから出す（鍵が無いと関数の配布が入力待ちで止まる）。
 */
export const WRITING_ENABLED = false;
