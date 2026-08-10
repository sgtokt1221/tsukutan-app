import { useEffect, useState } from 'react';

/**
 * 自動再生で、1語読み終えてから次へ進むまでの間。
 *
 * 1秒固定だったが、聞き流したい生徒には長く、書き取りながら進めたい
 * 生徒には短い。選べるようにする。
 *
 * 文字サイズ・出題の向きと同じく、学習カードと復習カードで共有する。
 */

export const AUTO_PLAY_SPEEDS = [
  { id: 'fast', label: '速い', ms: 500 },
  { id: 'normal', label: 'ふつう', ms: 1000 },
  { id: 'slow', label: 'ゆっくり', ms: 2000 },
];

const STORAGE_KEY = 'tsukutan.autoPlaySpeed';
const DEFAULT_ID = 'normal';

export const gapMsOf = (id) => (
  AUTO_PLAY_SPEEDS.find((speed) => speed.id === id) || AUTO_PLAY_SPEEDS[1]
).ms;

const readSaved = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return AUTO_PLAY_SPEEDS.some((speed) => speed.id === saved) ? saved : DEFAULT_ID;
};

export const useAutoPlaySpeed = () => {
  const [speedId, setSpeedId] = useState(readSaved);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, speedId);
  }, [speedId]);

  return [speedId, setSpeedId, gapMsOf(speedId)];
};

export default useAutoPlaySpeed;
