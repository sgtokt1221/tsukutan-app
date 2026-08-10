import React, { useEffect, useState } from 'react';
import './PeekNudge.css';

/**
 * 答えを見たまま「わかった」を押したときに出る吹き出し。
 *
 * 自己申告なので、見てから「わかった」を押されると学習記録が実力より
 * 甘くなる。止めはしないが、気づかせる。responsibility は生徒側に置いて、
 * 軽く茶々を入れる調子にしてある。
 *
 * 数秒で自然に消える。操作は止めない。
 */

const MESSAGES = [
  '答え見てない？',
  '答え見てるがな',
  'いま見たでしょ',
  '見ながらは、わかったとは言わへんで',
];

export default function PeekNudge({ trigger }) {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!trigger) return undefined;

    // 毎回同じ文だと飽きるので、押した回数で順に変える。
    setMessage(MESSAGES[(trigger - 1) % MESSAGES.length]);
    const timer = setTimeout(() => setMessage(null), 2200);
    return () => clearTimeout(timer);
  }, [trigger]);

  if (!message) return null;

  return (
    <div className="peek-nudge" role="status" aria-live="polite">
      <span className="peek-nudge__bubble">{message}</span>
    </div>
  );
}
