import React, { useCallback, useRef, useState } from 'react';
import { useMotionValueEvent } from 'framer-motion';
import { swipeIntentAt, intentText } from '../../logic/swipeIntent';
import './SwipeIntent.css';

/**
 * カードを動かしている最中に、上に「離すとどうなるか」を出す札。**毎回出す。**
 *
 * 右＝わかった（次は何日後）／左＝もう一度／上＝もう覚えた。円が一周したら、離せば決まる。
 * 離す前に結果が分かれば、指を戻して取りやめられる。
 *
 * カードの位置（x, y）を直接見て、この札だけを描き直す。
 * 学習画面全体の state にすると、指が動くたびに 800行の部品が描き直される。
 */

const RING = 2 * Math.PI * 13;

const sameIntent = (a, b) => (
  a === b || (a && b && a.kind === b.kind && a.locked === b.locked && a.progress === b.progress)
);

export default function SwipeIntent({ x, y, allowSwipeUp, word, policy }) {
  const [intent, setIntent] = useState(null);

  const update = useCallback(() => {
    const next = swipeIntentAt(x.get(), y.get(), allowSwipeUp);
    // 円は5%刻みで十分。細かく刻むと指の1px ごとに描き直す
    const rounded = next && { ...next, progress: Math.round(next.progress * 20) / 20 };
    setIntent((prev) => (sameIntent(prev, rounded) ? prev : rounded));
  }, [x, y, allowSwipeUp]);
  useMotionValueEvent(x, 'change', update);
  useMotionValueEvent(y, 'change', update);

  // 消えるときも文言を残したまま薄くする（空の札が一瞬見えないように）
  const lastRef = useRef(null);
  if (intent) lastRef.current = intent;
  const shown = intent || lastRef.current;
  const text = shown ? intentText(shown.kind, { word, policy }) : null;

  return (
    <div
      className={[
        'swipe-intent',
        intent ? 'is-on' : '',
        shown ? `swipe-intent--${shown.kind}` : '',
        shown?.locked ? 'is-locked' : '',
      ].join(' ')}
      aria-hidden="true"
      data-testid="swipe-intent"
    >
      <svg className="swipe-intent__ring" viewBox="0 0 34 34">
        <circle className="swipe-intent__track" cx="17" cy="17" r="13" />
        <circle
          className="swipe-intent__fill"
          cx="17"
          cy="17"
          r="13"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - (shown?.progress || 0))}
        />
      </svg>
      {text && (
        <span className="swipe-intent__text">
          <strong>{text.title}</strong>
          <span>{shown.locked ? `離すと決まり・${text.detail}` : text.detail}</span>
        </span>
      )}
    </div>
  );
}
