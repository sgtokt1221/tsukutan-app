import { useCallback, useState } from 'react';

/**
 * 初回だけ案内を出す。
 *
 * 版を保存しておき、案内の中身を大きく変えたら版を上げて出し直す。
 * 端末ごとの記録でよい（同じ生徒が別の端末で1回見るぶんには害がない）。
 */

const STORAGE_KEY = 'tsukutan.onboarding';
const VERSION = '1';

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

  return [show, finish];
};

export default useOnboarding;
