import React, { useEffect, useState } from 'react';
import RetentionBar from './RetentionBar';
import { loadMyTextbookMastery, orderForPicker, textbookBreakdown } from '../../logic/textbookMastery';

/**
 * きろくの「教材ごとの定着度」（2026-09-27）。教材を1つ選ぶと、その教材の語の内訳が帯で出る。
 * 最初に出すのは学んだ語がいちばん多い教材。**ほかの欄より遅れて届く**（サーバで数える）ので、
 * きろく全体の読み込みは待たせない。
 */
export default function TextbookMastery({ load = loadMyTextbookMastery }) {
  const [state, setState] = useState({ status: 'loading', list: [] });
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let alive = true;
    load()
      .then((mastery) => { if (alive) setState({ status: 'done', list: orderForPicker(mastery) }); })
      .catch(() => { if (alive) setState({ status: 'error', list: [] }); });
    return () => { alive = false; };
  }, [load]);

  if (state.status === 'loading') return <p className="rec-empty">教材ごとの定着度を数えています…</p>;
  if (state.status === 'error') return <p className="rec-empty">教材ごとの定着度を読めませんでした。電波の良いところで開き直してください。</p>;
  if (state.list.length === 0) return <p className="rec-empty">まだ教材がありません</p>;

  const selected = state.list.find((m) => m.id === selectedId) || state.list[0];
  return (
    <div className="rec-mastery">
      <select
        className="rec-mastery__select"
        value={selected.id}
        onChange={(e) => setSelectedId(e.target.value)}
        aria-label="教材を選ぶ"
      >
        {state.list.map((m) => (
          <option key={m.id} value={m.id}>
            {m.title}{m.learned > 0 ? `（学んだ語 ${m.learned.toLocaleString()}）` : ''}
          </option>
        ))}
      </select>
      <RetentionBar breakdown={textbookBreakdown(selected)} />
    </div>
  );
}
