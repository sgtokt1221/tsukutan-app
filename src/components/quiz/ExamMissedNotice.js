import React from 'react';
import './AssignedQuiz.css';

/**
 * 「受験サポートのテストでまちがえた語を、復習に入れました」の知らせ（2026-09-24）。
 * 取り込んだその回だけ出す（次に開いたときは、取り込み済みなので出ない）。
 * 毎日の復習の枠に入るのは翌日の計画から（今日の計画は保存済み）なので、「今すぐ復習する」を添える。
 */
export default function ExamMissedNotice({ words, onReview, onClose }) {
  if (!words || words.length === 0) return null;
  return (
    <section className="exam-missed-notice" aria-label="受験サポートのテストでまちがえた単語">
      <p className="exam-missed-notice__text">
        受験サポートのテストでまちがえた <strong>{words.length}語</strong> を、復習に入れました。
      </p>
      <div className="exam-missed-notice__actions">
        <button type="button" className="assigned-quiz__primary" onClick={onReview}>今すぐ復習する</button>
        <button type="button" className="assigned-quiz__quit" onClick={onClose}>あとで</button>
      </div>
    </section>
  );
}
