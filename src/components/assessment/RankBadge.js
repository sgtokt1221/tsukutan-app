import React from 'react';
import { getRank } from '../../logic/rankLogic';
import './RankBadge.css';

/**
 * ランクの紋章。ASSESSMENT_RANK_SYSTEM_PLAN.md 8.3。
 *
 * 色は増やさない。ランク差は枠の太さ・二重線・光沢・縁光で表す。
 * 常時点滅はしない。SSでも本文の可読性を優先する。
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

  return (
    <div className={className} aria-label={`ランク ${rank.id}`}>
      <span className="rank-badge__letter">{rank.id}</span>
      {(locked || rank.locked) && <span className="rank-badge__caption">測定準備中</span>}
    </div>
  );
}
