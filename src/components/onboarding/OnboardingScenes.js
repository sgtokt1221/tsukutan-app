import React, { useEffect, useState } from 'react';
import { AnimatePresence, animate, motion } from 'framer-motion';
import {
  FaBook, FaCheck, FaClone, FaLightbulb, FaPlay, FaRedo, FaStar,
} from 'react-icons/fa';
import { MOTIVATION_LEVELS } from '../../config';
import RANKS from '../../config/ranks.json';
import { MAX_NEW_WORDS_PER_DAY } from '../../logic/dailyPlanMath';
import { RETENTION_BUCKETS } from '../../logic/retentionBreakdown';
import { reviewGaps } from '../../logic/swipeIntent';
import { STUDENT_TABS } from '../layout/StudentShell';

/**
 * 初回の案内の各ページ（図とアニメ）。枠・進み方・保存の進み具合は Onboarding.js。
 *
 * **数や名前は正本から引く**（やる気のペース・1日の上限・復習の間隔・ランク・定着の区分）。
 * 手で書くと、元を変えたときに案内だけ嘘になる。
 */

const GLIDE = [0.22, 0.9, 0.24, 1];

/** ms ごとに数を1つ進める。図は key にこれを入れて、最初から描き直す */
function useCycle(ms) {
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCycle((c) => c + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return cycle;
}

function CountUp({ to, delay = 0 }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const controls = animate(0, to, {
      duration: 1.1, delay, ease: 'easeOut', onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [to, delay]);
  return <>{value.toLocaleString()}</>;
}

// ---- 今日のぶん ----

const EXAMPLE_REST = 1200;
const EXAMPLE_DAYS = 60;

function PlanScene() {
  const cycle = useCycle(6500);
  const paces = ['low', 'normal', 'high'].map((key) => ({ key, ...MOTIVATION_LEVELS[key] }));
  const perDay = Math.ceil(EXAMPLE_REST / EXAMPLE_DAYS);
  const chosen = paces.find((p) => p.key === 'normal');
  const today = Math.min(MAX_NEW_WORDS_PER_DAY, Math.max(perDay, chosen.newWordsQuota));
  return (
    <div className="ob-plan" key={cycle}>
      <p className="ob-plan__eq">
        <span className="ob-plan__label">残り</span>
        <span className="ob-plan__num"><CountUp to={EXAMPLE_REST} /></span>
        <span className="ob-plan__unit">語</span>
        <span className="ob-plan__op">÷</span>
        <span className="ob-plan__num"><CountUp to={EXAMPLE_DAYS} /></span>
        <span className="ob-plan__unit">日</span>
      </p>
      <ul className="ob-plan__paces" aria-label="希望のペース">
        {paces.map((p, i) => (
          <motion.li
            key={p.key}
            className="ob-plan__pace"
            initial={{ opacity: 0, y: 6 }}
            animate={p.key === 'normal'
              ? { opacity: 1, y: 0, backgroundColor: ['#FFFDF7', '#FFFDF7', '#183153'], color: ['#183153', '#183153', '#FFFFFF'] }
              : { opacity: 1, y: 0 }}
            transition={{ delay: 1.2 + i * 0.15, duration: p.key === 'normal' ? 1.2 : 0.3 }}
          >
            {p.name} {p.newWordsQuota}語
          </motion.li>
        ))}
      </ul>
      <motion.p
        className="ob-plan__result"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 2.6, duration: 0.6, ease: GLIDE }}
      >
        今日は {today}語
      </motion.p>
      <motion.p
        className="ob-plan__cap"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 3.2, duration: 0.4 }}
      >
        間に合う数と、選んだペースの多い方。1日{MAX_NEW_WORDS_PER_DAY}語まで
      </motion.p>
    </div>
  );
}

// ---- 忘れる前にまた出る ----

const W = 320;
const H = 200;
const X0 = 16;
const X1 = W - 16;
const Y_TOP = 30;
const Y_BOT = H - 36;

const GAPS = reviewGaps(4); // 普通なら [1, 6, 17, 48]
const REVIEW_DAYS = GAPS.reduce((days, gap) => [...days, days[days.length - 1] + gap], [0]);
const SPAN = REVIEW_DAYS[REVIEW_DAYS.length - 1] * 1.1;
// 間が伸びても画面に収まるよう、日数は対数で詰める
const xOf = (day) => X0 + (X1 - X0) * (Math.log1p(day) / Math.log1p(SPAN));
const yOf = (r) => Y_BOT - (Y_BOT - Y_TOP) * r;

/** 見直した日から次の日まで。次に出る日には 4割まで落ちる形にする（形を見せる図） */
const segmentPath = (from, to, gap) => {
  const points = [];
  for (let s = 0; s <= 24; s++) {
    const day = from + ((to - from) * s) / 24;
    points.push(`${s ? 'L' : 'M'}${xOf(day).toFixed(1)} ${yOf(Math.exp((-0.9 * (day - from)) / gap)).toFixed(1)}`);
  }
  return points.join(' ');
};

const SEGMENTS = REVIEW_DAYS.map((day, i) => {
  const next = REVIEW_DAYS[i + 1] ?? SPAN;
  const gap = GAPS[i] ?? GAPS[GAPS.length - 1] * 2.8;
  return segmentPath(day, next, gap);
});
// 1回やったきりの線
const FORGET = segmentPath(0, SPAN, GAPS[0] / 2);
const dayLabel = (day) => (day === 0 ? '今日' : `${day}日後`);

function CurveScene() {
  const cycle = useCycle(8000);
  const start = 1.6;
  const step = 1.0;
  return (
    <div className="ob-curve" key={cycle}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="見直すたびに、覚えている量が戻り、次に出るまでの間が伸びていく図">
        {/* 見出しは右上。左上は「はじめて」の吹き出しが出る */}
        <text className="ob-curve__legend" x={X1} y={16} textAnchor="end">覚えている量</text>
        <line className="ob-curve__axis" x1={X0} x2={X1} y1={Y_BOT} y2={Y_BOT} />
        {REVIEW_DAYS.map((day, i) => (
          <text
            key={day}
            className="ob-curve__tick"
            x={xOf(day)}
            y={Y_BOT + 20}
            textAnchor={i === 0 ? 'start' : i === REVIEW_DAYS.length - 1 ? 'end' : 'middle'}
          >
            {dayLabel(day)}
          </text>
        ))}

        <motion.path
          className="ob-curve__forget"
          d={FORGET}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        />
        <motion.text
          className="ob-curve__forget-label"
          x={xOf(3)}
          y={Y_BOT - 8}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          出てこないと、忘れる
        </motion.text>

        {SEGMENTS.map((d, i) => (
          <motion.path
            key={d}
            className="ob-curve__line"
            d={d}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: start + i * step + 0.2, duration: step - 0.2, ease: 'easeInOut' }}
          />
        ))}
        {REVIEW_DAYS.map((day, i) => (
          <motion.circle
            key={day}
            className="ob-curve__dot"
            cx={xOf(day)}
            cy={yOf(1)}
            r={5}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: start + i * step, duration: 0.2 }}
          />
        ))}
      </svg>
      {/* 吹き出しは SVG の外に置く（SVG の文字は背景を敷けない） */}
      {REVIEW_DAYS.map((day, i) => (
        <motion.span
          key={day}
          className="ob-curve__bubble"
          style={{ left: `${(xOf(day) / W) * 100}%`, top: `${(yOf(1) / H) * 100}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ delay: start + i * step - 0.1, duration: step, times: [0, 0.15, 0.8, 1] }}
        >
          {i === 0 ? 'はじめて' : 'わかった'}
        </motion.span>
      ))}
      <p className="ob-curve__cap">
        間が {GAPS.map((g) => `${g}日`).join(' → ')} と伸びていく（ペースが普通のとき）
      </p>
    </div>
  );
}

// ---- 行き先は3つ ----

const DESTS = [
  { key: 'good', button: 'わかった', to: { x: 110, rotate: 10 }, bg: '#d9f99d', title: 'わかった', text: '次に出るまでの間があく' },
  { key: 'again', button: 'もう一度', to: { x: -110, rotate: -10 }, bg: '#fecaca', title: 'もう一度', text: '今日のうちに、また出る' },
  { key: 'graduate', button: 'もう覚えた', to: { y: -24, scale: 0.7 }, bg: '#fef08a', title: 'もう覚えた', text: 'このカードは、もう出てこない' },
];
const BUTTON_ORDER = ['again', 'graduate', 'good'];

function DestScene() {
  const cycle = useCycle(2400);
  const dest = DESTS[cycle % DESTS.length];
  return (
    <div className="ob-dest">
      <div className="ob-dest__stage">
        <motion.div
          key={cycle}
          className="ob-dest__card"
          initial={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, backgroundColor: '#FFFFFF' }}
          animate={{ ...dest.to, opacity: 0, backgroundColor: dest.bg }}
          transition={{
            delay: 0.7,
            duration: 0.8,
            ease: GLIDE,
            backgroundColor: { delay: 0.4, duration: 0.3 },
          }}
        >
          follow
        </motion.div>
      </div>
      <motion.p
        key={`t${cycle}`}
        className="ob-dest__say"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.3 }}
      >
        <strong>{dest.title}</strong>
        {dest.text}
      </motion.p>
      <div className="ob-dest__buttons" aria-hidden="true">
        {BUTTON_ORDER.map((key) => {
          const d = DESTS.find((item) => item.key === key);
          return (
            <span key={key} className={`ob-dest__btn ob-dest__btn--${key}${key === dest.key ? ' is-hit' : ''}`}>
              {d.button}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---- 単語帳：一覧で見わたす ----
// 売りは一覧性。1枚ずつめくるカードと違い、並んだまま赤シートを次々に開けて、
// 横に払えばその場で答え合わせ（色が残る）。

const WORDBOOK_SAMPLE = [
  { word: 'follow', meaning: '～の後に続く', mark: 'good' },
  { word: 'decide', meaning: '決める', mark: 'good' },
  { word: 'arrive', meaning: '着く', mark: 'again' },
  { word: 'borrow', meaning: '借りる', mark: 'good' },
  { word: 'protect', meaning: '守る', mark: null },
];

function WordbookScene() {
  const cycle = useCycle(7000);
  const openAt = (i) => 1.1 + i * 0.45;
  const markAt = (i) => openAt(i) + 0.3;
  return (
    <div className="ob-wordbook" key={cycle}>
      <ul className="ob-wordbook__list">
        {WORDBOOK_SAMPLE.map((row, i) => (
          <motion.li
            key={row.word}
            className="ob-wordbook__row"
            initial={{ opacity: 0, y: 10, backgroundColor: '#FFFFFF' }}
            animate={{
              opacity: 1,
              y: 0,
              x: row.mark ? [0, 0, row.mark === 'good' ? 18 : -18, 0] : 0,
              backgroundColor: row.mark ? ['#FFFFFF', '#FFFFFF', row.mark === 'good' ? '#effbe0' : '#fff0f0'] : '#FFFFFF',
            }}
            transition={{
              opacity: { delay: i * 0.08, duration: 0.3 },
              y: { delay: i * 0.08, duration: 0.4, ease: GLIDE },
              x: { delay: markAt(i), duration: 0.6, times: [0, 0.1, 0.5, 1] },
              backgroundColor: { delay: markAt(i), duration: 0.6, times: [0, 0.4, 1] },
            }}
          >
            <span className="ob-wordbook__word">{row.word}</span>
            <span className="ob-wordbook__meaning">
              {row.meaning}
              <motion.span
                className="ob-wordbook__sheet"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: openAt(i), duration: 0.25 }}
              />
            </span>
          </motion.li>
        ))}
      </ul>
      <motion.p
        className="ob-wordbook__cap"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.4 }}
      >
        赤シートをタップで開き、横に払えばその場で答え合わせ。色が残るので、どこが苦手か一目で分かる
      </motion.p>
    </div>
  );
}

// ---- ホーム：今日のタスク ----
// 新規を1回終えると今日のタスクは完了。新規の札が「おかわり」に替わる（StudentDashboard の今日のタスク）

const TASKS = [
  { key: 'new', Icon: FaBook, name: '新規単語', count: 20, text: '目標で選んだ教材から、新しい語' },
  { key: 'review', Icon: FaRedo, name: '復習単語', count: 12, text: '忘れかけたころに戻ってきた語' },
  { key: 'star', Icon: FaStar, name: '毎日みる', count: 5, text: '★を付けた語。覚えるまで毎日出せる' },
];

function TasksScene() {
  const cycle = useCycle(7500);
  return (
    <div className="ob-tasks" key={cycle}>
      <ul className="ob-tasks__list">
        {TASKS.map((task, i) => (
          <motion.li
            key={task.key}
            className={`ob-tasks__row ob-tasks__row--${task.key}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.35, duration: 0.4, ease: GLIDE }}
          >
            <span className="ob-tasks__icon" aria-hidden="true"><task.Icon /></span>
            <span className="ob-tasks__body">
              {task.key === 'new' ? (
                <>
                  <motion.strong
                    initial={{ opacity: 1 }}
                    animate={{ opacity: [1, 1, 0] }}
                    transition={{ delay: 3.4, duration: 0.5, times: [0, 0.5, 1] }}
                    className="ob-tasks__swap"
                  >
                    {task.name} <span className="ob-tasks__count">{task.count}</span>
                  </motion.strong>
                  <motion.strong
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 3.9, duration: 0.4 }}
                    className="ob-tasks__swap ob-tasks__swap--after"
                  >
                    おかわり <span className="ob-tasks__count">10</span>
                  </motion.strong>
                  <span className="ob-tasks__text ob-tasks__text--stack">
                    <motion.span initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 3.6, duration: 0.3 }}>
                      {task.text}
                    </motion.span>
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.9, duration: 0.4 }}>
                      今日のぶんは完了。前倒しで進めたいときに
                    </motion.span>
                  </span>
                </>
              ) : (
                <>
                  <strong>{task.name} <span className="ob-tasks__count">{task.count}</span></strong>
                  <span className="ob-tasks__text">{task.text}</span>
                </>
              )}
            </span>
            {task.key === 'new' && (
              <motion.span
                className="ob-tasks__done"
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.1, 1, 1] }}
                transition={{ delay: 2.6, duration: 1.3, times: [0, 0.3, 0.8, 1] }}
              >
                <FaCheck />
              </motion.span>
            )}
          </motion.li>
        ))}
      </ul>
      <p className="ob-cap">新規単語を最後までやると、今日のタスクは完了です。毎日みるは、★を付けた語があるときだけ出ます。</p>
    </div>
  );
}

// ---- カード：道具 ----

const TOOLS = [
  { key: 'star', title: '★ 毎日みる', text: 'まだ覚えられない語に付けると、ホームの「毎日みる」から毎日出せる' },
  { key: 'play', title: '▶ 読み上げ', text: '英語と意味を順に読み上げて、次のカードへ進む。速さも選べる' },
  { key: 'dir', title: '英→和 ／ 和→英', text: '意味を見て英語を思い出す向きにもできる' },
];

function ToolsScene() {
  const cycle = useCycle(2600);
  const tool = TOOLS[cycle % TOOLS.length];
  const jaFirst = tool.key === 'dir';
  return (
    <div className="ob-tools">
      <div className="ob-tools__bar" aria-hidden="true">
        <span className={`ob-tools__btn${tool.key === 'star' ? ' is-hl is-on' : ''}`}><FaStar /></span>
        <span className={`ob-tools__btn${tool.key === 'play' ? ' is-hl is-on' : ''}`}><FaPlay /></span>
        <span className={`ob-tools__seg${tool.key === 'dir' ? ' is-hl' : ''}`}>
          <span className={jaFirst ? '' : 'is-on'}>英→和</span>
          <span className={jaFirst ? 'is-on' : ''}>和→英</span>
        </span>
      </div>
      <div className="ob-tools__card">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={jaFirst ? 'ja' : 'en'}
            className={jaFirst ? 'ob-tools__word ob-tools__word--ja' : 'ob-tools__word'}
            initial={{ rotateY: 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: -90, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {jaFirst ? '～の後に続く' : 'follow'}
          </motion.span>
        </AnimatePresence>
        {tool.key === 'play' && (
          <motion.span
            className="ob-tools__voice"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            「follow」…「～の後に続く」
          </motion.span>
        )}
      </div>
      <motion.p key={tool.key} className="ob-dest__say" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <strong>{tool.title}</strong>
        {tool.text}
      </motion.p>
    </div>
  );
}

// ---- ホーム：ランクと単語力チェックテスト ----

const RANK_SHOWN = 2; // 例として C まで上がる

function RankScene() {
  const cycle = useCycle(7000);
  return (
    <div className="ob-rank" key={cycle}>
      <ol className="ob-rank__ladder" aria-label="ランクは全7段階">
        {RANKS.ranks.map((rank, i) => (
          <motion.li
            key={rank.id}
            className="ob-rank__step"
            style={{ '--rank-color': rank.color }}
            initial={{ scale: 1 }}
            animate={i === RANK_SHOWN ? { scale: [1, 1, 1.25, 1.15] } : { scale: 1 }}
            transition={{ delay: 2.4, duration: 0.6, times: [0, 0.2, 0.7, 1] }}
          >
            <motion.span
              className="ob-rank__badge"
              initial={{ opacity: 0.35 }}
              animate={{ opacity: i <= RANK_SHOWN ? 1 : 0.35 }}
              transition={{ delay: 1.2 + i * 0.4, duration: 0.3 }}
            >
              {rank.id}
            </motion.span>
          </motion.li>
        ))}
      </ol>
      <div className="ob-rank__test" aria-hidden="true">
        <span className="ob-rank__side ob-rank__side--no">← わからない</span>
        <motion.span
          className="ob-rank__card"
          animate={{ x: [0, 0, 26, 0, 0, -26, 0], rotate: [0, 0, 6, 0, 0, -6, 0], backgroundColor: ['#FFFFFF', '#FFFFFF', '#d9f99d', '#FFFFFF', '#FFFFFF', '#fecaca', '#FFFFFF'] }}
          transition={{ duration: 3.2, delay: 3.2, times: [0, 0.1, 0.3, 0.45, 0.55, 0.75, 0.9] }}
        >
          improve
        </motion.span>
        <span className="ob-rank__side ob-rank__side--yes">わかる →</span>
      </div>
      <p className="ob-cap">
        ホームの「現在のランク」から単語力チェックテストを受けると、いまの力が E〜SS の7段階
        （それぞれ初級・中級・上級）で分かり、新しい単語もその力に合わせて出ます。
        わからない語は長押しで答えをのぞけます。しばらく受けていないと、もう一度受けるよう声をかけます。
      </p>
    </div>
  );
}

// ---- ホーム：先生・受験サポートから届くもの ----

function DeliveryScene() {
  const cycle = useCycle(7500);
  return (
    <div className="ob-deliver" key={cycle}>
      <motion.div
        className="ob-deliver__card ob-deliver__card--quiz"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5, ease: GLIDE }}
      >
        <strong>先生からの小テスト</strong>
        <span>10問・英語→日本語</span>
        <span className="ob-deliver__btn">解く</span>
      </motion.div>
      <motion.div
        className="ob-deliver__card ob-deliver__card--exam"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.5, ease: GLIDE }}
      >
        <strong>受験サポートのテスト範囲</strong>
        <span>30語・合格するまでここに出る</span>
        <span className="ob-deliver__btn">練習する</span>
      </motion.div>
      <div className="ob-deliver__review">
        {['arrive', 'borrow'].map((word, i) => (
          <motion.span
            key={word}
            className="ob-deliver__chip"
            initial={{ opacity: 0, y: -70 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-70, -60, 0, 0] }}
            transition={{ delay: 2.4 + i * 0.4, duration: 1.2, times: [0, 0.15, 0.75, 1] }}
          >
            {word}
          </motion.span>
        ))}
        <span className="ob-deliver__box">
          <FaRedo aria-hidden="true" /> 復習単語{' '}
          <LaterNumber from={12} to={14} afterMs={3400} />
        </span>
      </div>
      <p className="ob-cap">届いたときだけ、ホームのいちばん上に出ます。まちがえた単語は、自動で復習に入ります。</p>
    </div>
  );
}

/** afterMs たったら数を差し替える（まちがえた単語が復習に入ったところ） */
function LaterNumber({ from, to, afterMs }) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    const id = setTimeout(() => setValue(to), afterMs);
    return () => clearTimeout(id);
  }, [to, afterMs]);
  return (
    <motion.span key={value} initial={{ scale: value === to ? 1.4 : 1 }} animate={{ scale: 1 }}>
      {value}
    </motion.span>
  );
}

// ---- えらぶ ----

const CHOICES = [
  { key: 'book', title: '教材', text: '塾の単語帳を番号の範囲で。前回の続きから' },
  { key: 'school', title: '学校の教科書', text: '学年とページを選ぶ' },
  { key: 'level', title: '中学英語・高校英語', text: 'レベル別・品詞別に', badge: true },
  { key: 'eiken', title: '英検', text: '級ごとの単語と、二次試験（面接）の練習' },
];

function ChooseScene() {
  const cycle = useCycle(6500);
  return (
    <div className="ob-choose" key={cycle}>
      <ul className="ob-choose__list">
        {CHOICES.map((c, i) => (
          <motion.li
            key={c.key}
            className="ob-choose__row"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.3, duration: 0.4, ease: GLIDE }}
          >
            <span className="ob-choose__text">
              <strong>{c.title}</strong>
              <span>{c.text}</span>
            </span>
            {c.badge && (
              <motion.span
                className="ob-choose__badge"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 2.2, duration: 0.4, ease: GLIDE }}
              >
                おすすめ
              </motion.span>
            )}
          </motion.li>
        ))}
      </ul>
      <p className="ob-cap">今日のタスクとは別に進められます。「おすすめ」は、いまの力に合うレベルです。</p>
    </div>
  );
}

// ---- 長文 ----

const READ_MODES = ['英語', 'スラッシュ', '和訳'];

function ReadingScene() {
  const cycle = useCycle(2200);
  const step = cycle % 4; // 0..2 = 表示の切り替え、3 = 長押し
  const mode = READ_MODES[Math.min(step, 2)];
  return (
    <div className="ob-reading">
      <div className="ob-reading__modes" aria-hidden="true">
        {READ_MODES.map((m) => (
          <span key={m} className={m === mode ? 'is-on' : ''}>{m}</span>
        ))}
      </div>
      <div className="ob-reading__text">
        {mode === '和訳' ? (
          <motion.p key="ja" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>私は友だちのあとについて駅へ行った。</motion.p>
        ) : (
          <motion.p key={mode} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>
            I{' '}
            <span className={step === 3 ? 'ob-reading__hit' : ''}>followed</span>
            {mode === 'スラッシュ' ? ' my friend / to the station.' : ' my friend to the station.'}
          </motion.p>
        )}
        {step === 3 && (
          <motion.span
            className="ob-reading__toast"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <FaStar aria-hidden="true" /> 長押しで「毎日みる」に入れた
          </motion.span>
        )}
      </div>
      <p className="ob-cap">英語・スラッシュ・和訳を切り替えて読めます。知らない単語は長押しで「毎日みる」へ。音読すると、読めた割合が出ます。</p>
    </div>
  );
}

// ---- きろく ----

const RETENTION_SAMPLE = [38, 27, 22, 13];

function RecordScene() {
  const cycle = useCycle(6500);
  return (
    <div className="ob-record" key={cycle}>
      <p className="ob-record__title">定着の内訳</p>
      <div className="ob-record__bar" aria-hidden="true">
        {RETENTION_BUCKETS.map((b, i) => (
          <motion.span
            key={b.id}
            style={{ backgroundColor: b.color }}
            initial={{ width: 0 }}
            animate={{ width: `${RETENTION_SAMPLE[i]}%` }}
            transition={{ delay: 0.4 + i * 0.5, duration: 0.6, ease: GLIDE }}
          />
        ))}
      </div>
      <ul className="ob-record__legend">
        {RETENTION_BUCKETS.map((b, i) => (
          <motion.li
            key={b.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 + i * 0.5, duration: 0.3 }}
          >
            <span className="ob-record__dot" style={{ backgroundColor: b.color }} aria-hidden="true" />
            <strong>{b.label}</strong>
            <span>{b.description}</span>
          </motion.li>
        ))}
      </ul>
      <p className="ob-cap">覚えた語が「覚えかけ → なじんできた → 定着 → 卒業」と進む様子と、正答率やランクの移り変わりが見られます。</p>
    </div>
  );
}

// ---- はじめる ----

function ReadyScene() {
  const lines = [
    { key: 'plan', text: '毎日、ホームの「今日のタスク」から始める' },
    { key: 'good', text: 'わかった語は、間をあけてまた出る' },
    { key: 'again', text: 'もう一度の語は、今日のうちにまた出る' },
  ];
  return (
    <ol className="ob-ready">
      {lines.map((line, i) => (
        <motion.li
          key={line.key}
          className={`ob-ready__item ob-ready__item--${line.key}`}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 + i * 0.15, duration: 0.4, ease: GLIDE }}
        >
          <span className="ob-ready__num">{i + 1}</span>
          {line.text}
        </motion.li>
      ))}
    </ol>
  );
}


// ---- ページの並び ----
// where … そのページが、アプリのどこの話か（左上の札）。タブの名前とアイコンは下のナビと同じものを使う

const tab = (id) => {
  const t = STUDENT_TABS.find((item) => item.id === id);
  return { label: t.label, Icon: t.Icon };
};
const HOW = { label: 'しくみ', Icon: FaLightbulb };
const CARD = { label: 'カード', Icon: FaClone };

export const STEPS = [
  { id: 'plan', where: HOW, Scene: PlanScene, title: '今日のぶんは自動で決まる', body: '目標と達成日から逆算して、毎日計算し直します。目標はホームの「目標」でいつでも変えられます。' },
  { id: 'tasks', where: tab('home'), Scene: TasksScene, title: '毎日「今日のタスク」から始める', body: 'ホームに、今日やる単語が3種類並びます。' },
  { id: 'curve', where: HOW, Scene: CurveScene, title: '忘れる前に、もう一度出る', body: '覚えたかどうかで、次に出る日が変わります。' },
  { id: 'dest', where: CARD, Scene: DestScene, title: 'カードの行き先は3つ', body: 'タップか長押しで答えを見たら、どれか1つを選びます。' },
  { id: 'tools', where: CARD, Scene: ToolsScene, title: 'カードの上の道具', body: '覚えにくい語に印を付けたり、聞いて覚えたりできます。' },
  { id: 'wordbook', where: CARD, Scene: WordbookScene, title: '単語帳なら、まとめて見わたせる', body: 'カードを1枚ずつめくらず、一覧でどんどん確かめられます。' },
  { id: 'rank', where: tab('home'), Scene: RankScene, title: 'ランクで、いまの力が分かる', body: '最初に単語力チェックテストを受けておくと、ちょうどいい単語から始められます。' },
  { id: 'deliver', where: tab('home'), Scene: DeliveryScene, title: '先生や受験サポートからも届く', body: '小テストやテスト範囲の練習が、ホームに出ることがあります。' },
  { id: 'choose', where: tab('free-study'), Scene: ChooseScene, title: '好きな範囲を選んで進める', body: '下の「えらぶ」から。' },
  { id: 'reading', where: tab('story'), Scene: ReadingScene, title: '読んで、聞いて、音読する', body: '下の「長文」から。いまの力に合う読みものが並びます。' },
  { id: 'record', where: tab('analytics'), Scene: RecordScene, title: '伸びたところが見える', body: '下の「きろく」から。' },
  { id: 'ready', where: HOW, Scene: ReadyScene, title: '準備ができたら、はじめよう', body: '指の動かし方は、カードを開いたときにその場で見せます。' },
];
