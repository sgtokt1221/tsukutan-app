import React from 'react';
import './AnswerControls.css';

/**
 * 回答操作。DESIGN_IMPLEMENTATION_PLAN.md 7.4 / 7.5。
 *
 * 見えるボタンを正式な操作とし、スワイプは同じ処理を呼ぶ補助にする。
 * これが無いと、スワイプを知らない生徒とキーボード利用者が完走できない。
 *
 * 計画書7.4の3段階（もう一度 / 迷った / わかった）のうち「迷った」は、
 * 保存側に対応する状態が無いため出していない。
 * updateUserWordProgress は isCorrect の二値しか受け取らない。
 * 保存仕様を決めてから追加する。
 */
export default function AnswerControls({
  onCorrect,
  onIncorrect,
  disabled = false,
  correctLabel = 'わかった',
  incorrectLabel = 'もう一度',
  hint,
}) {
  return (
    <div className="answer-controls">
      {hint && <p className="answer-controls__hint">{hint}</p>}
      <div className="answer-controls__buttons">
        <button
          type="button"
          className="answer-btn answer-btn--again"
          onClick={onIncorrect}
          disabled={disabled}
        >
          {incorrectLabel}
        </button>
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
