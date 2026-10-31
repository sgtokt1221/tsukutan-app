import React from 'react';
import { TsukuTsukuMark } from './BrandLogo';
import './BrandLoader.css';

/**
 * つくつくのカードが重なり、ひらめきが灯るローディング表示。
 * fullScreen は画面遷移、compact はカード内、inline はボタン内で使う。
 */
export default function BrandLoader({
  label = '準備しています…',
  fullScreen = false,
  compact = false,
  inline = false,
  className = '',
}) {
  const classes = [
    'brand-loader',
    fullScreen && 'brand-loader--fullscreen',
    compact && 'brand-loader--compact',
    inline && 'brand-loader--inline',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} role="status" aria-live="polite">
      <span className="brand-loader__stage" aria-hidden="true">
        <TsukuTsukuMark className="brand-loader__mark" />
      </span>
      {label && <span className="brand-loader__label">{label}</span>}
    </span>
  );
}
