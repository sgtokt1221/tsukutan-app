import React from 'react';
import './BrandLogo.css';

/**
 * ブランドロゴ。DESIGN_IMPLEMENTATION_PLAN.md 4章。
 *
 * 画像パスをここ1箇所に集める。画面ごとに <img> を直接置かない。
 *
 * 原本 public/tsukutan-logo-lockup-v1.png（2172×724, 3:1, 872KB）は
 * v1の原本として保持し、表示には public/brand/ の派生を使う。
 *
 * 背景について（計画書4.5）:
 *   PNGには淡い黄緑の背景が焼き込まれているので、ロゴの周囲も
 *   --color-canvas-lime にする。白いカードへ直接置かない。
 *   白地に置く必要がある場所は .brand-logo--on-surface を付けて、
 *   ロゴ領域だけ淡い黄緑のブロックにする。
 */

const SRC_WEBP = '/brand/tsukutan-logo-lockup-v1.webp';
const SRC_WEBP_SMALL = '/brand/tsukutan-logo-lockup-v1@440.webp';
const SRC_PNG = '/brand/tsukutan-logo-lockup-v1.png';

// 原本の比率。width/height を必ず渡して読込時のレイアウトずれを防ぐ。
const ASPECT_WIDTH = 2172;
const ASPECT_HEIGHT = 724;

const PLACEMENTS = ['login', 'student-header', 'study-header', 'admin-sidebar'];

export default function BrandLogo({
  placement = 'student-header',
  linked = false,
  priority = false,
  onSurface = false,
  /** 隣に「つくたん」の文字がある場合は decorative にして読み上げの重複を防ぐ */
  decorative = false,
  onClick,
}) {
  const safePlacement = PLACEMENTS.includes(placement) ? placement : 'student-header';

  const image = (
    <picture>
      <source
        type="image/webp"
        srcSet={`${SRC_WEBP_SMALL} 440w, ${SRC_WEBP} 880w`}
        sizes="(max-width: 767px) 60vw, 280px"
      />
      <img
        className="brand-logo__image"
        src={SRC_PNG}
        width={ASPECT_WIDTH}
        height={ASPECT_HEIGHT}
        alt={decorative ? '' : 'つくたん'}
        // ログインの主役画像は遅延させない（計画書4.4）
        loading={priority ? 'eager' : 'lazy'}
        fetchpriority={priority ? 'high' : undefined}
        decoding="async"
        draggable="false"
      />
    </picture>
  );

  const className = [
    'brand-logo',
    `brand-logo--${safePlacement}`,
    onSurface ? 'brand-logo--on-surface' : '',
  ].filter(Boolean).join(' ');

  if (linked) {
    return (
      <button type="button" className={`${className} brand-logo--link`} onClick={onClick} aria-label="つくたん ホーム">
        {image}
      </button>
    );
  }

  return <span className={className}>{image}</span>;
}
