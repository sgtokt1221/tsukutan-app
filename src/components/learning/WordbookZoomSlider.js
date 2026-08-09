import React from 'react';
import { MIN_ZOOM, MAX_ZOOM } from '../../logic/useWordbookZoom';

/**
 * 単語帳モードの文字サイズつまみ。モード切替タブと同じ行に置く。
 *
 * 小さいA〜大きいA は拡大縮小の慣用表記。数値(%)は出さない。
 * 生徒が見たいのは「今どのくらいか」ではなく「大きいか小さいか」なので、
 * 数字を置くと行が広がるわりに読まれない。
 */
export default function WordbookZoomSlider({ value, onChange }) {
  return (
    <label className="wordbook-zoom">
      <span className="wordbook-zoom__mark wordbook-zoom__mark--small" aria-hidden="true">A</span>
      <input
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step="10"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`文字の大きさ ${value}%`}
      />
      <span className="wordbook-zoom__mark wordbook-zoom__mark--large" aria-hidden="true">A</span>
    </label>
  );
}
