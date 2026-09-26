import React from 'react';
import './DashboardSkeleton.css';

/**
 * 読み込み中に出す骨組み。
 *
 * 真っ白にスピナーだけ置くと、2〜3秒のあいだ「壊れているのか」に見える。
 * これから出るものと同じ形を先に描いておけば、中身が入った瞬間に
 * 画面が飛び跳ねない。
 *
 * 前回の中身をそのまま出すことはしない。共用の端末で別の生徒の
 * 数字が一瞬見えるのは避けたい。
 */
export default function DashboardSkeleton() {
  return (
    <div className="dash-skeleton" aria-busy="true" aria-label="読み込み中">
      <div className="dash-skeleton__card">
        <span className="dash-skeleton__line dash-skeleton__line--xs" />
        <span className="dash-skeleton__line dash-skeleton__line--lg" />
        <span className="dash-skeleton__line dash-skeleton__line--sm" />
      </div>

      <div className="dash-skeleton__card dash-skeleton__card--rank">
        <div className="dash-skeleton__rank">
          <span className="dash-skeleton__badge" />
          <div className="dash-skeleton__rank-text">
            <span className="dash-skeleton__line dash-skeleton__line--md" />
            <span className="dash-skeleton__line dash-skeleton__line--sm" />
          </div>
        </div>
        <span className="dash-skeleton__bar" />
      </div>

      <div className="dash-skeleton__card">
        <span className="dash-skeleton__line dash-skeleton__line--xs" />
        <div className="dash-skeleton__tasks">
          <span className="dash-skeleton__task" />
          <span className="dash-skeleton__task" />
          <span className="dash-skeleton__task" />
        </div>
      </div>
    </div>
  );
}
