import { useEffect, useState } from 'react';

/**
 * 読みものの文字サイズ（%）。
 *
 * 単語帳のつまみ（useWordbookZoom）とは別に持つ。単語カードは一覧で
 * 見渡したいので小さめ、長文は読むので大きめ、と求めるものが違う。
 * 共有すると片方を変えるたびにもう片方が読みにくくなる。
 */
export const MIN_ZOOM = 80;
export const MAX_ZOOM = 200;

const STORAGE_KEY = 'tsukutan.readingZoom';

const readSaved = () => {
  const saved = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(saved) && saved >= MIN_ZOOM && saved <= MAX_ZOOM ? saved : 100;
};

export const useReadingZoom = () => {
  const [zoom, setZoom] = useState(readSaved);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(zoom));
  }, [zoom]);
  return [zoom, setZoom];
};

export default useReadingZoom;
