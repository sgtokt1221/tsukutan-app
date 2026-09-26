import { useCallback, useState } from 'react';

/**
 * 学習画面の中の案内を「1回見たら出さない」ための記録。端末ごと。
 *
 * 案内は**動きの違いごとに1つ**（→ `coachKeyFor`）。上スワイプが効くかどうか、
 * 「外す」の意味が違うモードでは、そのモードを初めて開いたときにもう一度見せる。
 */

const PREFIX = 'tsukutan.coach.';

const readSeen = (key) => {
  try {
    return localStorage.getItem(PREFIX + key) === '1';
  } catch (error) {
    // 読めない設定なら毎回出る。学習は止めない
    return false;
  }
};

/** 単語カードの案内の鍵。動きが同じモードは同じ鍵にする */
export const coachKeyFor = (policy) => `card.${policy.swipeUp ? 'up' : 'flat'}.${policy.remove}`;

export const WORDBOOK_COACH_KEY = 'wordbook';
export const TEST_COACH_KEY = 'test';

/** 学習画面の中の案内を、全部もう一度出すようにする（メニューの「使い方を見る」） */
export function resetAllCoaches() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    // 消せなくても、最初の案内は開く
  }
}

/** @returns {[boolean, () => void]} 見たか・見たことにする */
export function useSeenOnce(key) {
  const [seen, setSeen] = useState(() => readSeen(key));
  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(PREFIX + key, '1');
    } catch (error) {
      // 覚えられなくても閉じる
    }
    setSeen(true);
  }, [key]);
  return [seen, markSeen];
}
