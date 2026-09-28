import React from 'react';
import './BrandLogo.css';

const PLACEMENTS = ['login', 'student-header', 'study-header', 'admin-sidebar'];

/**
 * 「つくつく」のブランドロゴ。
 * 2枚のカードは「くり返し」、右上の光は「身についた瞬間」。
 */
export function TsukuTsukuMark({ className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={`brand-logo__mark ${className}`.trim()}
      viewBox="0 0 64 64"
      focusable="false"
    >
      <g className="brand-logo__card-stack" transform="rotate(-8 29 33)">
        <rect className="brand-logo__card--back" x="6" y="17" width="38" height="39" rx="10" fill="#48D7A5" stroke="#183153" strokeWidth="2.5" />
        <g className="brand-logo__card--front">
          <rect x="16" y="9" width="40" height="42" rx="11" fill="#FFFDF7" stroke="#183153" strokeWidth="2.5" />
          <circle cx="27" cy="22" r="4" fill="#48D7A5" />
          <path d="M35 20.5h12M26 33h21M26 40h14" fill="none" stroke="#183153" strokeWidth="3" strokeLinecap="round" />
        </g>
      </g>
      <path className="brand-logo__spark" d="M50 2c.7 4.1 3.1 6.5 7.2 7.3-4.1.8-6.5 3.2-7.2 7.3-.8-4.1-3.1-6.5-7.2-7.3C46.9 8.5 49.2 6.1 50 2Z" fill="#FFC857" stroke="#183153" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export default function BrandLogo({
  placement = 'student-header',
  linked = false,
  decorative = false,
  onClick,
}) {
  const safePlacement = PLACEMENTS.includes(placement) ? placement : 'student-header';
  const className = `brand-logo brand-logo--${safePlacement}`;
  const content = (
    <>
      <TsukuTsukuMark />
      <span className="brand-logo__wordmark" aria-hidden="true">
        <span>つく</span><span className="brand-logo__wordmark-accent">つく</span>
      </span>
      {!decorative && <span className="visually-hidden">つくつく</span>}
    </>
  );

  if (linked) {
    return (
      <button type="button" className={`${className} brand-logo--link`} onClick={onClick} aria-label="つくつく ホーム">
        {content}
      </button>
    );
  }

  return <span className={className}>{content}</span>;
}
