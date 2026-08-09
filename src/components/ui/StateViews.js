import React from 'react';
import './StateViews.css';

/**
 * 読込中・空・エラーの共通表示。
 * DESIGN_IMPLEMENTATION_PLAN.md Phase UI-2 / DESIGN_POLISH_PLAN.md 11.4。
 *
 * 画面ごとに別々の書き方をしない。3つとも「何が起きているか」と
 * 「次にどうすればいいか」を必ず含める。
 */

/** 何を取得中か短く伝える */
export function LoadingState({ label = '読み込んでいます...' }) {
  return (
    <div className="state-view state-view--loading" role="status" aria-live="polite">
      <span className="state-view__spinner" aria-hidden="true" />
      <p className="state-view__message">{label}</p>
    </div>
  );
}

/** 状態の説明と、次にできること1つ */
export function EmptyState({ title, description, action = null, icon = null }) {
  return (
    <div className="state-view state-view--empty">
      {icon && <span className="state-view__icon" aria-hidden="true">{icon}</span>}
      <p className="state-view__title">{title}</p>
      {description && <p className="state-view__message">{description}</p>}
      {action}
    </div>
  );
}

/** 問題 → 影響 → 再試行 の順に見せる */
export function ErrorState({ title = '読み込めませんでした', description, onRetry, retryLabel = '再試行する' }) {
  return (
    <div className="state-view state-view--error" role="alert">
      <p className="state-view__title">{title}</p>
      {description && <p className="state-view__message">{description}</p>}
      {onRetry && (
        <button type="button" className="primary-action" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** 画面内に出す帯。成功・注意・エラー・案内で色と役割を分ける。 */
export function FeedbackBanner({ tone = 'info', children, onDismiss }) {
  const role = tone === 'error' ? 'alert' : 'status';
  return (
    <div className={`feedback-banner feedback-banner--${tone}`} role={role}>
      <div className="feedback-banner__body">{children}</div>
      {onDismiss && (
        <button type="button" className="ghost-button feedback-banner__close" onClick={onDismiss} aria-label="閉じる">
          ×
        </button>
      )}
    </div>
  );
}

/** 進捗。数値も併記して色だけに頼らない（計画書14章） */
export function ProgressBar({ value, max = 100, label }) {
  const safeMax = max > 0 ? max : 100;
  const percent = Math.max(0, Math.min(100, (value / safeMax) * 100));
  return (
    <div className="progress">
      <div
        className="progress__track"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="progress__fill" style={{ width: `${percent}%` }} />
      </div>
      {label && <span className="progress__label">{label}</span>}
    </div>
  );
}

/** 状態バッジ。形と文字でも区別できるようにする。 */
export function StatusBadge({ tone = 'neutral', children }) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
