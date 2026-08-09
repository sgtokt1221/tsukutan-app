import React from 'react';
import './QuestionRenderer.css';

/**
 * 4択問題の共通レンダラー。ASSESSMENT_RANK_SYSTEM_PLAN.md 4.3 / 10.2。
 *
 * 正式テストなので、回答を確定する前に答えを見せない。回答後もその場では
 * 正解を出さず次へ進む。解説は結果画面でまとめて見せる。
 *
 * 送信中は操作をロックする。連打で2問進むのを防ぐため。
 */
export default function QuestionRenderer({ item, onAnswer, disabled = false }) {
  if (!item) return null;

  return (
    <div className="question">
      {item.sentence ? (
        <p className="question__sentence">{item.sentence}</p>
      ) : null}
      <p className="question__prompt">{item.prompt}</p>

      <ul className="question__choices">
        {item.choices.map((choice, index) => (
          <li key={`${item.itemId}-${index}`}>
            <button
              type="button"
              className="question__choice"
              onClick={() => onAnswer(index)}
              disabled={disabled}
            >
              <span className="question__choice-mark" aria-hidden="true">{index + 1}</span>
              <span className="question__choice-text">{choice}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* 当てずっぽうと区別するために用意する（計画書4.3） */}
      <button
        type="button"
        className="ghost-button question__skip"
        onClick={() => onAnswer(null)}
        disabled={disabled}
      >
        わからない
      </button>
    </div>
  );
}
