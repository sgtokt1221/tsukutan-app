import React from 'react';
import { getRank } from '../../logic/rankLogic';
import './RankBadge.css';

/**
 * ランクの紋章。ASSESSMENT_RANK_SYSTEM_PLAN.md 8.3。
 *
 * ランクごとに色を変える。色は src/config/ranks.json が正本で、
 * ここでは CSS 変数に流すだけ。銅→銀→金→ライム→青→紫と、
 * 段が上がるほど「素材が上がる」並びにしてある。
 *
 * 枠の太さ・二重線・光沢・縁光の差も併用する。色だけで区別すると
 * 色が見分けにくい生徒に伝わらないため。
 * 常時点滅はしない。文字の可読性を優先する。
 */
export default function RankBadge({ rankId, size = 'medium', locked = false }) {
  const rank = getRank(rankId);

  if (!rank) {
    return (
      <div className={`rank-badge rank-badge--${size} rank-badge--unmeasured`}>
        <span className="rank-badge__letter">—</span>
        <span className="rank-badge__caption">未測定</span>
      </div>
    );
  }

  const className = [
    'rank-badge',
    `rank-badge--${size}`,
    `rank-badge--${rank.style}`,
    locked || rank.locked ? 'rank-badge--locked' : '',
  ].filter(Boolean).join(' ');

  const colorVars = {
    '--rank-color': rank.color,
    '--rank-face': rank.faceColor,
  };

  return (
    <div className={className} style={colorVars} aria-label={`ランク ${rank.id}`}>
      <span className="rank-badge__letter">{rank.id}</span>
      {(locked || rank.locked) && <span className="rank-badge__caption">測定準備中</span>}
    </div>
  );
}
