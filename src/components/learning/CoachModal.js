import React, { useEffect, useRef, useState } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { FaHandPointer } from 'react-icons/fa';
import { QUESTIONS_STAGE_1, QUESTIONS_PER_STAGE } from '../../logic/placementTestEngine';
import './Coach.css';

/**
 * 学習画面・単語力チェックテストの中の案内。**そのモードを初めて開いたとき、モーダルで出す。**
 *
 * 以前は本物のカードを自分で動かして見せていたが、「勝手に動いているように見える」
 * （2026-09-26）。本物のカードは生徒が触るまで動かさない。見本はモーダルの中の小さなカードで。
 *
 * 上スワイプは全部のモードで効く。新しい単語では「はっきり上へ払ったときだけ」と添える（→ logic/studyMode.js）。
 * どのモードで出すかの記録は logic/useSeenOnce.js。
 */

const GLIDE = [0.22, 0.9, 0.24, 1];
const STEP_MS = 2200;

/** 見本のカードの動き。pose は framer-motion の animate にそのまま渡す */
const CARD_STEPS = {
  tap: { pose: { x: 0, y: 0, rotate: 0, backgroundColor: '#FFFFFF' }, flip: true, hand: { x: 0, y: 0 } },
  good: { pose: { x: 70, y: 0, rotate: 8, backgroundColor: '#d9f99d' }, hand: { x: 70, y: 0 } },
  again: { pose: { x: -70, y: 0, rotate: -8, backgroundColor: '#fecaca' }, hand: { x: -70, y: 0 } },
  up: { pose: { x: 0, y: -46, rotate: 0, backgroundColor: '#fef08a' }, hand: { x: 0, y: -46 } },
  button: { pose: { x: 0, y: 0, rotate: 0, backgroundColor: '#FFFFFF' }, button: true },
  flip: { pose: { x: 0, y: 0, rotate: 0, backgroundColor: '#FFFFFF' }, flip: true },
  // 長押し：押している間だけ裏。指は押し込んだまま
  hold: { pose: { x: 0, y: 0, rotate: 0, backgroundColor: '#FFFFFF' }, flip: true, hand: { x: 0, y: 0 }, press: true },
  rest: { pose: { x: 0, y: 0, rotate: 0, backgroundColor: '#FFFFFF' } },
};

/** モードに合わせた手順。**文言は studyMode.js の表から** */
export function cardCoachSteps(policy) {
  const steps = [
    { key: 'tap', title: 'タップ', text: '答え（意味）が出る' },
    { key: 'hold', title: '長押し', text: '押している間だけ答えが見える。離すと戻る' },
    { key: 'good', title: '右へ払う', text: 'わかった。次に出るまでの間があく' },
    { key: 'again', title: '左へ払う', text: 'もう一度。今日のうちにまた出る' },
  ];
  if (policy.swipeUp) {
    // 新しい単語は、はっきり上へ払ったときだけ外れる（→ logic/cardGestures.js の STRICT_UP_SWIPE）
    const how = policy.swipeUp === 'strict' ? '大きくまっすぐ上へ払ったときだけ（少し流れただけでは外れない）。' : '';
    steps.push({ key: 'up', title: '上へ払う', text: `${policy.removeShort}。${how}${policy.removePlainHint}` });
  }
  steps.push({
    key: 'button',
    title: `「${policy.removeShort}」ボタン`,
    text: policy.swipeUp ? '上へ払うのと同じ' : policy.removePlainHint,
  });
  return steps;
}

/** 単語力チェックテスト（VocabularyCheckTest）。問題数は placementTestEngine の定数から */
export const TEST_COACH_STEPS = [
  { key: 'good', title: '右へ払う', text: 'わかる' },
  { key: 'again', title: '左へ払う', text: 'わからない。知らない語は迷わずこちらへ' },
  { key: 'hold', title: '長押し', text: '押している間だけ答えをのぞける。のぞいてからの「わかる」は半分だけ数える' },
  { key: 'flip', title: '答えを見る', text: '答えるとカードがめくれて意味が出る。すぐ次の問題へ進む' },
  {
    key: 'rest',
    title: 'ステージごとに難しさが変わる',
    text: `最初は${QUESTIONS_STAGE_1}問、そのあと${QUESTIONS_PER_STAGE}問ずつ。力が見えたところで終わり、ランクが決まって保存される（途中でやめると保存されない）`,
  },
];

/** 英検ライティング（2026-09-26）。見本の動きは無し、手順だけ */
export const WRITING_COACH_STEPS = [
  { key: 'read', title: '問題を読む', text: '本番と同じ形式。語数の目安も本番どおり' },
  { key: 'card', title: '右の「カンペ」を引く', text: '塾の重要表現・構文が並んでいる。見ながら書いてよい' },
  { key: 'write', title: '語数が緑になるまで書く', text: "短縮形（I'm, It's）は使わない" },
  { key: 'submit', title: '提出して採点', text: '内容・構成・語彙・文法を0〜4点で、堅めに採点する' },
];

export const WORDBOOK_COACH_STEPS = [
  { key: 'list', title: '一覧で見わたす', text: '1枚ずつめくらず、並んだまま次々に確かめられる' },
  { key: 'reveal', title: '赤い部分をタップ', text: '答えが出る。もう一度押すと隠れる' },
  { key: 'swipe', title: '横に払う', text: '右＝わかった／左＝もう一度。色が残るので苦手が一目で分かる' },
  { key: 'check', title: '✓ を押す', text: '' },
];

function useStepCycle(count) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % count), STEP_MS);
    return () => clearInterval(id);
  }, [count]);
  return step;
}

function CardDemo({ stepKey, buttons }) {
  const s = CARD_STEPS[stepKey];
  return (
    <div className="coach-demo">
      <div className="coach-demo__stage">
        <motion.div
          className="coach-demo__card"
          animate={s.pose}
          transition={{ duration: 0.7, ease: GLIDE }}
        >
          <span className="coach-demo__word">follow</span>
          <motion.span
            className="coach-demo__meaning"
            animate={{ opacity: s.flip ? 1 : 0 }}
            transition={{ delay: s.flip ? 0.5 : 0, duration: 0.25 }}
          >
            ～の後に続く
          </motion.span>
        </motion.div>
        {s.hand && (
          <motion.span
            key={stepKey}
            className="coach-demo__hand"
            aria-hidden="true"
            initial={{ x: 0, y: 0, scale: 1 }}
            animate={{ x: s.hand.x, y: s.hand.y, scale: stepKey === 'tap' ? [1, 0.85, 1] : s.press ? 0.85 : 1 }}
            transition={{ duration: 0.7, ease: GLIDE }}
          >
            <FaHandPointer />
          </motion.span>
        )}
      </div>
      <div className="coach-demo__buttons" aria-hidden="true">
        {buttons.map((b) => (
          <span key={b.kind} className={`coach-demo__btn coach-demo__btn--${b.kind}${b.kind === 'remove' && s.button ? ' is-coached' : ''}`}>
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const WB_ROWS = [
  { word: 'follow', meaning: '～の後に続く' },
  { word: 'decide', meaning: '決める' },
  { word: 'arrive', meaning: '着く' },
];

function WordbookDemo({ stepKey }) {
  const revealed = stepKey !== 'list';
  return (
    <div className="coach-demo">
      <ul className="coach-wb">
        {WB_ROWS.map((row, i) => {
          const swiped = (stepKey === 'swipe' || stepKey === 'check') && i < 2;
          const mark = i === 0 ? 'good' : 'again';
          return (
            <motion.li
              key={row.word}
              className="coach-wb__row"
              animate={{
                x: stepKey === 'swipe' && i < 2 ? [0, mark === 'good' ? 24 : -24, 0] : 0,
                backgroundColor: swiped ? (mark === 'good' ? '#effbe0' : '#fff0f0') : '#FFFFFF',
                opacity: stepKey === 'check' && i === 2 ? 0.35 : 1,
              }}
              transition={{ duration: 0.8, delay: i * 0.15, ease: GLIDE }}
            >
              <span className="coach-wb__word">{row.word}</span>
              <span className="coach-wb__meaning">
                {row.meaning}
                <motion.span
                  className="coach-wb__sheet"
                  animate={{ opacity: revealed && i <= (stepKey === 'reveal' ? 0 : 2) ? 0 : 1 }}
                  transition={{ duration: 0.25, delay: 0.3 }}
                />
              </span>
              <span className={`coach-wb__check${stepKey === 'check' && i === 2 ? ' is-coached' : ''}`}>✓</span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

const TITLES = { card: 'カードの使い方', wordbook: '単語帳の使い方', test: '単語力チェックテストの受け方', writing: 'ライティングの進め方' };

/**
 * @param {{ kind: 'card'|'wordbook'|'test', policy?: object, onClose: () => void }} props
 *   policy は card と wordbook のときだけ要る（studyModePolicy）
 */
export default function CoachModal({ kind, policy, onClose }) {
  let steps = kind === 'writing' ? WRITING_COACH_STEPS : TEST_COACH_STEPS;
  if (kind === 'card') steps = cardCoachSteps(policy);
  if (kind === 'wordbook') {
    steps = WORDBOOK_COACH_STEPS.map((s) => (s.key === 'check' ? { ...s, text: `${policy.removeLabel}。${policy.removePlainHint}` } : s));
  }
  const buttons = kind === 'test'
    ? [{ kind: 'again', label: 'わからない' }, { kind: 'good', label: 'わかる' }]
    : [{ kind: 'again', label: 'もう一度' }, { kind: 'remove', label: policy?.removeShort }, { kind: 'good', label: 'わかった' }];
  const step = useStepCycle(steps.length);
  const current = steps[step];
  const buttonRef = useRef(null);

  useEffect(() => {
    buttonRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="coach-modal" role="dialog" aria-modal="true" aria-labelledby="coach-modal-title">
        <div className="coach-modal__sheet">
          <h2 id="coach-modal-title" className="coach-modal__title">
            {TITLES[kind]}
          </h2>
          {kind === 'wordbook' && <WordbookDemo stepKey={current.key} />}
          {(kind === 'card' || kind === 'test') && <CardDemo stepKey={current.key} buttons={buttons} />}
          <ol className="coach-modal__steps">
            {steps.map((s, i) => (
              <li key={s.key} className={i === step ? 'coach-modal__step is-on' : 'coach-modal__step'}>
                <strong>{s.title}</strong>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
          <button ref={buttonRef} type="button" className="coach-modal__go" onClick={onClose}>
            やってみる
          </button>
        </div>
      </div>
    </MotionConfig>
  );
}
