import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { SWIPE_FEEDBACK, paintSwipeFeedback, clearSwipeFeedback } from '../../logic/swipeFeedback';
import './Coach.css';

/**
 * 単語帳（一覧）の案内。**初めて単語帳を開いたときに、1枚目のカードで1回だけ見せる。**
 *
 * 一覧で見わたせること → 赤い部分 → 横に払う → ✓ の順に、本物のカードを光らせたり動かしたりする。
 * 答えは開かない（開くと読み上げが鳴る）。採点も書かない（見せるだけ）。
 * どこかに触れたらやめる。
 */

const pause = (ms, alive) => new Promise((resolve, reject) => {
  setTimeout(() => (alive() ? resolve() : reject(new Error('stopped'))), ms);
});

export default function WordbookCoach({ shellRef, removeLabel, onDone }) {
  const reduce = useReducedMotion();
  const [line, setLine] = useState('');

  useEffect(() => {
    let alive = true;
    const isAlive = () => alive;
    const shell = shellRef.current;
    const card = shell?.querySelector('[data-card-index]');
    if (!card) {
      onDone();
      return undefined;
    }
    const veil = card.querySelector('.wordbook-veil');
    const check = card.querySelector('.wordbook-graduate');

    const reset = () => {
      veil?.classList.remove('is-coached');
      check?.classList.remove('is-coached');
      card.style.transition = '';
      card.style.transform = 'translate(0px, 0px)';
      clearSwipeFeedback(card);
    };
    const slide = async (toX, feedback) => {
      card.style.transition = 'transform 600ms cubic-bezier(.22,.9,.24,1)';
      card.style.transform = `translate(${toX}px, 0px)`;
      paintSwipeFeedback(card, feedback);
      await pause(1200, isAlive);
      card.style.transform = 'translate(0px, 0px)';
      clearSwipeFeedback(card);
      await pause(600, isAlive);
    };

    (async () => {
      try {
        await pause(400, isAlive);
        // 売りは一覧性。まずそれを言う
        setLine('一覧でまとめて見わたせる');
        await pause(1800, isAlive);
        setLine('赤い部分をタップすると答えが出る');
        veil?.classList.add('is-coached');
        await pause(2000, isAlive);
        veil?.classList.remove('is-coached');

        if (reduce) {
          setLine('右へ払う＝わかった　左へ払う＝もう一度');
          await pause(2600, isAlive);
        } else {
          setLine('右へ払うと「わかった」');
          await slide(60, SWIPE_FEEDBACK.correct);
          setLine('左へ払うと「もう一度」');
          await slide(-60, SWIPE_FEEDBACK.incorrect);
        }

        setLine(`✓ で「${removeLabel}」`);
        check?.classList.add('is-coached');
        await pause(2200, isAlive);
        check?.classList.remove('is-coached');

        setLine('やってみよう');
        await pause(1800, isAlive);
        alive = false;
        onDone();
      } catch (error) {
        // 途中でやめた
      }
    })();

    const stop = () => {
      if (!alive) return;
      alive = false;
      reset();
      onDone();
    };
    document.addEventListener('pointerdown', stop, true);
    return () => {
      alive = false;
      document.removeEventListener('pointerdown', stop, true);
      reset();
    };
    // 開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!line) return null;
  return (
    <div className="wordbook-coach" role="status" aria-live="polite">
      <span className="wordbook-coach__text">{line}</span>
    </div>
  );
}
