import React from 'react';
import { FaChevronRight, FaClipboardCheck } from 'react-icons/fa';
import './AssignedQuiz.css';

const dateText = (ts) => {
  const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null;
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * ホームのいちばん上に出す「先生からの小テスト」。**まだ解いていないものがあるときだけ。**
 * 今日のタスクより上に置く（先生が出したものは、自分で決めた学習より先にやってほしい）。
 */
export default function AssignedQuizCard({ quizzes, onStart }) {
  if (!quizzes || quizzes.length === 0) return null;
  return (
    <section className="assigned-quiz-card" aria-label="先生からの小テスト">
      <p className="assigned-quiz-card__eyebrow">
        <FaClipboardCheck aria-hidden="true" /> 先生からの小テスト
      </p>
      {quizzes.map((quiz) => (
        <button key={quiz.id} type="button" className="assigned-quiz-card__item" onClick={() => onStart(quiz)}>
          <span className="assigned-quiz-card__body">
            <span className="assigned-quiz-card__title">{quiz.title}</span>
            <span className="assigned-quiz-card__meta">
              {(quiz.words || []).length}問・{quiz.direction === 'ja-en' ? '日本語→英語' : '英語→日本語'}
              {dateText(quiz.createdAt) && `・${dateText(quiz.createdAt)}`}
            </span>
          </span>
          <span className="assigned-quiz-card__go">解く<FaChevronRight aria-hidden="true" /></span>
        </button>
      ))}
    </section>
  );
}
