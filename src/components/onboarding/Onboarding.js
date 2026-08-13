import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaArrowLeft, FaArrowRight, FaBook, FaCheck, FaLayerGroup, FaPlay, FaRedo, FaStar,
} from 'react-icons/fa';
import './Onboarding.css';

/**
 * 初回だけ出す案内。
 *
 * ここで単語データ（2.1MB）を端末に保存する。黙って待たせると
 * 「開かない」に見えるので、進み具合を出しながら、その間に
 * 操作の説明を読んでもらう。読み終わる頃には保存も終わっている。
 *
 * スワイプや赤シートは、知らないと一生気づかない操作なので、
 * ここで一度だけ見せる。
 */

const STEPS = [
  {
    id: 'welcome',
    title: 'つくたんへようこそ',
    body: '目標から逆算して、今日やるぶんだけ出します。まずは操作を30秒だけ。',
    points: [],
  },
  {
    id: 'flashcard',
    title: 'カードで覚える',
    body: 'カードをタップすると答えが出ます。',
    points: [
      { icon: <FaArrowRight />, label: '右へスワイプ', text: 'わかった。次に出るまでの間隔が伸びる' },
      { icon: <FaArrowLeft />, label: '左へスワイプ', text: 'もう一度。今日のうちにまた出る' },
      { icon: <FaPlay />, label: '再生ボタン', text: '英語と意味を順に読み上げる。速さも選べる' },
    ],
  },
  {
    id: 'wordbook',
    title: '単語帳でまとめて見る',
    body: '一覧で赤シートのように隠して確認できます。',
    points: [
      { icon: <FaLayerGroup />, label: '答えを見る', text: '赤い部分をタップすると意味が出る' },
      { icon: <FaArrowRight />, label: '左右スワイプ', text: 'その場で採点。色が残るので進み具合が分かる' },
      { icon: <FaCheck />, label: 'チェック', text: 'もう覚えた語を復習から外す' },
    ],
  },
  {
    id: 'more',
    title: '自分に合わせて変える',
    body: '設定は次に開いたときも引き継ぎます。',
    points: [
      { icon: <FaRedo />, label: '英→和 / 和→英', text: '意味から英語を答える向きにもできる' },
      { icon: <FaStar />, label: '毎日みる', text: '気になる語に印を付けると、毎日出せる' },
      { icon: <FaBook />, label: '自由学習', text: '学年や英検の級から、自分のペースで進める' },
    ],
  },
];

const slide = {
  enter: (dir) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

export default function Onboarding({ progress = 0, ready = false, onFinish }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  const go = (next) => {
    setDirection(next > index ? 1 : -1);
    setIndex(Math.min(STEPS.length - 1, Math.max(0, next)));
  };

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-label="つくたんの使い方">
      <div className="onboarding__sheet">
        <ol className="onboarding__dots" aria-hidden="true">
          {STEPS.map((item, i) => (
            <li
              key={item.id}
              className={i === index ? 'onboarding__dot onboarding__dot--on' : 'onboarding__dot'}
            />
          ))}
        </ol>

        <div className="onboarding__stage">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step.id}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="onboarding__panel"
            >
              <h2 className="onboarding__title">{step.title}</h2>
              <p className="onboarding__body">{step.body}</p>

              {step.points.length > 0 && (
                <ul className="onboarding__points">
                  {step.points.map((point) => (
                    <li key={point.label} className="onboarding__point">
                      <span className="onboarding__icon" aria-hidden="true">{point.icon}</span>
                      <span className="onboarding__point-text">
                        <strong>{point.label}</strong>
                        {point.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
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
  );
}
