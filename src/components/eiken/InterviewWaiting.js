import React, { useEffect, useState } from 'react';

/**
 * 採点が揃うまでの間。
 *
 * 結果画面を先に出すと、空の絵と「採点しています…」を眺めて待つことになる。
 * 揃うまではこちらを見せ、その間に二次試験の心得を1つずつ出す。待ち時間を
 * 練習の続きにする。
 *
 * 心得は級ごとの素材（interviewer-{級}.json の tips）をそのまま使う。
 * 待ち時間のために別の文言を書くと、正本が2つになる。
 */

/** 1つの心得を見せている時間。読み切れて、かつ飽きない長さ。 */
const HOLD_MS = 4000;

export default function InterviewWaiting({ tips = [], done = 0, total = 0 }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (tips.length <= 1) return undefined;
    const id = setInterval(() => setIndex((value) => (value + 1) % tips.length), HOLD_MS);
    return () => clearInterval(id);
  }, [tips.length]);

  const tip = tips[index] || null;

  return (
    <div className="interview-result-backdrop" role="presentation">
      <div className="interview-waiting" role="status" aria-live="polite">
        <p className="interview-waiting__label">採点しています</p>

        <div className="interview-waiting__bar">
          <span
            className="interview-waiting__fill"
            style={{ width: total > 0 ? `${Math.round((done / total) * 100)}%` : '0%' }}
          />
        </div>
        <p className="interview-waiting__count">{done} / {total}</p>

        {tip && (
          // key を変えると入れ替わるたびにアニメーションが走る
          <p className="interview-waiting__tip" key={index}>{tip}</p>
        )}
      </div>
    </div>
  );
}
