import { useEffect, useState } from 'react';

/**
 * カードの出題方向。
 *
 *   'en-ja' … 英語を見て意味を答える（既定）
 *   'ja-en' … 意味を見て英語を答える
 *
 * 同じ単語でも、読めることと書けることは別。英語→日本語だけを繰り返すと
 * 「見れば分かるが自分では出てこない」状態のまま進んでしまうので、
 * 逆向きも選べるようにする。
 *
 * 文字サイズ（useWordbookZoom）と同じく、学習カードと復習カードで
 * 設定を共有する。片方で切り替えたらもう片方も同じ向きで開く。
 */

export const DIRECTIONS = ['en-ja', 'ja-en'];

const STORAGE_KEY = 'tsukutan.cardDirection';

const readSaved = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return DIRECTIONS.includes(saved) ? saved : 'en-ja';
};

export const useCardDirection = () => {
  const [direction, setDirection] = useState(readSaved);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, direction);
  }, [direction]);

  return [direction, setDirection];
};

export default useCardDirection;
