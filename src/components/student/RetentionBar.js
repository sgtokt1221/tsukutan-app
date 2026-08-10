import React from 'react';
import './RetentionBar.css';

/**
 * 定着の内訳。1本の帯で「あとどれくらいか」を見せる。
 *
 * 円グラフにすると小さい割合が読めない。帯なら、覚えかけが
 * ほとんどを占めている状態が一目で分かる。
 */
export default function RetentionBar({ breakdown }) {
  if (!breakdown || breakdown.total === 0) return null;

  const shown = breakdown.buckets.filter((bucket) => bucket.count > 0);

  return (
    <div className="retention">
      <div
        className="retention__bar"
        role="img"
        aria-label={shown.map((b) => `${b.label} ${b.count}語`).join('、')}
      >
        {shown.map((bucket) => (
          <span
            key={bucket.id}
            className="retention__segment"
            style={{ width: `${bucket.percent}%`, backgroundColor: bucket.color }}
          />
        ))}
      </div>

      <ul className="retention__legend">
        {breakdown.buckets.map((bucket) => (
          <li key={bucket.id} className="retention__item">
            <span className="retention__swatch" style={{ backgroundColor: bucket.color }} aria-hidden="true" />
            <span className="retention__label">{bucket.label}</span>
            <span className="retention__count">{bucket.count.toLocaleString()} 語</span>
            <span className="retention__note">{bucket.description}</span>
          </li>
        ))}
      </ul>

      <p className="retention__total">復習リスト {breakdown.total.toLocaleString()} 語</p>
    </div>
  );
}
