import React, { useState } from 'react';
import { FaRedo } from 'react-icons/fa';
import RankBadge from './RankBadge';
import {
  DISCLAIMER,
  RANK_LIST,
  clampToAwardable,
  getRank,
  nextRank,
  pointsToNextRank,
  progressWithinRank,
  rankIndex,
  rankForScore,
} from '../../logic/rankLogic';
import { buildEquivalency } from '../../logic/examEquivalency';
import './RankCard.css';

/**
 * ランクカード。ASSESSMENT_RANK_SYSTEM_PLAN.md 8.1。
 *
 * ホーム（compact）は大きなランク紋章と E → SS の全体マップを組み合わせる。
 * 能力スコアや英検/TOEIC換算の細部は「きろく」側に残し、ホームでは
 * 「今どこか」「次にどこへ進むか」を一目で分かるようにする。
 */

function RankJourney({ currentRankId, overallPercent = 0 }) {
  const currentIndex = rankIndex(currentRankId);
  const positionLabel = currentIndex >= 0
    ? `${currentRankId} ランク、全${RANK_LIST.length}段階の${currentIndex + 1}番目`
    : `未測定、全${RANK_LIST.length}段階`;

  return (
    <div
      className="rank-card__journey"
      role="group"
      aria-label={`ランクの全体マップ。${positionLabel}`}
    >
      <div
        className="rank-card__journey-rail"
        role="progressbar"
        aria-valuenow={Math.round(overallPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`E から SS までの現在位置。${positionLabel}`}
      >
        <span
          className="rank-card__journey-fill"
          style={{ width: `${overallPercent}%` }}
          aria-hidden="true"
        />
      </div>

      <ol className="rank-card__journey-steps">
        {RANK_LIST.map((item, index) => {
          const isCurrent = index === currentIndex;
          const isPassed = currentIndex >= 0 && index < currentIndex;
          const state = isCurrent ? 'current' : isPassed ? 'passed' : 'future';

          return (
            <li
              key={item.id}
              className={`rank-card__journey-step rank-card__journey-step--${state}`}
              style={{ '--journey-rank-color': item.color }}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`${item.id} ランク${isCurrent ? '（現在）' : ''}`}
            >
              <div className="rank-card__journey-node" aria-hidden="true">
                <RankBadge rankId={item.id} size="micro" />
              </div>
              <span className="rank-card__journey-state" aria-hidden="true">
                {isCurrent ? '現在' : '\u00a0'}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

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
  const displayScore = cappedByLock ? rank?.max : score;
  const equivalency = buildEquivalency({ score: displayScore });

  if (!rank) {
    if (compact) {
      return (
        <div className="rank-card rank-card--compact rank-card--unmeasured">
          <div className="rank-card__hero">
            <span className="rank-card__eyebrow">現在のランク</span>
            <RankBadge rankId={null} size="medium" />
          </div>
          <div className="rank-card__compact-summary">
            <p className="rank-card__compact-rank">まだ未測定です</p>
            <p className="rank-card__compact-position">実力テストからランクの旅を始めよう</p>
            {onRetest && (
              <button type="button" className="rank-card__start-action" onClick={onRetest}>
                実力テストを受ける
              </button>
            )}
          </div>
          <RankJourney currentRankId={null} overallPercent={0} />
        </div>
      );
    }

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
  const remaining = pointsToNextRank(displayScore);
  const rankProgress = progressWithinRank(displayScore);
  const percent = Math.round(rankProgress * 100);
  const currentIndex = rankIndex(rank.id);
  const overallPercent = Math.min(
    100,
    ((currentIndex + (next ? rankProgress : 0)) / (RANK_LIST.length - 1)) * 100,
  );
  const best = getRank(bestRankId);
  const diff = Number.isFinite(previousScore) ? Math.round(score - previousScore) : null;
  const hasRange = Number.isFinite(confidenceLow) && Number.isFinite(confidenceHigh);

  //--------------------------------------------------------------------------
  // ホーム。現在の紋章と、全ランク中の現在地をひとまとまりで見せる。
  //--------------------------------------------------------------------------
  if (compact) {
    return (
      <div
        className={`rank-card rank-card--compact rank-card--rank-${rank.id.toLowerCase()}`}
        style={{ '--current-rank-color': rank.color }}
      >
        <div className="rank-card__hero">
          <span className="rank-card__eyebrow">現在のランク</span>
          <div className="rank-card__hero-badge">
            <RankBadge rankId={rank.id} size="xlarge" />
          </div>
        </div>

        <div className="rank-card__compact-summary">
          <div className="rank-card__compact-heading">
            {/* 「全7段階の6番目」はアプリ内でしか意味を持たない。
                生徒が知りたいのは外の物差しでどのあたりかなので、
                単語レベルから見た英検・TOEIC相当を出す。 */}
            <p className="rank-card__compact-position">
              {equivalency && !equivalency.locked ? (
                <>
                  {/* 「相当」が途中で改行して『相』『当』に割れないよう、
                      級と一緒のまとまりにして折り返させない */}
                  <span className="rank-card__compact-eiken">
                    <strong>{equivalency.eikenShort}</strong>相当
                  </span>
                  <span className="rank-card__compact-toeic">
                    TOEIC {equivalency.toeic.min}〜{equivalency.toeic.max} 相当
                  </span>
                </>
              ) : (
                <>全{RANK_LIST.length}段階の <strong>{currentIndex + 1}番目</strong></>
              )}
            </p>
            {onRetest && (
              <button
                type="button"
                className="rank-card__retest-link"
                onClick={onRetest}
                aria-label="実力を測り直す"
                title="実力を測り直す"
              >
                <FaRedo aria-hidden="true" />
              </button>
            )}
          </div>
          {next && !next.locked && (
            <p className="rank-card__next-message">
              <span aria-hidden="true">↗</span>
              次の {next.id} まで あと {remaining}
            </p>
          )}
        </div>

        <RankJourney currentRankId={rank.id} overallPercent={overallPercent} />
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
