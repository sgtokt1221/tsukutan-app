import React from 'react';
import { FaCheck, FaGraduationCap, FaRedo } from 'react-icons/fa';
import './AnswerControls.css';

/**
 * 丸いボタン（round）のときの中身。印を丸の中に、名前を下に。
 * **文字は label だけ**にする（印は svg なので、ボタンの名前・textContent は今までと同じ）
 */
const RoundLabel = ({ Icon, label }) => (
  <>
    <span className="answer-btn__circle" aria-hidden="true"><Icon /></span>
    <span className="answer-btn__label">{label}</span>
  </>
);

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
  // 中央に置く「もう覚えた」（上スワイプと同じ）。`{ label, fullLabel, hint, onClick }`
  middle,
  disabled = false,
  correctLabel = 'わかった',
  incorrectLabel = 'もう一度',
  hardLabel = '迷った',
  hint,
  // 丸いボタンにする（単語力チェックテストと同じ見た目。2026-09-26）
  round = false,
}) {
  const body = (Icon, label) => (round ? <RoundLabel Icon={Icon} label={label} /> : label);
  return (
    <div className={round ? 'answer-controls answer-controls--round' : 'answer-controls'}>
      {hint && <p className="answer-controls__hint">{hint}</p>}
      <div className={(onHard || middle) ? 'answer-controls__buttons answer-controls__buttons--three' : 'answer-controls__buttons'}>
        <button
          type="button"
          className="answer-btn answer-btn--again"
          onClick={onIncorrect}
          disabled={disabled}
        >
          {body(FaRedo, incorrectLabel)}
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
        {middle && (
          <button
            type="button"
            className="answer-btn answer-btn--graduate"
            onClick={middle.onClick}
            disabled={disabled}
            aria-label={middle.fullLabel || middle.label}
            title={middle.hint}
          >
            {body(FaGraduationCap, middle.label)}
          </button>
        )}
        <button
          type="button"
          className="answer-btn answer-btn--known"
          onClick={onCorrect}
          disabled={disabled}
        >
          {body(FaCheck, correctLabel)}
        </button>
      </div>
    </div>
  );
}
