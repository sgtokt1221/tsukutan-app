import React from 'react';
import { AUTO_PLAY_SPEEDS } from '../../logic/useAutoPlaySpeed';
import './DirectionToggle.css';

/**
 * 自動再生の速さ。再生中だけモードタブの行に出す。
 *
 * 出題の向きと同じ形の小さなセグメント。止まっているときは
 * 関係のない操作なので出さない（行が狭いため）。
 */
export default function AutoPlaySpeed({ value, onChange }) {
  return (
    <div className="direction-toggle" role="group" aria-label="自動再生の速さ">
      {AUTO_PLAY_SPEEDS.map((speed) => (
        <button
          key={speed.id}
          type="button"
          className="direction-toggle__option"
          aria-pressed={value === speed.id}
          title={`次の単語まで ${speed.ms / 1000} 秒`}
          onClick={() => value !== speed.id && onChange(speed.id)}
        >
          {speed.label}
        </button>
      ))}
    </div>
  );
}
