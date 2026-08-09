import React, { useState } from 'react';
import RankBadge from './RankBadge';
import {
  DISCLAIMER,
  getRank,
  nextRank,
  pointsToNextRank,
  progressWithinRank,
  rankForScore,
} from '../../logic/rankLogic';
import { buildEquivalency } from '../../logic/examEquivalency';
import './RankCard.css';

/**
 * ホームと結果画面で使うランクカード。
 * ASSESSMENT_RANK_SYSTEM_PLAN.md 8.1 / 10.3。
 *
 * 大きなランク文字を主役にし、英検・TOEIC換算は補助情報として小さく置く。
 * 換算は必ず注記付きで、断定表現にしない。
 */
export default function RankCard({
  score,
  bestRankId,
  previousScore,
  confidenceLow,
  confidenceHigh,
  onRetest,
  compact = false,
}) {
  const [showDetail, setShowDetail] = useState(false);

  const rank = rankForScore(score);
  const equivalency = buildEquivalency({ score });

  if (!rank) {
    return (
      <div className="rank-card">
        <div className="rank-card__head">
          <RankBadge rankId={null} size={compact ? 'medium' : 'large'} />
          <div className="rank-card__summary">
            <p className="rank-card__label">まだ実力を測っていません</p>
            {onRetest && (
              <button type="button" className="primary-action" onClick={onRetest}>
                実力テストを受ける
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const next = nextRank(rank.id);
  const remaining = pointsToNextRank(score);
  const percent = Math.round(progressWithinRank(score) * 100);
  const best = getRank(bestRankId);
  const diff = Number.isFinite(previousScore) ? Math.round(score - previousScore) : null;
  const hasRange = Number.isFinite(confidenceLow) && Number.isFinite(confidenceHigh);

  return (
    <div className={compact ? 'rank-card rank-card--compact' : 'rank-card'}>
      <div className="rank-card__head">
        <RankBadge rankId={rank.id} size={compact ? 'medium' : 'large'} />
        <div className="rank-card__summary">
          <p className="rank-card__label">能力スコア</p>
          <p className="rank-card__score">
            {Math.round(score)}
            {hasRange && (
              <span className="rank-card__range">
                （推定範囲 {Math.round(confidenceLow)}〜{Math.round(confidenceHigh)}）
              </span>
            )}
          </p>
          <p className="rank-card__meta">
            {best && <>自己ベスト {best.id}</>}
            {diff !== null && (
              <span className="rank-card__diff">{diff >= 0 ? ` / 前回 +${diff}` : ` / 前回 ${diff}`}</span>
            )}
            {/* ホームでは行を増やさないよう、受け直しは小さなリンクにする */}
            {compact && onRetest && (
              <button type="button" className="rank-card__retest-link" onClick={onRetest}>
                受け直す
              </button>
            )}
          </p>
        </div>
      </div>

      {next && (
        <div className="rank-card__progress">
          <div className="rank-card__progress-head">
            <span>
              {next.locked ? `${next.id} は測定準備中` : `次の ${next.id} ランクまで あと ${remaining}`}
            </span>
            <span className="rank-card__percent">{percent}%</span>
          </div>
          <div
            className="rank-card__bar"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${rank.id} ランク内の進み具合`}
          >
            <div className="rank-card__bar-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {equivalency && !equivalency.locked && (
        <div className="rank-card__equivalency">
          {compact ? (
            <p className="rank-card__eq-line">
              {equivalency.eiken}・{equivalency.toeic.min}〜{equivalency.toeic.max}点
            </p>
          ) : (
            <>
              <p className="rank-card__eq-line">{equivalency.eiken}</p>
              <p className="rank-card__eq-line">{equivalency.toeic.label}</p>
            </>
          )}
          <button
            type="button"
            className="rank-card__detail-toggle"
            onClick={() => setShowDetail((prev) => !prev)}
            aria-expanded={showDetail}
          >
            {showDetail ? '詳しい説明を閉じる' : '換算について'}
          </button>
          {showDetail && (
            <div className="rank-card__detail">
              <p>{DISCLAIMER}</p>
              <dl>
                <div>
                  <dt>CEFR の目安</dt>
                  <dd>{equivalency.cefr}</dd>
                </div>
                <div>
                  <dt>測っていない技能</dt>
                  <dd>{equivalency.notMeasured.join(' / ')}</dd>
                </div>
                <div>
                  <dt>信頼度</dt>
                  <dd>{equivalency.confidence.label}</dd>
                </div>
                <div>
                  <dt>換算表</dt>
                  <dd>v{equivalency.tableVersion}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}

      {!compact && onRetest && (
        <button type="button" className="secondary-action rank-card__retest" onClick={onRetest}>
          実力テストを受け直す
        </button>
      )}
    </div>
  );
}
