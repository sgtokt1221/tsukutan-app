import React from 'react';
import { FaBook, FaBookOpen, FaChevronRight, FaGraduationCap, FaMicrophone, FaPen, FaSchool, FaStar } from 'react-icons/fa';
import RecommendationBadge from './RecommendationBadge';
import { rangesOf } from '../../logic/bookWords';
import { SUNSHINE } from '../../logic/textbookPages';
import TextbookPagePicker from './TextbookPagePicker';
import './FreeStudyMenu.css';

/**
 * 自由学習の入口。
 *
 * 以前は「学年で選ぶ」「英検で選ぶ」「二次試験（面接）」の見出しの下に
 * ボタンが12個並んでいて、何を選ぶ画面なのか分からなかった。
 * 中学英語 / 高校英語 / 英検 の3枚に畳んで、英検だけ下へ辿る。
 *
 *   main            [教材] [中学英語] [高校英語] [英検]
 *    ├ books     塾が配っている単語帳4冊（表紙つき）
 *    │    └ book-range  番号の帯（1〜100 …）→ onSelectRange → そのままカードへ
 *    ├ textbook-grade  学校の教科書（Sunshine）の学年
 *    │    └ textbook-pages  ページの範囲 → onStartTextbookPages → そのままカードへ
 *    ├ 中学英語  → onSelectTextbook（レベル・品詞・意味の絞り込みへ）
 *    ├ 高校英語  → onSelectTextbook
 *    └ eiken     [単語を覚える] [二次試験（面接）]
 *         ├ eiken-words     → 級を選ぶ → onSelectTextbook
 *         ├ eiken-interview → 級を選ぶ → onSelectInterview
 *         └ eiken-writing → 級を選ぶ → onSelectWriting（2026-09-26）
 *
 * **教材だけ絞り込み画面（filter）を通さない。** 単語帳はレベルでも品詞でもなく
 * **通し番号**で進めるものなので、番号の帯から直接カードへ行く。
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
  'eiken-writing': 'eiken',
  books: 'main',
  'book-range': 'books',
  'textbook-grade': 'main',
  'textbook-pages': 'textbook-grade',
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

/**
 * @param thumbnail 表紙の画像URL。**あればアイコンの代わりに出す**
 *   （本は絵で覚えているので、題名より先に表紙で見つかる）
 */
function MenuCard({ Icon, title, description, badge, thumbnail, onClick }) {
  return (
    <button type="button" className="free-study-card" onClick={onClick}>
      <span className={thumbnail ? 'free-study-card__cover' : 'free-study-card__icon'}>
        {thumbnail
          ? (
            /*
              **読めなくても崩さない。** 表紙はつくばホームから読むので、
              電波が悪いと出ないことがある。alt を空にして枠だけ残す
              （題名は隣に出ているので、読み上げが二重にならない）。
            */
            <img src={thumbnail} alt="" loading="lazy" draggable="false" />
          )
          : <Icon aria-hidden="true" />}
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
  books,
  selectedBook,
  wordCountOf,
  recommendationOf,
  onSelectTextbook,
  onSelectInterview,
  onSelectWriting,
  onSelectBook,
  onSelectRange,
  // 学校の教科書。cards は読み込み前 null、読めなければ textbookError
  textbookCards = null,
  textbookError = '',
  textbookGrade = null,
  onSelectTextbookGrade,
  onStartTextbookPages,
}) {
  if (mode === 'textbook-grade' || mode === 'textbook-pages') {
    if (textbookError) return <p className="tile-caption" role="alert">{textbookError}</p>;
    if (!textbookCards) return <p className="tile-caption">教科書の単語を読み込んでいます…</p>;
    if (mode === 'textbook-pages') {
      return <TextbookPagePicker cards={textbookCards} grade={textbookGrade} onStart={onStartTextbookPages} />;
    }
    return (
      <div className="list-group">
        {SUNSHINE.grades.map((grade) => (
          <button key={grade} type="button" className="tile-button" onClick={() => onSelectTextbookGrade(grade)}>
            <span className="tile-button__label">{grade}年</span>
            <span className="tile-button__count">
              {textbookCards.filter((c) => c.grade === grade).length.toLocaleString()}語
            </span>
          </button>
        ))}
      </div>
    );
  }

  // 教材の一覧。**表紙で選べるようにする**（題名より先に絵で見つかる）
  if (mode === 'books') {
    return (
      <div className="free-study-cards">
        {(books || []).map((book) => (
          <MenuCard
            key={book.id}
            Icon={FaBook}
            thumbnail={book.cover}
            title={book.title}
            description={`${book.publisher}・${book.count.toLocaleString()}語`}
            onClick={() => onSelectBook(book)}
          />
        ))}
      </div>
    );
  }

  // 番号の帯。**本を開いて「今日は301〜400」と進むのと同じ区切り**
  if (mode === 'book-range') {
    if (!selectedBook) return null;
    return (
      <div className="list-group">
        {rangesOf(selectedBook.count).map((range) => (
          <button
            key={range.label}
            type="button"
            className="tile-button"
            onClick={() => onSelectRange(selectedBook, range)}
          >
            <span className="tile-button__label">{range.label}</span>
            <span className="tile-button__count">{range.count}語</span>
          </button>
        ))}
      </div>
    );
  }

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
        <MenuCard
          Icon={FaPen}
          title="ライティング"
          description="本番と同じ形式。カンペを見ながら書いて採点"
          onClick={() => onNavigate('eiken-writing')}
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

  if (mode === 'eiken-writing') {
    return (
      <div className="list-group">
        {interviewGrades.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="tile-button"
            onClick={() => onSelectWriting(id)}
          >
            <span className="tile-button__label">{label}</span>
            <span className="tile-button__count">{id === '3' || id === 'pre2' ? 'Eメール・意見' : '要約・意見'}</span>
          </button>
        ))}
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
      {/*
        **教材を一番上に置く**（2026-09-22 の指定）。塾が実際に配っている本なので、
        生徒はまずここを探す。
      */}
      <MenuCard
        Icon={FaBookOpen}
        title="教材"
        description="塾で使っている単語帳から選ぶ"
        onClick={() => onNavigate('books')}
      />
      {/* 学校の教科書。ページを指定して覚える（2026-09-24） */}
      <MenuCard
        Icon={FaSchool}
        title="学校の教科書"
        description={`${SUNSHINE.title}・ページを選んで覚える`}
        onClick={() => onNavigate('textbook-grade')}
      />
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
