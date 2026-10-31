/**
 * ダッシュボードを開いたときの読み込み（2026-10-31）。
 *
 * 骨組み（スケルトン）を外すのは**ホームに出るものが揃ったとき**だけ。
 * ストーリー・自由学習の進み具合はホームに出ないので、待たずに後から埋める。
 * 以前は全部を Promise.all で待っていて、ホームに関係の無い読み込みの分まで
 * 骨組みのままだった。
 *
 * - `home` … ホームに出るもの。終わったら（失敗しても）`onHomeSettled`
 * - `extras` … ホームに出ないもの。同時に投げて待たない。失敗は各自で扱う
 */
export const loadDashboard = ({ home, extras = [], onHomeSettled }) => {
  extras.forEach((load) => {
    Promise.resolve().then(load).catch(() => {});
  });
  return Promise.resolve().then(home).finally(onHomeSettled);
};
