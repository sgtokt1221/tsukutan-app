import React from 'react';
import './AnswerControls.css';

/**
 * 回答操作。DESIGN_IMPLEMENTATION_PLAN.md 7.4 / 7.5。
 *
 * 見えるボタンを正式な操作とし、スワイプは同じ処理を呼ぶ補助にする。
 * これが無いと、スワイプを知らない生徒とキーボード利用者が完走できない。
 *
 * 計画書7.4の3段階（もう一度 / 迷った / わかった）。
 * 「迷った」は onHard を渡したときだけ出す。
 */
export default function AnswerControls({
  onCorrect,
  onIncorrect,
  onHard,
  disabled = false,
  correctLabel = 'わかった',
  incorrectLabel = 'もう一度',
  hardLabel = '迷った',
  hint,
}) {
  return (
    <div className="answer-controls">
      {hint && <p className="answer-controls__hint">{hint}</p>}
      <div className={onHard ? 'answer-controls__buttons answer-controls__buttons--three' : 'answer-controls__buttons'}>
        <button
          type="button"
          className="answer-btn answer-btn--again"
          onClick={onIncorrect}
          disabled={disabled}
        >
          {incorrectLabel}
        </button>
        {onHard && (
          <button
            type="button"
            className="answer-btn answer-btn--hard"
            onClick={onHard}
            disabled={disabled}
          >
            {hardLabel}
          </button>
        )}
        <button
          type="button"
          className="answer-btn answer-btn--known"
          onClick={onCorrect}
          disabled={disabled}
        >
          {correctLabel}
        </button>
      </div>
    </div>
  );
}
