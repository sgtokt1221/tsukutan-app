/**
 * 日々の「新しい単語」をどの教材から出すか。**生徒が目標設定画面で選ぶ。**
 *
 * 保存先は `users/{uid}.goal.newWordTextbook`（教材ID。おまかせは null）。
 * おまかせのときは今までどおり、目標に紐づく教材（大阪の入試・高校英語）から出す
 * （learningPlanner.js の getNewWords）。
 *
 * ## 教材IDは管理画面の定着度と同じ
 * つくばホームの管理画面が見ている `functions/index.js` の `MASTERY_TEXTBOOKS` と揃える。
 * 生徒が選んだ教材と、先生が見る定着度の教材が同じ名前で並ぶように。
 * 番人は newWordSources.test.js（向こうの一覧に無いIDを足すと赤くなる）。
 *
 * ## 英検の級は「いちばんやさしい級1つ」
 * 3級・4級・5級に入っている語は5級にだけ入る（logic/eikenLevels.js）。
 * 定着度の数え方と同じにしないと、選んだ級の語数と管理画面の語数が食い違う。
 */

import { BOOKS } from '../config/books';
import { EIKEN_LABELS } from './readingLevel';
import { easiestEikenLevel, eikenTargetOf } from './eikenLevels';
import { loadSunshineCards } from './textbookPages';
import { loadTextbookWords, loadWordMaster } from './wordMaster';

const SUNSHINE_SOURCES = [1, 2, 3].map((grade) => ({
  id: `sunshine-${grade}`,
  title: `Sunshine ${grade}年（学校の教科書）`,
  stages: ['middle'],
  load: async () => (await loadSunshineCards()).filter((word) => word.grade === grade),
}));

/*
  単語帳は**綴りでも学習済みを見る**（matchBySpelling）。本だけの語は id が本ごとに別で、
  訳も本のものなのでマスタの語と 語＋品詞＋意味 でも一致しない。マスタで覚えた
  `increase` が、本の `increase` として「新しい単語」に出直してしまう。
  本は1つの綴りに1枚なので、綴りで外しても取りこぼす意味は無い。
  英検（マスタ）には同じ綴りで意味違いの札が別々にあるので、綴りでは見ない。
*/
const BOOK_SOURCES = BOOKS.map((book) => ({
  id: book.id,
  title: book.title,
  stages: ['high'],
  matchBySpelling: true,
  load: () => loadTextbookWords(book.id),
}));

/** 英検は中学生にも高校生にも出す。1級は語に印が無いので出さない */
const EIKEN_SOURCES = ['5', '4', '3', 'pre2', '2', 'pre1'].map((eiken) => ({
  id: `eiken-${eiken}`,
  title: EIKEN_LABELS[eiken],
  stages: ['middle', 'high'],
  load: async () => {
    const target = eikenTargetOf(`eiken-${eiken}`);
    return (await loadWordMaster()).filter((word) => easiestEikenLevel(word) === target);
  },
}));

/** 選べる教材。**この並びで画面に出す**（学校の教科書 → 単語帳 → 英検） */
export const NEW_WORD_SOURCES = [...SUNSHINE_SOURCES, ...BOOK_SOURCES, ...EIKEN_SOURCES];

export const getNewWordSource = (id) => NEW_WORD_SOURCES.find((source) => source.id === id) || null;

/**
 * 学年（`users/{uid}.grade`）から 小・中・高 を決める。分からなければ null。
 *
 * 表記は2通りある: つくばホームから入った生徒は `中学1年生` / `高校3年生` / `小６` / `年長`、
 * つくつくで作った古いアカウントは `中1` / `高2`。どちらも頭の1文字で決まる。
 */
export const schoolStageOf = (grade) => {
  const text = String(grade ?? '').trim();
  if (text.startsWith('中')) return 'middle';
  if (text.startsWith('高')) return 'high';
  if (text.startsWith('小') || text.startsWith('年')) return 'elementary';
  return null;
};

/** その学年に出す教材。**小学生と学年不明は全部**（絞る根拠が無い） */
export const sourcesForGrade = (grade) => {
  const stage = schoolStageOf(grade);
  if (stage !== 'middle' && stage !== 'high') return NEW_WORD_SOURCES;
  return NEW_WORD_SOURCES.filter((source) => source.stages.includes(stage));
};

/**
 * 語の難しさ（1〜7）。**選ぶ順番にだけ使う。語そのものに level を書き足さない。**
 *
 * 単語帳・教科書には level の無い語がある（ターゲット1900で422語、シス単649語、
 * LEAP570語、英熟語457語、Sunshine87語）。マスタと綴りが1件だけ一致した語にしか
 * level を借りていないため（scripts/build-book-words.js）。
 * そこに level を付けて reviewWords へ保存すると、到達語数とレベルの見積もりの
 * 分子だけが増える（同スクリプトの注記）ので、書かずに順番だけ決める。
 *
 * 見積もりは**本の並びで近い、level のある語10個の中央値**。単語帳も教科書もおおむね
 * やさしい順に並んでいるので、近くの語と同じくらいの難しさとみなす。
 * level のある語で当てはめると、±1 に収まるのが 86〜90%（ちょうど一致だけなら3〜6割）。
 *
 * @param {Array} words 教材の並びのまま
 * @returns {Map<string, number>} id → level。1語も level が無い教材では空
 */
export const estimateLevels = (words = [], neighbors = 10) => {
  const levels = new Map();
  const levelAt = (index) => (Number.isFinite(words[index]?.level) ? words[index].level : null);
  if (!words.some((_, index) => levelAt(index) != null)) return levels;

  words.forEach((word, index) => {
    if (!word?.id || levels.has(word.id)) return;
    if (levelAt(index) != null) {
      levels.set(word.id, word.level);
      return;
    }
    // 前後へ1つずつ広げて、level のある語を近い順に集める
    const nearest = [];
    for (let d = 1; nearest.length < neighbors && (index - d >= 0 || index + d < words.length); d += 1) {
      for (const j of [index - d, index + d]) {
        const level = levelAt(j);
        if (level != null && nearest.length < neighbors) nearest.push(level);
      }
    }
    nearest.sort((a, b) => a - b);
    levels.set(word.id, nearest[Math.floor(nearest.length / 2)]);
  });
  return levels;
};

/** 生徒のレベル帯 [level, level+1] からどれだけ離れているか。帯の中は0 */
const distanceFromBand = (level, userLevel) => {
  if (!Number.isFinite(level)) return Number.POSITIVE_INFINITY;
  if (level < userLevel) return userLevel - level;
  if (level > userLevel + 1) return level - (userLevel + 1);
  return 0;
};

const shuffled = (items, random) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * 選んだ教材の未学習語を、生徒のレベルに合う順に並べる。
 *
 * - まず [level, level+1] の語を混ぜて出す（おまかせと同じ）
 * - **足りなければ近いレベルへ広げて埋める。** 帯の語が尽きたら0語、にしない
 * - 帯から同じだけ離れた語（level-1 と level+2 など）は混ぜる
 *
 * @param {Array} candidates 未学習の語（unlearnedCandidates を通したもの）
 * @param {Map<string, number>} levels estimateLevels の結果
 * @param {number} userLevel 生徒のレベル（1〜7）
 * @param {() => number} random テスト用に差し替えられるように
 */
export const orderByLevelFit = (candidates, levels, userLevel, random = Math.random) => {
  const withDistance = shuffled(candidates, random).map((word) => ({
    word,
    distance: distanceFromBand(levels.get(word.id), userLevel),
  }));
  // sort は安定なので、同じ距離の中では混ぜた順が残る
  withDistance.sort((a, b) => a.distance - b.distance);
  return withDistance.map((entry) => entry.word);
};

const spellingOf = (word) => String(word?.word || '').trim().toLowerCase();

/** 学習済みと同じ綴りの語を外す（単語帳だけ。BOOK_SOURCES の注記） */
export const withoutLearnedSpellings = (words, learnedEntries = []) => {
  const learned = new Set(learnedEntries.map(spellingOf).filter(Boolean));
  return words.filter((word) => !learned.has(spellingOf(word)));
};
