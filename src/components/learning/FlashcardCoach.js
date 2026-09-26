import React, { useEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { FaHandPointer } from 'react-icons/fa';
import './Coach.css';

/**
 * 単語カードの案内。**そのモードを初めて開いた1枚目で、本物のカードが自分で動いて見せる。**
 *
 * 文字で「右へスワイプ」と書くより、カードと指が動くほうが伝わる。カードの位置（x, y）を
 * 本物と同じ値で動かすので、上の札（SwipeIntent）も実際と同じ文言で出る（次は何日後まで）。
 *
 * 上スワイプは効くモード（復習・自由学習）でだけ見せる。効かないモードで見せると、
 * 上に払って何も起きない（→ logic/studyMode.js）。
 *
 * 終わったら「やってみよう」を出し、1回答えたら親が消す。
 * **どこかに触れたら、その場で実演をやめる**（触りたい人を待たせない）。
 *
 * ここが描くのは指だけ。説明の文は `onLine` で親へ渡し、回答ボタンの上に出す
 * （カードの下に置くと、背の低い端末でカードに重なる）。
 */

const pause = (ms, alive) => new Promise((resolve, reject) => {
  setTimeout(() => (alive() ? resolve() : reject(new Error('stopped'))), ms);
});

export default function FlashcardCoach({
  phase, // 'demo' | 'try'
  x,
  y,
  allowSwipeUp,
  removeCoachText,
  onFlip,
  onHighlightRemove,
  onDemoEnd,
  onLine,
}) {
  const reduce = useReducedMotion();
  const setLine = onLine;
  const [hand, setHand] = useState({ on: false, press: false });
  const runningRef = useRef(null);

  useEffect(() => {
    if (phase !== 'demo') return undefined;
    let alive = true;
    const isAlive = () => alive;
    const controls = [];
    const move = (mv, to, duration) => {
      const c = animate(mv, to, { duration, ease: [0.22, 0.9, 0.24, 1] });
      controls.push(c);
      return c;
    };

    const stop = () => {
      if (!alive) return;
      alive = false;
      controls.forEach((c) => c.stop());
      x.set(0);
      y.set(0);
      onFlip(false);
      onHighlightRemove(false);
      setHand({ on: false, press: false });
    };
    runningRef.current = stop;

    const swipe = async (text, toX, toY) => {
      setLine(text);
      setHand({ on: true, press: false });
      await pause(350, isAlive);
      setHand({ on: true, press: true });
      await pause(150, isAlive);
      move(x, toX, 0.75);
      move(y, toY, 0.75);
      // 札（次は何日後）を読める長さだけ止める
      await pause(1900, isAlive);
      setHand({ on: true, press: false });
      move(x, 0, 0.45);
      move(y, 0, 0.45);
      await pause(550, isAlive);
    };

    (async () => {
      try {
        if (reduce) {
          // 動きを減らす設定では、動かさずに順に言葉だけ見せる
          setLine('右へ払う＝わかった　左へ払う＝もう一度');
          await pause(2600, isAlive);
          if (allowSwipeUp) {
            setLine('上へ払う＝もう覚えた');
            await pause(2000, isAlive);
          }
        } else {
          setLine('カードの動かし方');
          await pause(700, isAlive);

          setHand({ on: true, press: false });
          setLine('タップすると答えが出る');
          await pause(400, isAlive);
          setHand({ on: true, press: true });
          await pause(160, isAlive);
          setHand({ on: true, press: false });
          onFlip(true);
          await pause(1400, isAlive);

          await swipe('右へ払うと「わかった」', 120, 0);
          await swipe('左へ払うと「もう一度」', -120, 0);
          if (allowSwipeUp) await swipe('上へ払うと「もう覚えた」', 0, -108);
          setHand({ on: false, press: false });
        }

        onHighlightRemove(true);
        setLine(removeCoachText);
        await pause(2400, isAlive);
        onHighlightRemove(false);
        onFlip(false);
        alive = false;
        onDemoEnd();
      } catch (error) {
        // 途中でやめた（stop 済み）
      }
    })();

    return stop;
    // 実演は phase が 'demo' になったときに1回だけ走らせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // どこかに触れたら実演をやめる。触った操作そのものはそのまま通す
  useEffect(() => {
    if (phase !== 'demo') return undefined;
    const onDown = (event) => {
      if (event.target.closest?.('[data-coach-skip]')) return;
      runningRef.current?.();
      onDemoEnd();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [phase, onDemoEnd]);

  useEffect(() => {
    if (phase === 'try') onLine('やってみよう');
  }, [phase, onLine]);

  // 指。カードと同じ x, y で動くので、カードを押して引いているように見える
  return (
    <motion.div
      className={`coach-hand${hand.on && phase === 'demo' ? ' is-on' : ''}${hand.press ? ' is-press' : ''}`}
      style={{ x, y }}
      aria-hidden="true"
    >
      <FaHandPointer />
    </motion.div>
  );
}
