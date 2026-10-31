import React, { useState } from 'react';
import { FaEnvelopeOpenText } from 'react-icons/fa';
import './AssignedQuiz.css';

const dateText = (ts) => {
  const ms = ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null;
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * ホームに出す「先生からのメッセージ」（2026-09-27）。**まだ読んでいないものがあるときだけ。**
 * 「読んだ」を押すと、書いてから親が読み直して消す（手元で消さない）。
 */
export default function StaffMessageCard({ messages, onRead }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  if (!messages || messages.length === 0) return null;
  const read = async (id) => {
    setBusy(id);
    setError('');
    try {
      await onRead(id);
    } catch (e) {
      setError('うまく送れませんでした。電波の良いところで、もう一度押してください。');
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="assigned-quiz-card staff-message-card" aria-label="先生からのメッセージ">
      <p className="assigned-quiz-card__eyebrow">
        <FaEnvelopeOpenText aria-hidden="true" /> 先生からのメッセージ
      </p>
      {messages.map((m) => (
        <div key={m.id} className="staff-message-card__item">
          {m.relatedTitle && <p className="assigned-quiz-card__meta">{m.relatedTitle}</p>}
          <p className="staff-message-card__text">{m.text}</p>
          <div className="staff-message-card__foot">
            <span className="assigned-quiz-card__meta">
              {m.createdByName ? `${m.createdByName}先生` : '先生'}{dateText(m.createdAt) && `・${dateText(m.createdAt)}`}
            </span>
            <button type="button" className="staff-message-card__read" onClick={() => read(m.id)} disabled={busy === m.id}>
              {busy === m.id ? '送っています…' : '読んだ'}
            </button>
          </div>
        </div>
      ))}
      {error && <p className="staff-message-card__error" role="alert">{error}</p>}
    </section>
  );
}
