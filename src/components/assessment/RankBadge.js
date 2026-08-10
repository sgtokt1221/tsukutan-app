import React from 'react';
import { getRank } from '../../logic/rankLogic';
import './RankBadge.css';

/**
 * ランクの紋章。ASSESSMENT_RANK_SYSTEM_PLAN.md 8.3。
 *
 * 選定済みのポップなゲームバッヂ画像を、用途に応じた大きさで表示する。
 * 7ランクの形と色が画像側で一貫しているため、CSSで紋章を再現しない。
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
    locked ? 'rank-badge--locked' : '',
  ].filter(Boolean).join(' ');

  const assetPath = `${process.env.PUBLIC_URL}/brand/rank-badges-pop-v3/rank-${rank.id.toLowerCase()}.png`;

  return (
    <div className={className} aria-label={`ランク ${rank.id}`}>
      <img
        className="rank-badge__image"
        src={assetPath}
        alt=""
        aria-hidden="true"
        draggable="false"
      />
    </div>
  );
}
