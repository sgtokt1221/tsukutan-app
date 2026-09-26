import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FaArrowDown, FaArrowRight, FaArrowUp, FaTimes, FaUndo } from 'react-icons/fa';
import './CheckTest.css';

/**
 * 単語力チェックテストの画面の部品（2026-09-26 に作り直した）。
 *
 * **文字を減らす。** 出題レベル・正答率・「1 / 5」は出さない。
 * 生徒が知りたいのは「あとどれくらいか」だけなので、バーと「あと約N問」とデッキの厚みで見せる。
 */

const GLIDE = [0.22, 0.9, 0.24, 1];

/**
 * 上の帯。やめる／進み具合／前の問題。
 * 進み具合は**戻さない**（見込みが増えても、バーは下げずに止めておく。下がると後退したように見える）。
 */
export function CheckTestTopBar({ answered, remaining, onQuit, onBack, canGoBack }) {
  const bestRef = useRef(0);
  const ratio = answered + remaining > 0 ? answered / (answered + remaining) : 0;
  bestRef.current = Math.max(bestRef.current, ratio);
  const percent = Math.round(bestRef.current * 100);
  return (
    <div className="vct-top">
      <button type="button" className="vct-icon-btn" onClick={onQuit} aria-label="前の画面に戻る">
        <FaTimes aria-hidden="true" />
      </button>
      <div className="vct-progress">
        <div
          className="vct-progress__track"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="テストの進み具合"
        >
          <motion.div
            className="vct-progress__fill"
            animate={{ width: `${Math.max(4, percent)}%` }}
            transition={{ duration: 0.5, ease: GLIDE }}
          />
        </div>
        <span className="vct-progress__left">あと約{remaining}問</span>
      </div>
      <button
        type="button"
        className="vct-icon-btn"
        onClick={onBack}
        disabled={!canGoBack}
        aria-label="前の問題"
      >
        <FaUndo aria-hidden="true" />
      </button>
    </div>
  );
}

/** むずかしさ（出題レベル 1〜7）を、電波の強さのような棒で */
export function DifficultyMeter({ level, max = 7 }) {
  return (
    <div className="vct-meter" role="img" aria-label={`むずかしさ ${level} / ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <motion.span
          key={i}
          className={i < level ? 'vct-meter__bar is-on' : 'vct-meter__bar'}
          style={{ height: `${8 + i * 3}px` }}
          animate={{ scaleY: i < level ? 1 : 0.6 }}
          transition={{ duration: 0.35, delay: i * 0.03, ease: GLIDE }}
        />
      ))}
    </div>
  );
}

/**
 * ステージが変わったときに一瞬だけ出す。むずかしさが上がったか下がったかを矢印で。
 * 押す邪魔をしない（pointer-events: none）。
 */
export function StageBanner({ stage, level }) {
  const [shown, setShown] = useState(null);
  // 前に見たステージとむずかしさ。**ステージが変わったときだけ出す**（最初のステージでは出さない。
  // 「初回かどうか」の印で判定すると、開発時の二重実行で1回目に出てしまった）。
  // 上がったか下がったかもここで比べる（親で比べると、読むのが1回ぶん遅れて「このまま」と出た）
  const prevRef = useRef({ stage, level });
  useEffect(() => {
    const prev = prevRef.current;
    if (prev.stage === stage) {
      prevRef.current = { stage, level };
      return undefined;
    }
    prevRef.current = { stage, level };
    const trend = level > prev.level ? 'up' : level < prev.level ? 'down' : 'same';
    setShown({ stage, trend });
    const id = setTimeout(() => setShown(null), 1200);
    return () => clearTimeout(id);
  }, [stage, level]);

  const Icon = shown?.trend === 'up' ? FaArrowUp : shown?.trend === 'down' ? FaArrowDown : FaArrowRight;
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.stage}
          className={`vct-banner vct-banner--${shown.trend}`}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.15 }}
          transition={{ duration: 0.35, ease: GLIDE }}
          aria-live="polite"
        >
          <span className="vct-banner__stage">STAGE {shown.stage}</span>
          <span className="vct-banner__trend">
            <Icon aria-hidden="true" />
            {shown.trend === 'up' ? 'むずかしく' : shown.trend === 'down' ? 'やさしく' : 'このまま'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 後ろに積んだカード。枚数で残りの多さを見せる（最大3枚） */
export function Deck({ remaining }) {
  const layers = Math.min(3, Math.max(0, remaining - 1));
  return (
    <div className="vct-deck" aria-hidden="true">
      {Array.from({ length: layers }, (_, i) => (
        <motion.span
          key={i}
          className="vct-deck__card"
          initial={false}
          animate={{ y: (i + 1) * 8, scale: 1 - (i + 1) * 0.04, opacity: 1 - (i + 1) * 0.22 }}
          transition={{ duration: 0.3 }}
          style={{ zIndex: -1 - i }}
        />
      ))}
    </div>
  );
}

/** 「わかる」のときの小さな花火。key を変えると1回鳴る */
export function Burst({ trigger }) {
  if (!trigger) return null;
  return (
    <div className="vct-burst" key={trigger} aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const reach = i % 2 === 0 ? 150 : 110;
        return (
          <motion.span
            key={i}
            className="vct-burst__dot"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1.2 }}
            animate={{ x: Math.cos(angle) * reach, y: Math.sin(angle) * reach, opacity: 0, scale: 0.3 }}
            transition={{ duration: 0.7, ease: [0.1, 0.8, 0.3, 1] }}
          />
        );
      })}
    </div>
  );
}
