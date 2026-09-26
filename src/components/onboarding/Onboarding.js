import React, { useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { STEPS } from './OnboardingScenes';
import './Onboarding.css';

/**
 * 初回だけ出す案内。**どうして覚えられるのかと、どこに何があるか**を、アニメで見せる。
 * ページの中身は OnboardingScenes.js。ここは枠・進み方・保存の進み具合だけ。
 *
 * ここで単語データ（2.1MB）を端末に保存する。黙って待たせると
 * 「開かない」に見えるので、進み具合を出しながら、その間に見てもらう。
 *
 * **指の動かし方はここで説明しない**（2026-09-26 に分けた）。上スワイプはモードで
 * 効いたり効かなかったりするので、まとめて説明しても覚えられない。カードを開いたときに
 * その場で、本物のカードを動かして見せる（→ components/learning/FlashcardCoach.js）。
 *
 * 図の日数は、実際に次の日を決める計算（`reviewGaps` → `nextSchedule`）から出す。
 * 手で書くと、計算を変えたときに案内だけ嘘になる。
 */

const slide = {
  enter: (dir) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

export default function Onboarding({ progress = 0, ready = false, onFinish }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const step = STEPS[index];
  const { Scene, where } = step;
  const isLast = index === STEPS.length - 1;
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  const go = (next) => {
    setDirection(next > index ? 1 : -1);
    setIndex(Math.min(STEPS.length - 1, Math.max(0, next)));
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="onboarding" role="dialog" aria-modal="true" aria-label="つくつくの使い方">
        <div className="onboarding__sheet">
          <div className="onboarding__top">
          <ol className="onboarding__dots" aria-hidden="true">
            {STEPS.map((item, i) => (
              <li
                key={item.id}
                className={i === index ? 'onboarding__dot onboarding__dot--on' : 'onboarding__dot'}
              />
            ))}
          </ol>
          {/* 長いので、知っている人は最後（はじめる）へ飛べる */}
          {!isLast && (
            <button type="button" className="onboarding__skip" onClick={() => go(STEPS.length - 1)}>
              とばす
            </button>
          )}
          </div>

          <div className="onboarding__stage">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={step.id}
                custom={direction}
                variants={slide}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.22, 0.9, 0.24, 1] }}
                className="onboarding__panel"
              >
                <span className="onboarding__where">
                  <where.Icon aria-hidden="true" />
                  {where.label}
                </span>
                <h2 className="onboarding__title">{step.title}</h2>
                <p className="onboarding__body">{step.body}</p>
                <div className="onboarding__viz">
                  <Scene />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 保存の進み具合。終わっていれば出さない。 */}
          {!ready && (
            <div className="onboarding__progress">
              <div className="onboarding__progress-head">
                <span>初回だけ単語データを保存しています</span>
                <span className="onboarding__percent">{percent}%</span>
              </div>
              <div
                className="onboarding__track"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="単語データの保存"
              >
                <div className="onboarding__fill" style={{ width: `${percent}%` }} />
              </div>
              <p className="onboarding__note">次からは保存したぶんを使うので、すぐ開きます。</p>
            </div>
          )}

          <div className="onboarding__actions">
            {index > 0 && (
              <button type="button" className="onboarding__back" onClick={() => go(index - 1)}>
                戻る
              </button>
            )}
            {!isLast ? (
              <button type="button" className="onboarding__next" onClick={() => go(index + 1)}>
                次へ
              </button>
            ) : (
              <button
                type="button"
                className="onboarding__next"
                onClick={onFinish}
                disabled={!ready}
              >
                {ready ? 'はじめる' : `準備中… ${percent}%`}
              </button>
            )}
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
