import React, { useState } from 'react';
import RankBadge from './RankBadge';
import {
  DISCLAIMER,
  clampToAwardable,
  getRank,
  nextRank,
  pointsToNextRank,
  progressWithinRank,
  rankForScore,
} from '../../logic/rankLogic';
import { buildEquivalency } from '../../logic/examEquivalency';
import './RankCard.css';

/**
 * ランクカード。ASSESSMENT_RANK_SYSTEM_PLAN.md 8.1。
 *
 * ホーム（compact）の主役は大きなランク紋章ひとつ。それ以外の細かい文字は
 * 置かない。能力スコアの数値・自己ベスト・英検/TOEIC換算は情報としては
 * 要るが、毎日見る画面に小さく並べても読まれず、紋章の存在感を削るだけに
 * なる。根拠は「きろく」側でまとめて出す。
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

  const measured = rankForScore(score);
  // 正式に付与できるランクまでしか出さない。スコアがSS帯に届いても、
  // C1問題バンクが無い以上「SSを取った」ようには見せない（計画書2.3）。
  const rank = getRank(clampToAwardable(measured?.id));
  const cappedByLock = Boolean(measured && rank && measured.id !== rank.id);
  const equivalency = buildEquivalency({ score: cappedByLock ? rank.max : score });

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

  //--------------------------------------------------------------------------
  // ホーム。紋章とゲージだけ置く。
  //--------------------------------------------------------------------------
  if (compact) {
    return (
      <div className="rank-card rank-card--compact">
        <RankBadge rankId={rank.id} size="xlarge" />
        <div className="rank-card__gauge">
          <div className="rank-card__gauge-head">
            <span>
              {next && !next.locked ? `${next.id} まで あと ${remaining}` : `${rank.id} ランク`}
            </span>
            {onRetest && (
              <button type="button" className="rank-card__retest-link" onClick={onRetest}>
                測り直す
              </button>
            )}
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
      </div>
    );
  }

  return (
    <div className="rank-card">
      <div className="rank-card__head">
        <RankBadge rankId={rank.id} size="large" />
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
          </p>
        </div>
      </div>

      {cappedByLock && (
        <p className="rank-card__locked-note">
          {measured.id} は測定準備中です。今は {rank.id} までの判定になります。
        </p>
      )}

      {next && (
        <div className="rank-card__gauge">
          <div className="rank-card__gauge-head">
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
          <p className="rank-card__eq-line">{equivalency.eiken}</p>
          <p className="rank-card__eq-line">{equivalency.toeic.label}</p>
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

      {onRetest && (
        <button type="button" className="secondary-action rank-card__retest" onClick={onRetest}>
          実力テストを受け直す
        </button>
      )}
    </div>
  );
}
