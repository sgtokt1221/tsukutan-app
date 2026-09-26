import { useCallback, useState } from 'react';
import { resetAllCoaches } from './useSeenOnce';

/**
 * 初回だけ案内を出す。
 *
 * 版を保存しておき、案内の中身を大きく変えたら版を上げて出し直す。
 * 端末ごとの記録でよい（同じ生徒が別の端末で1回見るぶんには害がない）。
 * 右上のメニューの「使い方を見る」から、いつでも開き直せる（`reopen`）。
 * そのときは学習画面の中の案内も、次に開いたときにもう一度出す。
 */

const STORAGE_KEY = 'tsukutan.onboarding';
// 2 … 2026-09-26 に作り直した（覚える仕組みをアニメで見せる）。全員にもう一度見せる
const VERSION = '2';

const alreadySeen = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === VERSION;
  } catch (error) {
    // localStorage を触れない設定でも学習は止めない。毎回出るだけ。
    return false;
  }
};

export const useOnboarding = () => {
  const [show, setShow] = useState(() => !alreadySeen());

  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, VERSION);
    } catch (error) {
      // 保存できなくても閉じる
    }
    setShow(false);
  }, []);

  // メニューの「使い方を見る」。見終わったらまた finish で閉じる
  const reopen = useCallback(() => {
    resetAllCoaches();
    setShow(true);
  }, []);

  return [show, finish, reopen];
};

export default useOnboarding;
