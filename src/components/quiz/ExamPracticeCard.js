import React from 'react';
import { FaChevronRight } from 'react-icons/fa';
import './AssignedQuiz.css';

const dueText = (due) => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(due || ''));
  return m ? `${Number(m[1])}/${Number(m[2])}まで` : '';
};

/**
 * 「受験サポートのテスト範囲」（2026-09-24）。先生が受験サポートで出した英単語の小テストのうち、
 * まだ合格していないものを並べ、押すとその範囲を単語帳のカードで練習する。
 * **テストを受けるのは受験サポート**（つくつくは覚えるところ）。合格すると次に開いたときに消える。
 */
export default function ExamPracticeCard({ practice, onStart, busyId = '' }) {
  if (!practice || practice.length === 0) return null;
  return (
    <section className="exam-practice-card" aria-label="受験サポートのテスト範囲">
      <p className="exam-practice-card__eyebrow">受験サポートのテスト範囲</p>
      <p className="exam-practice-card__lead">合格するまでここに出ます。覚えたら受験サポートでテストを受けましょう。</p>
      {practice.map((p) => (
        <button
          key={p.assignmentId}
          type="button"
          className="assigned-quiz-card__item"
          onClick={() => onStart(p)}
          disabled={busyId === p.assignmentId}
        >
          <span className="assigned-quiz-card__body">
            <span className="assigned-quiz-card__title">{p.title}</span>
            <span className="assigned-quiz-card__meta">
              {(p.words || []).length}語{dueText(p.dueDate) && `・${dueText(p.dueDate)}`}
            </span>
          </span>
          <span className="assigned-quiz-card__go">
            {busyId === p.assignmentId ? '読み込み中…' : <>練習する<FaChevronRight aria-hidden="true" /></>}
          </span>
        </button>
      ))}
    </section>
  );
}
