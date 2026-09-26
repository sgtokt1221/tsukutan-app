import React from 'react';
import { getRank, RANK_TIERS } from '../../logic/rankLogic';
import './RankBadge.css';

/**
 * ランクの紋章。ASSESSMENT_RANK_SYSTEM_PLAN.md 8.3。
 *
 * 選定済みのポップなゲームバッヂ画像を、用途に応じた大きさで表示する。
 * 7ランクの形と色が画像側で一貫しているため、CSSで紋章を再現しない。
 *
 * **ランクの中の段（初級・中級・上級）は紋章の下に帯で重ねる**（2026-09-26）。
 * 別の札で横に並べると、ランクと段が別物に見えた。星の数でも段を示す（★☆☆〜★★★）。
 * 小さい紋章（全体マップの micro / small）には出さない。
 */

/** ランクの色の上で読める文字色（明るい色には濃紺、暗い色には白） */
const inkOn = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // 白との比と濃紺(#183153)との比の大きい方
  const onWhite = 1.05 / (lum + 0.05);
  const onInk = (lum + 0.05) / (0.029 + 0.05);
  return onWhite >= onInk ? '#ffffff' : '#183153';
};

export default function RankBadge({ rankId, size = 'medium', locked = false, tier = null }) {
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

  const showTier = tier && size !== 'micro' && size !== 'small';
  const stars = showTier ? RANK_TIERS.findIndex((t) => t.id === tier.id) + 1 : 0;

  return (
    <div
      className={showTier ? `${className} rank-badge--with-tier` : className}
      aria-label={showTier ? `ランク ${rank.id} ${tier.label}` : `ランク ${rank.id}`}
    >
      <img
        className="rank-badge__image"
        src={assetPath}
        alt=""
        aria-hidden="true"
        draggable="false"
      />
      {showTier && (
        <span
          className="rank-badge__ribbon"
          style={{ '--ribbon-color': rank.color, '--ribbon-ink': inkOn(rank.color) }}
          aria-hidden="true"
        >
          <span className="rank-badge__stars">
            {RANK_TIERS.map((t, i) => (
              <span key={t.id} className={i < stars ? 'rank-badge__star is-on' : 'rank-badge__star'}>★</span>
            ))}
          </span>
          <span className="rank-badge__tier">{tier.label}</span>
        </span>
      )}
    </div>
  );
}
