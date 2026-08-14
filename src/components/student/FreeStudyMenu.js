import React from 'react';
import { FaBook, FaChevronRight, FaGraduationCap, FaMicrophone, FaStar } from 'react-icons/fa';
import RecommendationBadge from './RecommendationBadge';
import './FreeStudyMenu.css';

/**
 * 自由学習の入口。
 *
 * 以前は「学年で選ぶ」「英検で選ぶ」「二次試験（面接）」の見出しの下に
 * ボタンが12個並んでいて、何を選ぶ画面なのか分からなかった。
 * 中学英語 / 高校英語 / 英検 の3枚に畳んで、英検だけ下へ辿る。
 *
 *   main            [中学英語] [高校英語] [英検]
 *    ├ 中学英語  → onSelectTextbook（レベル・品詞・意味の絞り込みへ）
 *    ├ 高校英語  → onSelectTextbook
 *    └ eiken     [単語を覚える] [二次試験（面接）]
 *         ├ eiken-words     → 級を選ぶ → onSelectTextbook
 *         └ eiken-interview → 級を選ぶ → onSelectInterview
 *
 * どの段にいるかは親（StudentDashboard）が持つ。ここで持つと、絞り込み画面へ
 * 進んだときにこの部品が外れて、戻ったとき必ず main に落ちてしまう。
 */

/**
 * 一段だけ戻る先。
 *
 * 絞り込み画面（filter）から戻る先は、その教材をどこから選んだかで変わる。
 * 英検の級は級一覧へ戻す。常に main にすると、5級を見たあと4級を見るのに
 * 毎回3カードから辿り直すことになる。どこから来たかは教材IDから分かるので、
 * 状態は増やさない。
 */
export const freeStudyBackTarget = (mode, textbookId) => ({
  eiken: 'main',
  'eiken-words': 'eiken',
  'eiken-interview': 'eiken',
  filter: textbookId?.startsWith('eiken-') ? 'eiken-words' : 'main',
}[mode] || 'main');

/** 英検以外の入口。押すとそのまま絞り込み画面へ入る。 */
const TEXTBOOK_ENTRIES = [
  { id: 'osaka-koukou-nyuushi', title: '中学英語', description: '大阪府公立入試', Icon: FaGraduationCap },
  { id: 'highschool-english', title: '高校英語', description: '基礎・標準・応用', Icon: FaBook },
];

/** 一覧に出す語数。まだ読めていない（null）ときは何も足さない。 */
const withCount = (description, count) =>
  count === null ? description : `${description}・${count.toLocaleString()}語`;

function MenuCard({ Icon, title, description, badge, onClick }) {
  return (
    <button type="button" className="free-study-card" onClick={onClick}>
      <span className="free-study-card__icon">
        <Icon aria-hidden="true" />
      </span>
      <span className="free-study-card__body">
        <span className="free-study-card__title">
          {title}
          {badge && <RecommendationBadge type="textbook" priority={badge} />}
        </span>
        {description && <span className="free-study-card__sub">{description}</span>}
      </span>
      <span className="free-study-card__chevron">
        <FaChevronRight aria-hidden="true" />
      </span>
    </button>
  );
}

export default function FreeStudyMenu({
  mode,
  onNavigate,
  eikenOptions,
  interviewGrades,
  wordCountOf,
  recommendationOf,
  onSelectTextbook,
  onSelectInterview,
}) {
  if (mode === 'eiken') {
    return (
      <div className="free-study-cards">
        <MenuCard
          Icon={FaBook}
          title="単語を覚える"
          description="5級 〜 準1級"
          onClick={() => onNavigate('eiken-words')}
        />
        <MenuCard
          Icon={FaMicrophone}
          title="二次試験（面接）"
          description="入室から退室までを通しで練習します"
          onClick={() => onNavigate('eiken-interview')}
        />
      </div>
    );
  }

  if (mode === 'eiken-words') {
    // 収録が0語の級は出さない。選んでも何も学べない。
    // 単語データの読み込み前は判定できないので出したままにする。
    const options = eikenOptions.filter((option) => wordCountOf(option.id) !== 0);

    return (
      <div className="list-group">
        {options.map(({ id, label }) => {
          const count = wordCountOf(id);
          const badge = recommendationOf(id);

          return (
            <button
              key={id}
              type="button"
              className="tile-button"
              onClick={() => onSelectTextbook(id)}
            >
              <span className="tile-button__label">
                {label}
                {badge && <RecommendationBadge type="textbook" priority={badge} />}
              </span>
              {count !== null && (
                <span className="tile-button__count">{count.toLocaleString()}語</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (mode === 'eiken-interview') {
    return (
      <div className="list-group">
        {interviewGrades.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="tile-button"
            onClick={() => onSelectInterview(id)}
          >
            <span className="tile-button__label">{label}</span>
            {/* 単語ではないので語数は出さない */}
            <span className="tile-button__count">5問</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="free-study-cards">
      {TEXTBOOK_ENTRIES.map(({ id, title, description, Icon }) => (
        <MenuCard
          key={id}
          Icon={Icon}
          title={title}
          description={withCount(description, wordCountOf(id))}
          badge={recommendationOf(id)}
          onClick={() => onSelectTextbook(id)}
        />
      ))}
      <MenuCard
        Icon={FaStar}
        title="英検"
        description="単語と、二次試験（面接）"
        // どれか1級でも今の力に合っていれば付ける。中を開かないと分からないため。
        badge={eikenOptions.map((option) => recommendationOf(option.id)).find(Boolean) || null}
        onClick={() => onNavigate('eiken')}
      />
    </div>
  );
}
