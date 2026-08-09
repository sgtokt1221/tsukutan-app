import React from 'react';
import { FaArrowLeft } from 'react-icons/fa';
import './SessionHeader.css';

/**
 * 学習セッションのヘッダー。DESIGN_IMPLEMENTATION_PLAN.md 7.3 / 7.7。
 *
 * 戻る・セッション名・現在数の3要素に絞る。
 * 進捗は progressbar として読み上げ値も持たせる。
 */
export default function SessionHeader({ title, current, total, onBack, backLabel = '戻る', actions = null }) {
  const safeTotal = total > 0 ? total : 0;
  const percent = safeTotal > 0 ? Math.min(100, (current / safeTotal) * 100) : 0;

  return (
    <header className="session-header">
      <div className="session-header__row">
        {onBack && (
          <button type="button" className="ghost-button session-header__back" onClick={onBack}>
            <FaArrowLeft aria-hidden="true" /> {backLabel}
          </button>
        )}
        <span className="session-header__title">{title}</span>
        <span className="session-header__count">
          {safeTotal > 0 ? `${current} / ${safeTotal}` : ''}
        </span>
        {/* 補助操作は行を増やさずヘッダー内に収める */}
        {actions}
      </div>

      {safeTotal > 0 && (
        <div
          className="session-header__track"
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={0}
          aria-valuemax={safeTotal}
          aria-label={`${title}の進捗`}
        >
          <div className="session-header__fill" style={{ width: `${percent}%` }} />
        </div>
      )}
    </header>
  );
}
