import { useEffect, useState } from 'react';

/**
 * 単語帳モードの文字サイズ（%）。
 *
 * 学習カードと復習カードで同じ設定を共有する。片方で調整したら
 * もう片方も同じ大きさで開くほうが、生徒にとって自然なため。
 *
 * 一覧で見渡したいときは小さく、1語ずつ確かめたいときは大きく
 * できるよう幅を広めに取る。
 */
export const MIN_ZOOM = 20;
export const MAX_ZOOM = 200;

const STORAGE_KEY = 'tsukutan.wordbookZoom';

const readSaved = () => {
  const saved = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(saved) && saved >= MIN_ZOOM && saved <= MAX_ZOOM ? saved : 100;
};

export const useWordbookZoom = () => {
  const [zoom, setZoom] = useState(readSaved);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(zoom));
  }, [zoom]);

  return [zoom, setZoom];
};

export default useWordbookZoom;
