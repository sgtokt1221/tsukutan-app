import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from './firebaseConfig';
import './Analytics.css';
import { collection, getDocs, doc, getDoc, setDoc, query, orderBy, updateDoc, where } from "firebase/firestore";
import { generateDailyPlan } from './logic/learningPlanner';
import { updateProgressPercentage } from './logic/progressLogic';
import { logStudySession } from './logic/studyLogger';
import { saveFreeStudyProgress, getFreeStudyProgress, getAllFreeStudyProgress, levelProgressKey } from './logic/freeStudyProgress';
import VocabularyCheckTest from './VocabularyCheckTest';
import TestResult from './TestResult';
// 新規も復習も同じ単語カード。違いは learningMode（→ logic/studyMode.js）
import StudyFlashcard from './StudyFlashcard';
import { buildThemeGroups, themeLabels, themeDescriptions } from './logic/themeMatcher';
import AnalyticsPanel from './components/student/AnalyticsPanel';
import StoryPanel from './components/student/StoryPanel';
import { useBookmarks } from './logic/useBookmarks';
import { markNewWordAnswered } from './logic/dailyPlanRepository';
import RankCard from './components/assessment/RankCard';
import LevelNudge from './components/assessment/LevelNudge';
import ReadingPanel from './components/reading/ReadingPanel';
import { isAheadOfAssessment } from './logic/estimatedLevel';
import { setStudyRank, noteDeck } from './logic/studySession';
import { BOOKS, isBookId, getBook, bookWordsUrl } from './config/books';
import { wordsInRange, rangeKeyOf } from './logic/bookWords';
import {
  loadSunshineCards, sunshineTextbookId, isSunshineTextbookId, gradeOfSunshineId, wordsInPages, pageRangeKey, pageLabel,
} from './logic/textbookPages';
import { loadPendingQuizzes } from './logic/assignedQuiz';
import AssignedQuiz from './components/quiz/AssignedQuiz';
import AssignedQuizCard from './components/quiz/AssignedQuizCard';
import ExamMissedNotice from './components/quiz/ExamMissedNotice';
import { syncExamSupportMissed, reviewEntryOf, cardsForRefs } from './logic/examSupportMissed';
import ExamPracticeCard from './components/quiz/ExamPracticeCard';
import Onboarding from './components/onboarding/Onboarding';
import DashboardSkeleton from './components/student/DashboardSkeleton';
import { useOnboarding } from './logic/useOnboarding';
import { FaBook, FaSyncAlt, FaMagic, FaStar, FaArrowLeft } from 'react-icons/fa';
import FreeStudyMenu, { freeStudyBackTarget } from './components/student/FreeStudyMenu';
import RecommendationBadge from './components/student/RecommendationBadge';
import { getTodayKey, getCurrentMonthKey, getTokyoDateKey, parseLocalDate } from './logic/dateKeys';
import { getRecommendedTextbooks, toGoalIds, getMotivationConfig, getGoal, LEVELS } from './config';
import { bestRankOf, rankForScore, abilityScoreOf } from './logic/rankLogic';
import { normalizeStory, isDisplayableStory } from './logic/storyView';
import { StudentHeader, StudentBottomNav } from './components/layout/StudentShell';
import { loadWordMaster, loadManifest, loadTextbookWords } from './logic/wordMaster';
import { INTERVIEW_GRADES } from './logic/interviewContent';
import logger from './logic/logger';
import { EIKEN_ORDER, easiestEikenLevel, eikenTargetOf } from './logic/eikenLevels';

// 面接モードは画像と素材を伴うので、開いたときだけ読む。
// 起動時の塊に入れると、使わない生徒の起動まで遅くなる。
const EikenInterview = React.lazy(() => import('./components/eiken/EikenInterview'));
const EikenWriting = React.lazy(() => import('./components/eiken/writing/EikenWriting'));

// 英検教材の単語数を計算する関数（実際の収録単語数）
// 英検の級の並び・語の級・教材IDからの級は logic/eikenLevels.js に移した（日々の新しい単語でも使う）
export { EIKEN_ORDER, easiestEikenLevel, eikenTargetOf };

/**
 * 英検教材に収録する語。その級以下（＝その級までにやさしい側）の語を集める。
 *
 * 級を表す数字は 5 → 1 と小さくなるほど難しい。以前はここを
 * `level <= target` で比べていて、3級の教材に 2級・1級の語が入り、
 * 5級・4級の語が落ちていた。並び順は EIKEN_ORDER に一本化する。
 */
export const eikenWordsUpTo = (textbookId, wordsData = []) => {
  const targetIndex = EIKEN_ORDER.indexOf(eikenTargetOf(textbookId));
  if (targetIndex < 0) return [];

  const allowed = new Set(EIKEN_ORDER.slice(0, targetIndex + 1));
  return wordsData.filter((word) => {
    const level = easiestEikenLevel(word);
    return level !== null && allowed.has(level);
  });
};

/**
 * 英検教材の収録語数。
 *
 * 綴りの重複は除去しない。同じ綴りでも意味が違えば別のカードとして
 * 出題されるので、学ぶ枚数はカードの数と一致させる。
 * （以前は一覧だけ綴りで重複除去していて、詳細ページと食い違っていた）
 */
const getEikenWordCount = (textbookId, wordsData = []) => eikenWordsUpTo(textbookId, wordsData).length;

const getTextbookWordCount = (textbookId, wordsData = [], textbookCounts = {}) => {
  logger.debug('📊 単語数計算開始:', { textbookId });
  
  // 英検教材の場合は実際の処理ロジックを再現
  if (textbookId.startsWith('eiken-')) {
    const count = getEikenWordCount(textbookId, wordsData);
    logger.debug('📊 英検教材単語数取得:', { textbookId, count });
    return count;
  }
  
  switch (textbookId) {
    case 'osaka-koukou-nyuushi':
    case 'highschool-english':
      // 固定値 1969 が書かれていたが、Firestore の収録分をマスターへ
      // 取り込んだあとは 3,193 語になり、表示だけ古いままだった。
      // 教材ごとの件数は manifest から取る。
      // 高校英語も「マスターのレベル5〜7」ではなく教材ファイルへの所属で数える
      // （2026-09-24 にレベルを付け直し、高校英語の語は1〜7に散った）。
      return textbookCounts[textbookId] ?? 0;
    
    
    default:
      return 0;
  }
};

// 推奨レベル計算関数
const getRecommendedLevels = (testLevel) => {
  if (!testLevel || testLevel === 0) return { recommended: [], current: null };
  
  const recommendations = [];
  
  // 現在のレベル
  recommendations.push({ level: testLevel, type: 'current', priority: 'high' });
  
  // 1つ上のレベル（チャレンジ）
  if (testLevel < 7) {
    recommendations.push({ level: testLevel + 1, type: 'challenge', priority: 'medium' });
  }
  
  // 1つ下のレベル（復習）
  if (testLevel > 1) {
    recommendations.push({ level: testLevel - 1, type: 'review', priority: 'low' });
  }
  
  logger.debug('🎯 推奨レベル計算:', {
    testLevel,
    recommendations: recommendations.map(r => ({ level: r.level, priority: r.priority }))
  });
  
  return {
    recommended: recommendations,
    current: testLevel
  };
};

// 教材の推奨レベルを判定する関数
const isRecommendedTextbook = (textbookId, testLevel, userData) => {
  if (!testLevel || testLevel === 0) return false;
  
  // 大阪府公立入試英単語の場合は高校受験目標がある場合のみ推奨
  if (textbookId === 'osaka-koukou-nyuushi') {
    const isHighSchoolTarget = isHighSchoolExamTarget(userData);
    if (!isHighSchoolTarget) {
      logger.debug('🎯 大阪府公立入試英単語: 高校受験目標なしのため非推奨');
      return false;
    }
  }
  
  // 教材レベルマッピング
  const textbookLevelMapping = {
    'osaka-koukou-nyuushi': { min: 1, max: 10 }, // 全レベル対応（高校受験目標がある場合のみ）
    'highschool-english': { min: 4, max: 7 }, // 高校レベル
    'eiken-5': { min: 1, max: 2 },
    'eiken-4': { min: 2, max: 3 },
    'eiken-3': { min: 3, max: 4 },
    'eiken-pre2': { min: 4, max: 5 },
    'eiken-2': { min: 5, max: 6 },
    'eiken-pre1': { min: 6, max: 7 }
  };
  
  const mapping = textbookLevelMapping[textbookId];
  if (!mapping) return false;
  
  return testLevel >= mapping.min && testLevel <= mapping.max;
};

// レベルカードの推奨判定関数
const isRecommendedLevel = (level, testLevel) => {
  if (!testLevel || testLevel === 0) return false;
  
  const recommendations = getRecommendedLevels(testLevel);
  const isRecommended = recommendations.recommended.some(rec => rec.level === level);
  
  // デバッグログ
  if (isRecommended) {
    logger.debug('🎯 レベル推奨判定:', {
      level,
      testLevel,
      recommendations: recommendations.recommended,
      isRecommended
    });
  }
  
  return isRecommended;
};

  // 大阪府公立入試教材を推奨すべき目標かどうか。
  // 旧IDの手書きリスト（hs1〜hs5）ではなく、共通定義の recommendedTextbooks を見る。
  const isHighSchoolExamTarget = (userData) => {
    if (!userData?.goal?.targets || !Array.isArray(userData.goal.targets)) {
      return false;
    }
    return getRecommendedTextbooks(toGoalIds(userData.goal.targets)).includes('osaka-koukou-nyuushi');
  };

// 既存の定数やヘルパー関数（すべて維持）
const freeStudyOptions = [
  { id: 'osaka-koukou-nyuushi', group: 'school', label: '中学英語（大阪府公立入試）', textbooks: ['osaka-koukou-nyuushi'], levels: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'highschool-english', group: 'school', label: '高校英語', textbooks: ['highschool-english'], levels: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'eiken-5', group: 'eiken', label: '英検5級', textbooks: ['highschool-english'] },
  { id: 'eiken-4', group: 'eiken', label: '英検4級', textbooks: ['highschool-english'] },
  { id: 'eiken-3', group: 'eiken', label: '英検3級', textbooks: ['highschool-english'] },
  { id: 'eiken-pre2', group: 'eiken', label: '英検準2級', textbooks: ['highschool-english'] },
  { id: 'eiken-2', group: 'eiken', label: '英検2級', textbooks: ['highschool-english'] },
  { id: 'eiken-pre1', group: 'eiken', label: '英検準1級', textbooks: ['highschool-english'] },
  /*
    塾が配っている市販の単語帳。**定義の正本は `src/config/books.js`**
    （表紙・収録語数・単語ファイルの場所まで持っている）。ここに並べるのは、
    タイトル表示（`freeStudyTitle` / `handleSaveLog`）が
    `freeStudyOptions` を引くため。**中身を二重に書かない。**
  */
  ...BOOKS.map((book) => ({ id: book.id, group: 'book', label: book.title }))
  // 英検1級は置かない。実データに eikenLevels: 1 の単語が1語も無く、
  // 常に「0語」のカードになる（src/config/levels.json も準1級まで）。
];
// 通常のレベル定義（実際のデータに基づいて調整）
// レベルの対応表は src/config/levels.json が正本。ここでは表示形に変換するだけ。
const toDescriptionMap = (format) =>
  Object.fromEntries(LEVELS.map((entry) => [entry.level, format(entry)]));

const levelDescriptions = toDescriptionMap((entry) => ({
  label: entry.label,
  equivalent: `${entry.eiken} / ${entry.cefr}`,
  wordsRequired: entry.wordsRequired,
}));

/*
  高校英語のカード。教材ファイルの語はレベル1〜7に散っているが（2026-09-24 に付け直した）、
  1・2は数十語しかないので、1〜3を「中学の復習」1枚にまとめて見せる。
  カードの鍵は 3（続きの鍵も r2-3）。
*/
const highschoolLevelDescriptions = {
  3: { label: '中学の復習', equivalent: '英検5級〜3級 / Pre-A1〜A2' },
  ...Object.fromEntries([4, 5, 6, 7].map((level) => [level, levelDescriptions[level]])),
};
const inHighschoolCard = (word, card) =>
  (Number(card) === 3 ? word.level <= 3 : word.level === Number(card));

// 英検教材用のレベル定義
// 英検教材の表示。以前はここだけ「レベル7 = 英検1級」としていたが、
// 実データに英検1級の単語は1語も無く、正しくは準1級。
const eikenLevelDescriptions = toDescriptionMap((entry) => ({
  label: `${entry.eiken}レベル`,
  equivalent: entry.schoolYear,
  wordsRequired: entry.wordsRequired,
}));

// 大阪府公立入試英単語専用のレベル定義
const osakaLevelDescriptions = levelDescriptions;
const posMap = {
  '名詞': '名', '動詞': '動', '形容詞': '形', '副詞': '副', '代名詞': '代',
  '前置詞': '前', '接続詞': '接', '冠詞': '冠', '間投詞': '間', '熟語': '熟語',
  '助動詞': '助'
};
const posDisplayOrder = Object.keys(posMap);

// 品詞のラベルと説明
const posLabels = {
  '名詞': '名詞',
  '動詞': '動詞', 
  '形容詞': '形容詞',
  '副詞': '副詞',
  '代名詞': '代名詞',
  '前置詞': '前置詞',
  '接続詞': '接続詞',
  '冠詞': '冠詞',
  '間投詞': '間投詞',
  '熟語': '熟語',
  '助動詞': '助動詞'
};

const posDescriptions = {
  '名詞': '物や人を表す単語',
  '動詞': '動作や状態を表す単語',
  '形容詞': '名詞を修飾する単語',
  '副詞': '動詞や形容詞を修飾する単語',
  '代名詞': '名詞の代わりに使う単語',
  '前置詞': '名詞の前に置いて関係を表す単語',
  '接続詞': '文や語句をつなぐ単語',
  '冠詞': '名詞の前に置く単語',
  '間投詞': '感情や驚きを表す単語',
  '熟語': '複数の単語が組み合わさった表現',
  '助動詞': '動詞の前に置いて意味を補う単語'
};

// テーマのラベルと説明

export default function StudentDashboard() {
  // --- State宣言 ---
  const [allWords, setAllWords] = useState([]);
  const [loading, setLoading] = useState(true);
  // 描画時の auth.currentUser は復元が終わるまで null で、
  // 変わっても再描画されない。認証の通知で持つ。
  const [userId, setUserId] = useState(null);
  // 「毎日みる単語」。ホームの枚数表示と、開いたときの単語に使う。
  const { items: bookmarks, reload: reloadBookmarks } = useBookmarks(userId);
  const [dashboardError, setDashboardError] = useState(null);
  const [viewMode, setViewMode] = useState('select');
  const [selectionMode, setSelectionMode] = useState('main');
  // 面接モードを開いている級。null なら開いていない。
  const [interviewGrade, setInterviewGrade] = useState(null);
  // 英検ライティングの級（選んでいるあいだは画面を占有する。面接と同じ扱い）
  const [writingGrade, setWritingGrade] = useState(null);
  const [testResultLevel, setTestResultLevel] = useState(0);
  // テストで保存した推定語彙数（結果画面に出す）
  const [testResultVocabulary, setTestResultVocabulary] = useState(null);
  const [testResultAbility, setTestResultAbility] = useState(null);
  
  // デバッグログ: testResultLevelの値を監視
  useEffect(() => {
    logger.debug('🎯 testResultLevel更新:', testResultLevel);
  }, [testResultLevel]);
  const [learningWords, setLearningWords] = useState([]);
  const [filterTab, setFilterTab] = useState('level');
  const [selectedTextbookId, setSelectedTextbookId] = useState(null);
  const [testWords, setTestWords] = useState([]);
  const [currentSessionInfo, setCurrentSessionInfo] = useState(null);
  const [userData, setUserData] = useState(null);
  // 目標の名前。複数選んでいるときは「英検2級 合格 ほか1件」とまとめる。
  const goalTitle = (() => {
    const targets = userData?.goal?.targets;
    if (!Array.isArray(targets) || targets.length === 0) return '目標が未設定です';
    const names = targets
      .map((target) => target?.displayName || getGoal(target?.goalId)?.displayName)
      .filter(Boolean);
    if (names.length === 0) return '目標が未設定です';
    return names.length === 1 ? names[0] : `${names[0]} ほか${names.length - 1}件`;
  })();

  // 能力スコアとランク。テストで推定した力があればそこから（ランク内の初級・中級・上級まで出る）。
  // 受けた直後は userData の読み直しより先に画面が変わるので、テストが返した値を先に使う
  const abilityScore = abilityScoreOf({
    level: testResultLevel,
    ability: testResultAbility ?? userData?.progress?.assessedAbility,
  });
  // 復習の卒業ぐあいから見たレベル（progressLogic が書く）。表示だけに使う。
  const estimatedLevel = userData?.progress?.estimatedLevel || null;
  const levelAhead = isAheadOfAssessment(estimatedLevel, testResultLevel);
  const currentRankId = rankForScore(abilityScore)?.id ?? null;
  // 自己ベストは下がっても消さない。保存済みが無ければ現在値を使う。
  const bestRankId = bestRankOf(userData?.assessment?.bestRank ?? null, currentRankId);
  const [dailyPlan, setDailyPlan] = useState({ newWords: [], reviewWords: [], extraNewWords: [] });
  const [showRetestPrompt, setShowRetestPrompt] = useState(false);
  const [isDailyTaskCompleted, setIsDailyTaskCompleted] = useState(false);
  const [currentLearningMode, setCurrentLearningMode] = useState(null); // 'daily', 'extra', 'free'
  const [paceSuggestion, setPaceSuggestion] = useState(null);
  
  // ▼▼▼ タブバー用のState ▼▼▼
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'story', 'free-study'
  
  // ▼▼▼ ストーリー生成用のState ▼▼▼
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [monthlyStory, setMonthlyStory] = useState(null);
  const [pastStories, setPastStories] = useState([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  
  // ▼▼▼ 自由学習進捗管理用のState ▼▼▼
  const [freeStudyProgress, setFreeStudyProgress] = useState({});
  const [storyError, setStoryError] = useState(null);
  const [masterWords, setMasterWords] = useState([]);
  // 単語データの保存の進み具合（0〜1）。初回の案内画面で出す。
  const [wordDataProgress, setWordDataProgress] = useState(0);
  const [showOnboarding, finishOnboarding, reopenOnboarding] = useOnboarding();
  const [wordDataError, setWordDataError] = useState(null);
  const [textbookCounts, setTextbookCounts] = useState({});
  
  // ▼▼▼ 親レベル選択用のState ▼▼▼
  const [selectedParentLevel, setSelectedParentLevel] = useState(null);
  const [showSubLevels, setShowSubLevels] = useState(false);
  
  const navigate = useNavigate();
  const themeGroups = useMemo(() => buildThemeGroups(allWords), [allWords]);

  // 単語マスターは初期バンドルに含めず、画面が開いたときに取りに行く（計画書13.5）。
  // 日次プランは Firestore から作るのでマスターが無くても出せる。
  // ここで画面全体を止めると、単語データだけの問題で今日の学習まで開けなくなる。
  const loadMasterWords = useCallback(({ force = false } = {}) => {
    setWordDataError(null);
    // 初回だけ端末に保存する。その進み具合を案内画面に出す。
    return loadWordMaster({ force, onProgress: setWordDataProgress })
      .then((words) => {
        setMasterWords(words);
        setWordDataProgress(1);
        return words;
      })
      .catch((error) => {
        logger.error('単語マスターの読み込みに失敗しました:', error);
        setWordDataError(error.message || '単語データを読み込めませんでした。');
        throw error;
      });
  }, []);

  useEffect(() => {
    loadMasterWords().catch(() => {});
  }, [loadMasterWords]);

  /*
    **いまのランクを、勉強を送るときに添えられるようにしておく**（2026-09-22）。
    つくばホームの一覧に紋章を出すため。

    **自己ベスト（`bestRankId`）ではなく現在のランクを渡す。** 塾が見たいのは
    「いま何が読めるか」で、いちばん良かったときの記録ではない。
  */
  useEffect(() => {
    setStudyRank(currentRankId);
  }, [currentRankId]);

  // 教材ごとの収録語数は manifest を正とする。画面に数値を書かない。
  useEffect(() => {
    let cancelled = false;
    loadManifest()
      .then((manifest) => {
        if (cancelled) return;
        const counts = Object.fromEntries(
          Object.entries(manifest.textbooks || {}).map(([id, info]) => [id, info.count])
        );
        setTextbookCounts(counts);
      })
      .catch((error) => logger.error('manifest の読み込みに失敗しました:', error));
    return () => { cancelled = true; };
  }, []);


  // 締切ブロックの数字は日次計画から引く。
  // 以前はここで remainingWords / remainingDays / 推奨語数を独自に計算しており、
  // 同じ「1日に何語やるか」が画面に 20 / 1 / 20 と3つ並んでいた（計画書10.4）。
  const scheduleMetrics = useMemo(() => {
    if (!userData?.goal?.targetDate || !dailyPlan) return null;

    const targetDate = parseLocalDate(userData.goal.targetDate);
    if (!targetDate) return null;

    const deadline = new Date(targetDate);
    deadline.setMonth(deadline.getMonth() - 1);
    if (deadline < parseLocalDate(getTodayKey())) deadline.setTime(targetDate.getTime());

    const remainingWords = dailyPlan.remainingWords ?? 0;
    const remainingDays = dailyPlan.remainingDays ?? 0;
    const todaysPlan = dailyPlan.newWords?.length ?? 0;

    let status = 'ontrack';
    if (remainingWords === 0) status = 'completed';
    else if (dailyPlan.isFeasible === false) status = 'behind';

    return {
      targetVocabulary: userData?.progress?.targetVocabulary ?? 0,
      mastered: userData?.progress?.currentVocabulary ?? 0,
      remainingWords,
      remainingDays,
      // 実際に今日出す語数と同じ値を見せる
      recommendedPerDay: dailyPlan.plannedNewWords ?? todaysPlan,
      requiredPerDay: dailyPlan.requiredNewWords ?? 0,
      isFeasible: dailyPlan.isFeasible !== false,
      todaysPlan,
      status,
      deadlineLabel: getTokyoDateKey(deadline),
    };
  }, [userData, dailyPlan]);

  const outstandingSummary = useMemo(() => {
    const newWordCount = dailyPlan?.newWords?.length || 0;
    const reviewCount = dailyPlan?.reviewWords?.length || 0;
    const hasOutstandingNew = !isDailyTaskCompleted && newWordCount > 0;
    const hasOutstandingReview = reviewCount > 0;
    return {
      show: hasOutstandingNew || hasOutstandingReview,
      newWordCount,
      reviewCount,
      hasOutstandingNew,
      hasOutstandingReview,
    };
  }, [dailyPlan, isDailyTaskCompleted]);

  const fetchStories = useCallback(async (uid) => {
    setStoriesLoading(true);
    try {
        const storiesColRef = collection(db, 'users', uid, 'generatedStories');
        const q = query(storiesColRef, orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const stories = querySnapshot.docs
          .map(doc => normalizeStory({ id: doc.id, ...doc.data() }))
          // 生成に失敗した記録や生成中の予約は一覧に出さない
          .filter(isDisplayableStory);
        setPastStories(stories);

        const yearMonth = getCurrentMonthKey();
        const currentMonthStory = stories.find(story => story.id === yearMonth);
        setMonthlyStory(currentMonthStory || null);

    } catch (error) {
        console.error("Error fetching stories:", error);
        // エラーが発生した場合でも空の配列を設定
        setPastStories([]);
        setMonthlyStory(null);
    } finally {
        setStoriesLoading(false);
    }
  }, []);

  // --- データ取得・更新ロジック (変更なし) ---
  const refreshDashboardData = useCallback(async (uid) => {
    setDashboardError(null);
    try {
      const userDocRef = doc(db, 'users', uid);
      // キャッシュを無効化して最新データを取得
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const data = userDoc.data();
        logger.debug('👤 ユーザーデータ取得:', {
          level: data.level,
          testResultLevel: data.testResultLevel,
          finalLevel: data.finalLevel,
          全フィールド: Object.keys(data),
          progress: data.progress
        });
        setUserData(data);
        
        // testResultLevelの設定を詳細にログ出力
        const levelToSet = data.level || 0;
        logger.debug('🎯 testResultLevel設定:', {
          dataLevel: data.level,
          levelToSet,
          willSetTestResultLevel: levelToSet
        });
        setTestResultLevel(levelToSet);
        
        // 今日の計画・完了フラグ・直近のログは互いに関係が無い。
        // 順番に待つと往復のぶんだけ起動が遅くなるので、まとめて投げる。
        const todayStr = getTodayKey();
        const lookbackDate = new Date();
        lookbackDate.setDate(lookbackDate.getDate() - 5);

        const [plan, dailyCompletionDoc, logsResult] = await Promise.all([
          generateDailyPlan(data, uid),
          getDoc(doc(db, 'users', uid, 'dailyCompletion', todayStr)),
          getDocs(query(
            collection(db, 'users', uid, 'logs'),
            where('timestamp', '>=', lookbackDate),
            orderBy('timestamp', 'desc'),
          )).catch((paceError) => {
            console.error('Failed to load recent logs:', paceError);
            return null;
          }),
        ]);

        setDailyPlan(plan);
        setIsDailyTaskCompleted(dailyCompletionDoc.exists());

        try {
          if (!logsResult) throw new Error('recent logs unavailable');
          const logsSnapshot = logsResult;

          const dailyNewMap = new Map();

          logsSnapshot.forEach((logDoc) => {
            const logData = logDoc.data();
            if (!logData) return;
            const ts = logData.timestamp?.toDate?.();
            if (!ts) return;
            const dayKey = getTokyoDateKey(ts);

            if (logData.sessionType === 'new' && logData.wordId) {
              const entry = dailyNewMap.get(dayKey) || new Set();
              entry.add(logData.wordId);
              dailyNewMap.set(dayKey, entry);
            }
          });

          const daysTracked = dailyNewMap.size || 1;
          const totalLearned = Array.from(dailyNewMap.values()).reduce((sum, set) => sum + set.size, 0);
          const averageNewPerDay = totalLearned / daysTracked;

          const recommended = plan?.dailyTarget || 0;
          let status = 'neutral';
          if (recommended > 0) {
            if (averageNewPerDay >= recommended * 1.2) status = 'ahead';
            else if (averageNewPerDay <= recommended * 0.8) status = 'behind';
            else status = 'ontrack';
          }

          setPaceSuggestion({
            average: Number(averageNewPerDay.toFixed(1)),
            recommended,
            status,
            daysTracked,
          });
        } catch (paceError) {
          console.error('Failed to compute pace suggestion:', paceError);
          setPaceSuggestion(null);
        }

        if (data.progress && data.progress.lastCheckedAt) {
          const lastCheckedDate = data.progress.lastCheckedAt.toDate();
          const today = new Date();
          const diffTime = Math.abs(today - lastCheckedDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          setShowRetestPrompt(diffDays > 7);
        } else {
          setShowRetestPrompt(true);
        }

        // const logsColRef = collection(db, 'users', uid, 'logs');
        // const q = query(logsColRef, orderBy("timestamp", "desc"), limit(1));
      } else {
        logger.debug("No such document! Redirecting to test.");
        setViewMode('test'); 
      }
    } catch (error) {
      // 空の計画を返して「学習する単語がありません」と誤表示させない。
      // 画面に再試行できる状態を出す（計画書10.2.9）。
      console.error("Error refreshing dashboard data: ", error);
      setDashboardError('今日の学習プランを読み込めませんでした。通信状態を確認してください。');
    }
  }, []);

  // 自由学習進捗を読み込む関数
  const loadFreeStudyProgress = useCallback(async (uid) => {
    try {
      const progress = await getAllFreeStudyProgress(uid);
      logger.debug('自由学習進捗読み込み:', progress);
      setFreeStudyProgress(progress);
    } catch (error) {
      console.error('自由学習進捗の読み込みに失敗しました:', error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      setUserId(user ? user.uid : null);
      if (user) {
        setLoading(true);
        Promise.all([
          refreshDashboardData(user.uid),
          fetchStories(user.uid),
          loadFreeStudyProgress(user.uid)
        ]).finally(() => setLoading(false));
      } else {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [refreshDashboardData, navigate, fetchStories, loadFreeStudyProgress]);
  
  // --- イベントハンドラ (既存のものは変更なし) ---
  const handleLogout = () => auth.signOut().then(() => navigate('/login'));
  
  const startCheckTest = async () => {
    setLoading(true);
    try {
      const master = masterWords.length > 0 ? masterWords : await loadMasterWords();
      const combinedWords = master.map((word) => ({
        sourceTextbook: 'words-master',
        ...word,
      }));
      
      // 表面語をキーにすると close(動/形/副) のような同綴語が消える。永続IDで一意化する。
      const uniqueWords = Array.from(new Map(combinedWords.map(w => [w.id, w])).values());
      setTestWords(uniqueWords);
      setViewMode('test');
    } catch (error) {
      console.error("Error fetching test words:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestComplete = (finalLevel, responseTimes = [], estimatedVocabulary = null, ability = null) => {
    logger.debug('🎯 テスト完了処理開始:', finalLevel, responseTimes);
    setTestResultLevel(finalLevel);
    setTestResultVocabulary(estimatedVocabulary);
    setTestResultAbility(ability);
    if (auth.currentUser) {
      refreshDashboardData(auth.currentUser.uid);
    }
    setViewMode('result');
    // 新機能: 回答時間データを保存
    if (responseTimes.length > 0) {
      localStorage.setItem('lastTestResponseTimes', JSON.stringify(responseTimes));
    }
  };

  const markDailyTaskAsCompleted = async (userId) => {
      try {
        const todayStr = getTodayKey();
        const docRef = doc(db, 'users', userId, 'dailyCompletion', todayStr);
        await setDoc(docRef, { completedAt: new Date() });
        setIsDailyTaskCompleted(true);
      } catch (error) {
        console.error("Error marking daily task as completed:", error);
      }
  };

  const handleSaveLog = async (logData) => {
    const user = auth.currentUser;
    if (user) {
      // 学習ログを保存
      logStudySession(user.uid, logData);
      
      /*
        自由学習の場合、進捗も保存。

        **教材（番号の帯）も保存する**（2026-09-22）。100語を2回に分けてやるのは
        普通なので、ここを `level` だけにしておくと**毎回1番から**になる。
        鍵に使う名前は `filterValue`（`1〜100`）ではなく `rangeKey`
        （`1-100`）——`〜` を Firestore のドキュメントIDに入れない。
      */
      const isRange = currentSessionInfo?.filterType === 'range';
      if (currentLearningMode === 'free' && (currentSessionInfo?.filterType === 'level' || isRange) && selectedTextbookId) {
        const lastIndex = logData.index || 0;
        const level = isRange
          ? currentSessionInfo.rangeKey
          : levelProgressKey(selectedTextbookId, currentSessionInfo.filterValue.replace('レベル', ''));
        
        logger.debug('進捗保存:', {
          userId: user.uid,
          textbookId: selectedTextbookId,
          level: level,
          lastIndex: lastIndex,
          filterValue: currentSessionInfo.filterValue
        });
        
        await saveFreeStudyProgress(user.uid, selectedTextbookId, level, lastIndex);
        
        // ローカル状態も更新
        const progressKey = `${selectedTextbookId}_${level}`;
        setFreeStudyProgress(prev => ({
          ...prev,
          [progressKey]: lastIndex
        }));
        
        logger.debug('進捗保存完了:', progressKey, lastIndex);
      }
    }
  };

  const handleLearningBack = (incorrectWords, newlyLearnedCount) => {
    const user = auth.currentUser;
    if (!user) return;

    // 不正解単語はここでは登録しない。LearningFlashcard が回答のたびに
    // updateUserWordProgress('again') で記録済み。ここでも addWordToReview を
    // 呼ぶと、積み上げた復習間隔を初期値へ上書きしてしまう。

    // Update vocabulary count and progress if new words were learned
    // 到達語数は increment で足さない。実力テストが判定レベル以下を
    // 一括計上しているところへ重ねると二重加算になり、収録語数を超える。
    // updateProgressPercentage が和集合で数え直す。
    /*
      **画面を先に戻す。数え直しは待たない**（2026-09-26）。数え直しは単語データ（約2.3MB）と
      復習リストを全件読んで書くので、携帯では数秒かかる。以前はそれを待ってから戻していたので
      「終了がかなり遅い」になった。書き込みは捨てていない——終わったらホームを読み直して、
      新しい到達語数を出す（今日のタスクはすぐ読み直す）。
    */
    refreshDashboardData(user.uid);
    if (newlyLearnedCount > 0) {
      updateProgressPercentage(user.uid)
        .then(() => refreshDashboardData(user.uid))
        .catch((error) => console.error('進捗の更新に失敗しました:', error));
    }
    // 学習中に登録／解除したぶんをホームの枚数へ反映する
    reloadBookmarks();
    setViewMode('select');
    
    // 自由学習モードの場合は教材のレベル別ページに戻る。
    // **教材は番号の帯へ戻す**——絞り込み画面は通っていないので、
    // そこへ返すと行ったことのない画面に着地する（2026-09-22）
    if (currentLearningMode === 'free' && selectedTextbookId) {
      setSelectionMode(
        isBookId(selectedTextbookId) ? 'book-range'
          : isSunshineTextbookId(selectedTextbookId) ? 'textbook-pages'
            : 'filter'
      );
    } else {
      setSelectionMode('main');
    }
  };

  const handleReviewComplete = () => {
    // 受験サポートのまちがえた語だけで復習していたら、次は今日の計画の復習に戻す
    setReviewOverride(null);
    if (auth.currentUser) {
      refreshDashboardData(auth.currentUser.uid);
    }
    // 復習中に★を付け外ししても、ホームの「毎日みる単語」の数に出るように
    reloadBookmarks();
    setViewMode('select');
  };

  const handleSelectTextbook = async (textbookId) => {
    setLoading(true);
    setSelectedTextbookId(textbookId);
    logger.debug('教材選択:', textbookId);
    
    try {
        const option = freeStudyOptions.find(opt => opt.id === textbookId);
        const targetTextbookIds = option?.textbooks || [textbookId];
        
        logger.debug('教材オプション:', option);
        logger.debug('対象テキストブックIDs:', targetTextbookIds);

        let combinedWords = [];
        
        // 大阪府公立入試英単語の場合はtsukutan-app/words.jsonから直接読み込み
        if (textbookId === 'osaka-koukou-nyuushi') {
          logger.debug('🏫 大阪府公立入試英単語の処理開始');
          
          try {
            // tsukutan-app/words.jsonから直接読み込み
            const osakaWordsData = await fetch('/data/words-osaka.json').then(res => res.json());
            logger.debug('📚 大阪府公立入試英単語データ読み込み成功:', {
              総単語数: osakaWordsData.length,
              サンプル単語: osakaWordsData.slice(0, 3).map(w => ({ word: w.word, level: w.level }))
            });
            
            const words = osakaWordsData.map((word) => ({ 
              sourceTextbook: 'osaka-koukou-nyuushi', 
              ...word 
            }));
            combinedWords.push(...words);
            logger.debug(`大阪府公立入試英単語から取得した単語数:`, words.length);
          } catch (error) {
            console.error('❌ 大阪府公立入試英単語データの読み込みに失敗:', error);
            throw new Error('大阪府公立入試英単語データの読み込みに失敗しました');
          }
        } else if (textbookId === 'highschool-english') {
          // 高校英語は教材ファイル（words-highschool.json）に入っている語。
          // 以前は「マスターのレベル5〜7」で拾っていたが、レベルを付け直した
          // （2026-09-24）ので、高校英語の語は1〜7に散っている。
          const highschoolWords = await loadTextbookWords('highschool-english');
          const words = highschoolWords.map((word) => ({
            sourceTextbook: 'highschool-english',
            ...word
          }));
          combinedWords.push(...words);
          logger.debug(`高校英語から取得した単語数:`, words.length);
        } else {
          // 英検教材はマスターだけを見る。words-osaka.json の語はすべて
          // マスターにも同じIDで入っていて、級の情報もマスター側にある。
          if (textbookId.startsWith('eiken-')) {
            logger.debug('🎯 英検教材の処理開始:', textbookId);

            const master = masterWords.length > 0 ? masterWords : await loadMasterWords();
            const eikenWords = eikenWordsUpTo(textbookId, master).map((word) => ({
              sourceTextbook: textbookId,
              ...word,
            }));
            combinedWords.push(...eikenWords);

            logger.debug(`英検教材から取得した総単語数:`, combinedWords.length);
          } else {
            // その他の教材はFirebaseから取得
        for (const id of targetTextbookIds) {
          const snapshot = await getDocs(collection(db, 'textbooks', id, 'words'));
          const words = snapshot.docs.map(d => ({ id: d.id, sourceTextbook: id, ...d.data() }));
          combinedWords.push(...words);
          logger.debug(`テキストブック ${id} から取得した単語数:`, words.length);
            }
          }
        }

        // 永続IDで重複を除去する。表面語をキーにすると意味違いの同綴語が消える。
        const uniqueWords = Array.from(new Map(combinedWords.map(item => [item.id, item])).values());
        if (uniqueWords.length !== combinedWords.length) {
          logger.debug(`${textbookId}: 重複除去 ${combinedWords.length} → ${uniqueWords.length}`);
        }

        let filteredWords = uniqueWords;
        
        // 英検級の場合は全ての単語を保持（レベル別表示で個別にフィルタリング）
        if (option.id.startsWith('eiken-')) {
          logger.debug('英検教材選択: 全単語を保持、レベル別表示で個別フィルタリング');
        } else if (option?.levels?.length) {
          // 通常のレベル別の場合は既存のlevelフィールドを使用
          logger.debug('🔍 レベルフィルタリング開始:', {
            対象レベル: option.levels,
            フィルタ前単語数: filteredWords.length,
            サンプル単語: filteredWords.slice(0, 5).map(w => ({ word: w.word, level: w.level }))
          });
          
          filteredWords = filteredWords.filter(word => {
            return option.levels.includes(word.level);
          });
          
          logger.debug('レベルフィルタ後:', {
            フィルタ後単語数: filteredWords.length,
            レベル別分布: filteredWords.reduce((acc, word) => {
              acc[word.level] = (acc[word.level] || 0) + 1;
              return acc;
            }, {})
          });
        }

        if (option?.topics?.length && filteredWords[0]?.topic !== undefined) {
          filteredWords = filteredWords.filter(word => option.topics.includes(word.topic));
          logger.debug('トピックフィルタ後:', filteredWords.length);
        }

        // 固定順序でソート（教材選択時に一度だけ実行）
        filteredWords = filteredWords.sort((a, b) => {
          // レベル順、次に単語順、最後にID順でソート
          if (a.level !== b.level) {
            return a.level - b.level;
          }
          if (a.word !== b.word) {
            return a.word.localeCompare(b.word);
          }
          return a.id.localeCompare(b.id);
        });

        logger.debug('📊 最終的な単語データ:', {
          教材ID: textbookId,
          総単語数: filteredWords.length,
          レベル別分布: filteredWords.reduce((acc, word) => {
            acc[word.level] = (acc[word.level] || 0) + 1;
            return acc;
          }, {}),
          サンプル単語: filteredWords.slice(0, 5).map(w => ({ word: w.word, level: w.level }))
        });
        // 英検教材の絞り込みは読み込み時（eikenWordsUpTo）で済んでいる。
        setAllWords(filteredWords);


        if (filteredWords.length === 0) {
          alert('このメニューには該当する単語がまだ登録されていません。別のメニューを選んでください。');
          // 選ぶ前の一覧に置いたままにする。main へ戻すと、英検の級を選んだ人が
          // 3カードまで放り出されて、隣の級を試すのに辿り直しになる。
          setSelectedTextbookId(null);
          setAllWords([]);
          return;
        }
        setSelectionMode('filter');
    } catch (error) {
        console.error("Error fetching textbook words:", error);
        alert('単語の読み込みに失敗しました。');
    } finally {
        setLoading(false);
    }
  };

  /** 自由学習で一段だけ戻る。行き先は freeStudyBackTarget が決める。 */
  const handleBackToMainMenu = () => {
    setSelectionMode(freeStudyBackTarget(selectionMode, selectedTextbookId));
    setSelectedTextbookId(null);
    setAllWords([]);
  };

  // 親レベル選択の処理
  const handleParentLevelClick = (parentLevel) => {
    setSelectedParentLevel(parentLevel);
    setShowSubLevels(true);
    logger.debug('親レベル選択:', parentLevel);
  };

  // サブレベル選択の処理（英検の級の中のレベル）
  const handleSubLevelClick = (subLevel) => {
    startLearning('level', subLevel);
  };

  // 親レベル選択をリセット
  const resetParentLevelSelection = () => {
    setSelectedParentLevel(null);
    setShowSubLevels(false);
  };

  const startLearning = async (filterType, value) => {
    noteDeck(null); // 単語帳の練習ではない（受験サポートのタスクに付けない）
    let filtered = [];
    let sessionLabel = '';
    let startIndex = 0;
    
    logger.debug('学習開始:', {
      filterType,
      value,
      selectedTextbookId,
      allWordsLength: allWords.length,
      showSubLevels,
      selectedParentLevel
    });
    
    if (filterType === 'level') {
        // サブレベル選択時（親レベル選択後）の場合は、親レベル範囲内からlevelフィールドでフィルタ
        if (showSubLevels && selectedParentLevel) {
          // まず親レベル範囲内の単語を取得
          let parentLevelWords = [];
          
          if (selectedTextbookId && selectedTextbookId.startsWith('eiken-')) {
            // 英検教材の場合：選択された親レベル（selectedParentLevel）に対応する英検級の単語を取得
            const eikenLevelOrder = [5, 4, 3, 'pre2', 2, 'pre1', 1];
            const targetEikenLevel = eikenLevelOrder[selectedParentLevel - 1];
            
            parentLevelWords = allWords.filter(word => {
              // eikenLevelsフィールドがある場合（wordsData.jsonから取得した単語）
              if (word.eikenLevels && Array.isArray(word.eikenLevels)) {
                return word.eikenLevels.includes(targetEikenLevel);
              }
              
              // eikenLevelsフィールドがない場合（words.jsonから取得した単語）
              // levelフィールドを英検級にマッピングして判定
              if (word.level) {
                const levelToEikenMapping = {
                  1: 5, 2: 4, 3: 3, 4: 2, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1
                };
                const mappedEikenLevel = levelToEikenMapping[word.level];
                
                if (typeof targetEikenLevel === 'number') {
                  return mappedEikenLevel === targetEikenLevel;
                } else if (targetEikenLevel === 'pre2') {
                  return mappedEikenLevel === 4; // 準2級はレベル4
                } else if (targetEikenLevel === 'pre1') {
                  return mappedEikenLevel === 7; // 準1級はレベル7
                }
              }
              
              return false;
            });
          } else {
            // その他の教材の場合：選択された親レベルの単語を取得
            parentLevelWords = allWords.filter(word => word.level === selectedParentLevel);
          }
          
          // 親レベル範囲内から、指定されたlevelの単語をフィルタ
          filtered = parentLevelWords.filter(word => word.level === Number(value));
          logger.debug(`サブレベル${value}から取得した単語数:`, filtered.length, `(親レベル範囲内: ${parentLevelWords.length}語)`);
          sessionLabel = `レベル${value}`;
        }
        // レベル別学習の場合、教材に応じてフィルタリング
        else if (selectedTextbookId && selectedTextbookId.startsWith('eiken-')) {
          // 級ごとの行は「その級の語」だけを出す。一覧の語数と一致させるため、
          // 判定はレベル別表示と同じ easiestEikenLevel に揃える。
          const targetEikenLevel = eikenTargetOf(selectedTextbookId);
          const targetIndex = EIKEN_ORDER.indexOf(targetEikenLevel);
          const currentLevelEiken = EIKEN_ORDER[Number(value) - 1];

          if (targetIndex !== -1 && currentLevelEiken !== undefined
              && EIKEN_ORDER.indexOf(currentLevelEiken) <= targetIndex) {
            filtered = allWords.filter((word) => easiestEikenLevel(word) === currentLevelEiken);
          }
          logger.debug(`英検${targetEikenLevel}級以下から取得した単語数:`, filtered.length);
          sessionLabel = `英検${targetEikenLevel}級以下`;
        } else if (selectedTextbookId === 'highschool-english') {
          filtered = allWords.filter(word => inHighschoolCard(word, value));
          // 見出しは他の教材と同じ「レベルN」。続きの鍵をここから作っている（handleSaveLog）
          sessionLabel = `レベル${value}`;
        } else if (selectedTextbookId === 'osaka-koukou-nyuushi') {
          // 大阪府公立入試英単語の場合はlevelフィールドを基準にフィルタ
          filtered = allWords.filter(word => word.level === Number(value));
          logger.debug('大阪府公立入試英単語から取得した単語数:', filtered.length);
          sessionLabel = `レベル${value}`;
        } else {
          // 通常のレベル別学習の場合、levelフィールドを基準にフィルタ
          filtered = allWords.filter(word => word.level === Number(value));
        logger.debug('allWordsから取得した単語数（固定順序）:', filtered.length);
          sessionLabel = `レベル${value}`;
        }
        
        // 前回の進捗を取得
        if (selectedTextbookId) {
          startIndex = await getFreeStudyProgress(auth.currentUser.uid, selectedTextbookId, levelProgressKey(selectedTextbookId, value));
          logger.debug('進捗取得:', {
            userId: auth.currentUser.uid,
            textbookId: selectedTextbookId,
            level: value,
            levelString: String(value),
            startIndex: startIndex,
            totalWords: filtered.length
          });
        }
        
        // 単語が見つからない場合の処理
        if (filtered.length === 0) {
          console.error('該当レベルの単語が見つかりません:', {
            filterType,
            value,
            selectedTextbookId,
            allWordsLength: allWords.length
          });
          alert(`${sessionLabel}の単語が見つかりません。別のレベルを選択してください。`);
          return;
        }
    } else if (filterType === 'pos') {
        const posAbbr = posMap[value] || value;
        filtered = allWords.filter(word => word.partOfSpeech.includes(posAbbr));
        sessionLabel = `品詞: ${value}`;
    } else if (filterType === 'theme') {
        const group = themeGroups[value];
        filtered = group ? group.words : [];
        sessionLabel = `テーマ: ${group?.label || value}`;
    }
    
    const textbookLabel = freeStudyOptions.find(opt => opt.id === selectedTextbookId)?.label || selectedTextbookId;
    logger.debug('セッション情報設定:', {
      textbookId: textbookLabel,
      filterType: filterType,
      filterValue: sessionLabel,
      startIndex: startIndex,
      totalWords: filtered.length
    });
    
    setCurrentSessionInfo({
      textbookId: textbookLabel,
      filterType: filterType,
      filterValue: sessionLabel,
      startIndex: startIndex, // 開始インデックスを追加
    });
    setCurrentLearningMode('free');
    setLearningWords(filtered);
    setViewMode('learn');
  };

  const startDailyNewWords = () => {
    noteDeck(null); // 単語帳の練習ではない（受験サポートのタスクに付けない）
    if (!dailyPlan.newWords || dailyPlan.newWords.length === 0) {
      alert('今日の新規単語はありません。');
      return;
    }
    setCurrentSessionInfo({
      textbookId: '今日のタスク',
      filterType: '新規単語',
      filterValue: `${dailyPlan.newWords.length}語`,
      startIndex: 0
    });
    setCurrentLearningMode('daily');
    setLearningWords(dailyPlan.newWords);
    setViewMode('learn');
  };

  const startExtraNewWords = () => {
    noteDeck(null); // 単語帳の練習ではない（受験サポートのタスクに付けない）
    if (!dailyPlan.extraNewWords || dailyPlan.extraNewWords.length === 0) {
      alert('追加の単語はありません。お疲れ様でした！');
      return;
    }
    setCurrentSessionInfo({
      textbookId: 'おかわり学習',
      filterType: '追加単語',
      filterValue: `${dailyPlan.extraNewWords.length}語`,
      startIndex: 0
    });
    setCurrentLearningMode('extra');
    setLearningWords(dailyPlan.extraNewWords);
    setViewMode('learn');
  };

  /**
   * 教材（市販の単語帳）を選んだ。**番号の帯の一覧へ進む。**
   *
   * 単語はここでは読まない。帯を押した時点で読む——4冊ぶんを先読みすると
   * 選ばない本まで落ちてくる。
   */
  const handleSelectBook = (book) => {
    setSelectedTextbookId(book.id);
    setSelectionMode('book-range');
  };

  /**
   * 番号の帯を押した。**その場で読んで、そのままカードへ。**
   *
   * 絞り込み画面（レベル・品詞・意味）は通さない。単語帳は通し番号で進めるもので、
   * レベルで切り直すと本と別の並びになる。
   */
  const startBookRange = async (book, range) => {
    // 練習した時間を受験サポートのタスクに付けるため、単語帳を記録に付ける
    noteDeck(book.deckId);
    try {
      const response = await fetch(bookWordsUrl(book));
      // SPA の書き換えで index.html が 200 で返ることがある（wordMaster.js と同じ用心）
      if (!response.ok) throw new Error(`${response.status}`);
      const all = await response.json();
      const words = wordsInRange(all, range.from, range.to);
      if (words.length === 0) {
        alert('この範囲の単語が読み込めませんでした。電波の良いところで試してください。');
        return;
      }

      const rangeKey = rangeKeyOf(range.from, range.to);
      const uid = auth.currentUser?.uid;
      // **前回の続きから。** 100語を2回に分けるのは普通の使い方
      const startIndex = uid ? await getFreeStudyProgress(uid, book.id, rangeKey) : 0;

      setCurrentSessionInfo({
        textbookId: book.title,
        filterType: 'range',
        filterValue: range.label,
        // 進捗の鍵。**`〜` を Firestore のドキュメントIDに入れない**
        rangeKey,
        startIndex: startIndex < words.length ? startIndex : 0,
      });
      setCurrentLearningMode('free');
      setLearningWords(words);
      setViewMode('learn');
    } catch (error) {
      logger.warn('教材の単語を読めませんでした', error);
      alert('教材を読み込めませんでした。電波の良いところで試してください。');
    }
  };

  /*
    学校の教科書（Sunshine）。**選んだときだけ読む**（起動には乗せない。単語帳と同じ）。
    選んだ学年は selectedTextbookId に `sunshine-1` の形で持つ。戻る先と進捗の鍵がそこから決まる
  */
  const [textbookCards, setTextbookCards] = useState(null);
  const [textbookError, setTextbookError] = useState('');
  useEffect(() => {
    if (!String(selectionMode).startsWith('textbook') || textbookCards) return;
    setTextbookError('');
    loadSunshineCards()
      .then(setTextbookCards)
      .catch((error) => {
        logger.warn('教科書の単語を読めませんでした', error);
        setTextbookError('教科書の単語を読み込めませんでした。電波の良いところで、もう一度開いてください。');
      });
  }, [selectionMode, textbookCards]);

  /*
    先生が出した小テスト。ホームのいちばん上にカードで出す。
    **解いたらサーバから読み直してカードを消す**（手元で消さない。楽観的更新をしない）
  */
  const [pendingQuizzes, setPendingQuizzes] = useState([]);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const refreshQuizzes = useCallback(async (uid) => {
    try {
      setPendingQuizzes(await loadPendingQuizzes(uid));
    } catch (error) {
      // 読めなかったときはカードを出さないだけ（ホームの他の部分は使えるようにする）
      logger.warn('先生からの小テストを読めませんでした', error);
    }
  }, []);
  useEffect(() => {
    if (userId) refreshQuizzes(userId);
  }, [userId, refreshQuizzes]);
  /*
    受験サポートのテストでまちがえた語を、毎日の復習に入れる（2026-09-24。→ logic/examSupportMissed.js）。
    起動と並行して1回。**失敗しても画面は止めない**（次に開いたときに取り直す）
  */
  const [examMissed, setExamMissed] = useState([]);
  const [reviewOverride, setReviewOverride] = useState(null);
  // 受験サポートで出されたテスト範囲（まだ合格していないもの）。ホームで練習できる
  const [examPractice, setExamPractice] = useState([]);
  const [practiceBusy, setPracticeBusy] = useState('');
  useEffect(() => {
    if (!userId) return;
    syncExamSupportMissed(userId)
      .then(({ missed, practice }) => {
        if (missed.length > 0) setExamMissed(missed);
        setExamPractice(practice);
      })
      .catch((error) => logger.warn('受験サポートのまちがえた語を取り込めませんでした', error));
  }, [userId]);

  /**
   * テスト範囲を練習する。**自由学習の単語帳と同じカードの画面**へ。
   * 範囲（番号の帯）なら単語帳の「前回の続き」と同じ鍵で再開する（同じ範囲を単語帳から開いても続きになる）
   */
  const startExamPractice = async (p) => {
    setPracticeBusy(p.assignmentId);
    try {
      const cards = await cardsForRefs(p.words);
      if (cards.length === 0) return;
      const deckIds = [...new Set((p.words || []).map((w) => w.deckId))];
      // 練習した時間を受験サポートのタスクに付けるため、単語帳を記録に付ける（1冊のときだけ）
      noteDeck(deckIds.length === 1 ? deckIds[0] : null);
      const book = p.range ? BOOKS.find((b) => b.deckId === p.range.deckId) : null;
      const rangeKey = book ? rangeKeyOf(p.range.from, p.range.to) : null;
      const uid = auth.currentUser?.uid;
      const startIndex = book && uid ? await getFreeStudyProgress(uid, book.id, rangeKey) : 0;
      setSelectedTextbookId(book ? book.id : null);
      setCurrentSessionInfo({
        textbookId: '受験サポート',
        filterType: book ? 'range' : 'テスト範囲',
        filterValue: p.title,
        ...(rangeKey ? { rangeKey } : {}),
        startIndex: startIndex < cards.length ? startIndex : 0,
      });
      setCurrentLearningMode('free');
      setLearningWords(cards);
      setViewMode('learn');
    } catch (error) {
      logger.warn('テスト範囲の単語を読めませんでした', error);
    } finally {
      setPracticeBusy('');
    }
  };
  /** 知らせの「今すぐ復習する」。今日の計画ではなく、取り込んだ語だけで復習する */
  const startExamMissedReview = () => {
    noteDeck(null);
    setReviewOverride(examMissed.map(reviewEntryOf));
    setCurrentSessionInfo({
      textbookId: '受験サポート',
      filterType: 'まちがえた語',
      filterValue: `${examMissed.length}語`,
      startIndex: 0,
    });
    setExamMissed([]);
    setViewMode('review');
  };

  const startAssignedQuiz = (quiz) => {
    setActiveQuiz(quiz);
    setViewMode('assigned-quiz');
  };
  const closeAssignedQuiz = (finished) => {
    setActiveQuiz(null);
    setViewMode('select');
    if (finished && userId) refreshQuizzes(userId);
  };

  const handleSelectTextbookGrade = (grade) => {
    setSelectedTextbookId(sunshineTextbookId(grade));
    setSelectionMode('textbook-pages');
  };

  /** ページの範囲を選んだ。**そのままカードへ**（絞り込み画面は通さない。単語帳と同じ） */
  const startTextbookPages = async (grade, from, to) => {
    noteDeck(null); // 単語帳の練習ではない（受験サポートのタスクに付けない）
    const words = wordsInPages(textbookCards, grade, from, to);
    if (words.length === 0) return;
    const textbookId = sunshineTextbookId(grade);
    const rangeKey = pageRangeKey(from, to);
    const uid = auth.currentUser?.uid;
    const startIndex = uid ? await getFreeStudyProgress(uid, textbookId, rangeKey) : 0;
    setCurrentSessionInfo({
      textbookId: `Sunshine ${grade}年`,
      filterType: 'range',
      filterValue: pageLabel(from, to),
      rangeKey,
      startIndex: startIndex < words.length ? startIndex : 0,
    });
    setCurrentLearningMode('free');
    setLearningWords(words);
    setViewMode('learn');
  };

  const startBookmarkWords = () => {
    noteDeck(null); // 単語帳の練習ではない（受験サポートのタスクに付けない）
    if (bookmarks.length === 0) return;
    setCurrentSessionInfo({
      textbookId: '毎日みる単語',
      filterType: 'ブックマーク',
      filterValue: `${bookmarks.length}語`,
      startIndex: 0
    });
    // 日次タスクの達成には数えない。自分で選んだ単語の復習なので、
    // 今日のノルマとは別に扱う。
    setCurrentLearningMode('bookmark');
    setLearningWords(bookmarks);
    setViewMode('learn');
  };

  const startDailyReviewWords = () => {
    noteDeck(null); // 単語帳の練習ではない（受験サポートのタスクに付けない）
    if (!dailyPlan.reviewWords || dailyPlan.reviewWords.length === 0) {
      alert('今日の復習単語はありません。');
      return;
    }
    setCurrentSessionInfo({
      textbookId: '今日のタスク',
      filterType: '復習単語',
      filterValue: `${dailyPlan.reviewWords.length}語`,
      startIndex: 0
    });
    setViewMode('review');
  };

  const handleGenerateStory = async () => {
    const wordsToUse = dailyPlan.reviewWords;
    if (!wordsToUse || wordsToUse.length === 0) {
      alert("ストーリーを生成するための復習単語がありません。");
      return;
    }
    setIsGeneratingStory(true);
    setStoryError(null);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('ログインしていません。');

      const idToken = await user.getIdToken();
      const functionUrl = 'https://us-central1-tsukutan-58b3f.cloudfunctions.net/generateStoryFromWords';

      // 呼び出しは1回だけ。未使用単語の作り直しはサーバー側で同じ実行の中で行う。
      // 以前はクライアントから2回呼んでいたが、1回目で月次ドキュメントが作られるため
      // 2回目は必ず429で失敗していた（計画書12.5）。
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ words: wordsToUse }),
      });

      const payload = await response.json().catch(() => ({}));

      if (response.status === 429) {
        // 今月分が既にある。サーバーが返した内容をそのまま表示する。
        setMonthlyStory(normalizeStory({ id: getCurrentMonthKey(), ...payload }));
        setStoryError('今月のストーリーは既に生成されています。');
        return;
      }
      if (response.status === 409) {
        setStoryError(payload.error || 'ストーリーを生成中です。しばらく待ってから開き直してください。');
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error || `ストーリーの生成に失敗しました (HTTP ${response.status})。`);
      }

      const newStory = normalizeStory({ id: getCurrentMonthKey(), ...payload });
      setMonthlyStory(newStory);
      setPastStories((prev) => [newStory, ...prev.filter((story) => story.id !== newStory.id)]);
    } catch (error) {
      console.error('ストーリー生成エラー:', error);
      setStoryError(error.message || 'ストーリーを生成できませんでした。');
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const handleResetGoal = async () => {
    if (!window.confirm('現在の目標をリセットして、新しい目標を設定しますか？')) {
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      alert('ログインしていません。');
      return;
    }

    try {
      logger.debug('目標をリセットしています...');
      
      // Reset goal data in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        goal: {
          targets: [],
          targetDate: null,
          isSet: false,
        }
      });

      logger.debug('Firestoreの更新が完了しました');

      // Clear local state
      setUserData(prev => ({
        ...prev,
        goal: {
          targets: [],
          targetDate: null,
          isSet: false,
        }
      }));

      logger.debug('ローカル状態の更新が完了しました');

      // Show success message
      alert('目標がリセットされました。新しい目標を設定してください。');

      // Reload the page to trigger App.js useEffect
      logger.debug('ページをリロードして目標設定画面に遷移します');
      window.location.reload();
    } catch (error) {
      console.error('目標リセットエラー:', error);
      alert(`目標のリセットに失敗しました: ${error.message}`);
    }
  };
  
  // --- レンダリングロジック ---

  // 初回の案内は、読み込みを待たずに出す。待っている間に読んでもらうのが
  // 目的なので、Firestore を読み終えてから出したのでは意味がない。
  const onboardingOverlay = showOnboarding ? (
    <Onboarding
      progress={wordDataProgress}
      ready={(masterWords.length > 0 || Boolean(wordDataError)) && !loading}
      onFinish={finishOnboarding}
    />
  ) : null;

  if (loading) {
    // 真っ白にスピナーだけだと壊れて見える。出来上がりと同じ形を先に描く。
    return (
      <>
        {onboardingOverlay}
        <div className="dashboard-container">
          <StudentHeader userName={userData?.name} onLogout={handleLogout} onShowGuide={reopenOnboarding} />
          <main className="card-main">
            <DashboardSkeleton />
          </main>
          <StudentBottomNav activeTab="home" onChange={() => {}} />
        </div>
      </>
    );
  }

  if (dashboardError) {
    return (
      <div className="loading-container">
        {onboardingOverlay}
        <div className="app-status-card">
          <h1 className="app-status-title">今日の学習を開けませんでした</h1>
          <p className="app-status-message">{dashboardError}</p>
          <button
            type="button"
            className="primary-action"
            onClick={() => {
              const user = auth.currentUser;
              if (!user) return;
              setLoading(true);
              refreshDashboardData(user.uid).finally(() => setLoading(false));
            }}
          >
            再試行する
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (viewMode) {
      case 'learn':
        return <StudyFlashcard
                  words={learningWords}
                  onBack={handleLearningBack}
                  initialIndex={currentSessionInfo?.startIndex || 0}
                  onSaveLog={handleSaveLog}
                  sessionInfo={currentSessionInfo}
                  onFirstCompletion={currentLearningMode === 'daily' ? () => markDailyTaskAsCompleted(auth.currentUser.uid) : null}
                  learningMode={currentLearningMode}
                  motivationLevel={userData?.goal?.motivationLevel}
                  onWordAnswered={
                    (currentLearningMode === 'daily' || currentLearningMode === 'extra') && dailyPlan.dateKey
                      ? (wordId) => markNewWordAnswered(auth.currentUser?.uid, dailyPlan.dateKey, wordId)
                      : undefined
                  }
                />;
      case 'review':
        return <StudyFlashcard
                  words={reviewOverride || dailyPlan.reviewWords}
                  onBack={handleReviewComplete}
                  onSaveLog={handleSaveLog}
                  sessionInfo={currentSessionInfo}
                  learningMode="review"
                  motivationLevel={userData?.goal?.motivationLevel}
                />;
      case 'test':
        return (
          <VocabularyCheckTest
            allWords={testWords}
            onTestComplete={handleTestComplete}
            onCancel={() => setViewMode('select')}
          />
        );
      case 'result':
        const lastResponseTimes = JSON.parse(localStorage.getItem('lastTestResponseTimes') || '[]');
        return (
          <TestResult
            level={testResultLevel}
            onRestart={() => {}}
            responseTimes={lastResponseTimes}
            // 再読み込みしたときは保存済みの値（progress.assessedVocabulary）に戻る
            estimatedVocabulary={testResultVocabulary ?? userData?.progress?.assessedVocabulary}
            ability={testResultAbility ?? userData?.progress?.assessedAbility}
          />
        );
      case 'select':
      default:
        const progressPercentage = userData?.progress?.percentage || 0;

        return (
          <>
            {/* 先生からの小テストは、目標より上に置く（出されたものを最初にやってほしい） */}
            <AssignedQuizCard quizzes={pendingQuizzes} onStart={startAssignedQuiz} />
            <ExamMissedNotice words={examMissed} onReview={startExamMissedReview} onClose={() => setExamMissed([])} />
            <ExamPracticeCard practice={examPractice} onStart={startExamPractice} busyId={practiceBusy} />

            {/* 上から 目標 → ランク → タスク の順に置く。
                何のために学んでいるかを最初に見せる。 */}
            <div className="section-card goal-card">
              {scheduleMetrics ? (
                <>
                  <div className="goal-card__head">
                    <div>
                      <p className="goal-card__eyebrow">目標</p>
                      <p className="goal-card__title">{goalTitle}</p>
                    </div>
                    <button type="button" className="goal-card__edit" onClick={handleResetGoal}>
                      変更
                    </button>
                  </div>
                  <div className={`goal-card__deadline ${scheduleMetrics.status}`}>
                    <span className="goal-card__date">{scheduleMetrics.deadlineLabel}</span>
                    <span className="goal-card__remaining">
                      あと <strong>{scheduleMetrics.remainingDays}</strong> 日
                    </span>
                  </div>
                </>
              ) : (
                <div className="goal-card__head">
                  <div>
                    <p className="goal-card__eyebrow">目標</p>
                    <p className="goal-card__title">目標が未設定です</p>
                  </div>
                  <button type="button" className="goal-card__edit" onClick={handleResetGoal}>
                    設定
                  </button>
                </div>
              )}
            </div>

            <div className="section-card">
              {/* レベルの直接表示をランク表示へ置き換える（計画書12 フェーズ1-2）。
                  現行テストは自己申告型で正式ランク判定には使えないため、
                  既存 level から代表スコアへ写した暫定表示。信頼度は low。 */}
              <RankCard
                score={abilityScore}
                bestRankId={bestRankId}
                /* **測る前も出す。** 以前は測ったあとだけ渡していたので、
                   まだ受けていない生徒の画面に入口が1つも無かった。 */
                onRetest={startCheckTest}
                compact
              />

              {/* 覚えたぶんがテストの値を追い越したら、そう伝える。
                  レベルはテストでしか動かないので、黙っていると進んだ実感が
                  出ない。出題の範囲は測った値のままにしてある。 */}
              {levelAhead && (
                <LevelNudge
                  assessedLevel={testResultLevel}
                  estimatedLevel={estimatedLevel}
                  nextRatio={userData?.progress?.estimatedNextRatio || 0}
                  onRetest={startCheckTest}
                />
              )}

              {/* 学習計画最適化ボタン。見積もりの知らせを出しているときは、
                  同じ「テストを受けて」を二重に出さない。 */}
              {!levelAhead && showRetestPrompt && (
                <div style={{ 
                  marginTop: '12px', 
                  padding: '8px 12px', 
                  backgroundColor: '#fef3c7', 
                  border: '1px solid #f59e0b', 
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  // 390px では「最適化」が「最適／化」に割れる。折り返しを許す。
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div style={{ fontSize: '0.85rem', color: '#92400e', flex: '1 1 180px', minWidth: 0 }}>
                    <span style={{ fontWeight: '500' }}>学習計画を最適化</span>
                    <span style={{ marginLeft: '8px', opacity: 0.8 }}>しばらく実力テストを受けていません</span>
                  </div>
                  <button
                    onClick={startCheckTest}
                    style={{
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                      whiteSpace: 'nowrap'
                    }}
                    onMouseOver={(e) => {
                      e.target.style.backgroundColor = '#d97706';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.backgroundColor = '#f59e0b';
                    }}
                  >
                    最適化
                  </button>
                </div>
              )}

              {/* .progress-bar / .progress-fill は Analytics.css と
                  AdminDashboard.css にも同名があり、後から読まれた方が勝って
                  青いグラデーションが当たっていた。ホーム専用の名前にする。 */}
              <div className="home-progress">
                <div className="home-progress__bar">
                  <div className="home-progress__fill" style={{ width: `${progressPercentage}%` }} />
                </div>
                {/* 以前は「総語彙 7,000 語中 7,952 語」と出しており、
                    語順が逆で目標のほうが多いように読めた。さらに
                    targetVocabulary は総語彙ではなく目標語彙数。 */}
                <div className="home-progress__caption">
                  <span>
                    いま <strong>{userData?.progress?.currentVocabulary?.toLocaleString?.() || 0}</strong> 語
                  </span>
                  <span>
                    目標 {userData?.progress?.targetVocabulary?.toLocaleString?.() || '-'} 語
                    <span className="progress-caption__percent">（{progressPercentage}%）</span>
                  </span>
                </div>

              </div>

              {/* 「今日◯語」は今日のタスクの数字と重なるので置かない。
                  締切と目標は上の目標カードへ移した。 */}

              {/* 「学習ペースと設定」の折りたたみは外した。中身は
                  ペースとやる気レベルの表示と、目標の再設定ボタンだけで、
                  再設定は目標カードへ移した。ペースは「きろく」で見られる。 */}
              <details className="home-details" hidden>
                <summary>学習ペースと設定</summary>
                <div className="home-details__body">
                  {paceSuggestion && paceSuggestion.recommended > 0 && (
                    <p className="home-details__row">
                      <span>学習ペース</span>
                      <span>平均 {paceSuggestion.average.toFixed(1)} 語/日（目安 {paceSuggestion.recommended} 語）</span>
                    </p>
                  )}
                  {userData?.goal?.motivationLevel && (
                    <p className="home-details__row">
                      <span>やる気レベル</span>
                      <span>
                        {getMotivationConfig(userData.goal.motivationLevel).name}
                        {' '}／ 約{getMotivationConfig(userData.goal.motivationLevel).estimatedMinutesPerDay}分/日
                      </span>
                    </p>
                  )}
                  <button className="ghost-button" onClick={handleResetGoal}>
                    目標を再設定する
                  </button>
                </div>
              </details>
            </div>

            <div className="section-card">
              <h3 className="home-section-eyebrow">今日のタスク</h3>
              {dailyPlan.isFeasible === false && (
                <p className="plan-warning" role="status">
                  今の期限だと1日 {dailyPlan.requiredNewWords} 語が必要で、達成が難しい設定です。
                  今日は {dailyPlan.plannedNewWords} 語まで出しています。達成日を見直すか、やる気レベルを上げてください。
                </p>
              )}
              {dailyPlan.isFeasible !== false
                && dailyPlan.requiredNewWords > dailyPlan.preferredNewWords
                && dailyPlan.preferredNewWords > 0 && (
                <p className="plan-notice" role="status">
                  期限に間に合わせるため、今日は希望の {dailyPlan.preferredNewWords} 語より多い
                  {' '}{dailyPlan.plannedNewWords} 語を出しています。
                </p>
              )}
              {/* 選んだ教材の語を全部学び終えた。**黙って新規0にしない** */}
              {dailyPlan.newWordSourceFinished && (
                <p className="plan-notice" role="status">
                  「{dailyPlan.newWordSourceTitle}」の単語はすべて学習しました。
                  「目標を再設定する」から、次の教材を選べます。
                </p>
              )}
               <div className="task-cards-container">
                  {/* 今日のぶんが終わっていても、前倒しできる語が無ければ
                      「おかわり 0」を出さない。押しても
                      「追加の単語はありません」と言うだけの札になっていた。 */}
                  {isDailyTaskCompleted && dailyPlan.extraNewWords.length > 0 ? (
                    <div className="task-card okawari-card" onClick={startExtraNewWords}>
                      <FaMagic className="task-icon okawari-icon" />
                      <div className="task-info">
                        <p>おかわり</p>
                        <span>{dailyPlan.extraNewWords.length}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="task-card" onClick={startDailyNewWords}>
                        <FaBook className="task-icon new-word-icon" />
                        <div className="task-info"><p>新規単語</p><span>{dailyPlan.newWords.length}</span></div>
                    </div>
                  )}
                  <div className="task-card" onClick={startDailyReviewWords}>
                      <FaSyncAlt className="task-icon review-word-icon" />
                      <div className="task-info"><p>復習単語</p><span>{dailyPlan.reviewWords.length}</span></div>
                  </div>
                  {/* 自分で登録した「毎日みたい単語」。0件のときは出さない。
                      使っていない機能で今日のタスクの枠を埋めないため。 */}
                  {bookmarks.length > 0 && (
                    <div className="task-card" onClick={startBookmarkWords}>
                        <FaStar className="task-icon bookmark-word-icon" />
                        <div className="task-info"><p>毎日みる</p><span>{bookmarks.length}</span></div>
                    </div>
                  )}
              </div>
            </div>

            {wordDataError && (
              <div className="section-card word-data-error" role="alert">
                <p>{wordDataError}</p>
                <p className="field-error">
                  単語力チェックと「えらぶ」が使えません。今日の学習プランはそのまま進められます。
                </p>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => loadMasterWords({ force: true }).catch(() => {})}
                >
                  単語データを読み込み直す
                </button>
              </div>
            )}

            {/* 「今日やること」の帯は外した。すぐ上の「今日のタスク」が
                同じ新規◯語・復習◯語を出していて重複していたため（計画書12.3）。
                完了したときだけ、ねぎらいを一言だけ出す。 */}
            {outstandingSummary.show
              && !outstandingSummary.hasOutstandingNew
              && !outstandingSummary.hasOutstandingReview && (
              <p className="today-done" role="status">
                今日のタスクは完了しました。おかわり学習で前倒しもできます。
              </p>
            )}



          </>
        );
    }
  };

  // タブバーコンポーネント
  const TabBar = () => (
    <StudentBottomNav activeTab={activeTab} onChange={setActiveTab} />
  );

  // タブ別コンテンツのレンダリング
  const renderTabContent = () => {
    // 面接モードは1画面を占有する。学習カードと同じ扱い。
    if (interviewGrade) {
      return (
        <Suspense fallback={<p className="interview-lead">読み込んでいます…</p>}>
          <EikenInterview grade={interviewGrade} onExit={() => setInterviewGrade(null)} />
        </Suspense>
      );
    }

    if (writingGrade) {
      return (
        <Suspense fallback={<p className="interview-lead">読み込んでいます…</p>}>
          <EikenWriting grade={writingGrade} onExit={() => setWritingGrade(null)} />
        </Suspense>
      );
    }

    // 先生からの小テストを解いているときは、タブに関係なくその画面
    if (viewMode === 'assigned-quiz' && activeQuiz) {
      return (
        <AssignedQuiz
          quiz={activeQuiz}
          uid={userId}
          onExit={() => closeAssignedQuiz(false)}
          onFinished={() => closeAssignedQuiz(true)}
        />
      );
    }

    // フラッシュカードページの場合は、タブに関係なく適切なコンテンツを表示
    if (viewMode === 'learn' || viewMode === 'review' || viewMode === 'test' || viewMode === 'result') {
      return renderContent();
    }
    
    // 通常のタブ表示
    switch (activeTab) {
      case 'home':
        return renderContent();
      case 'story':
        return (
          <>
            {/* 級ごと・カテゴリごとの読みもの。 */}
            <ReadingPanel
              schoolGrade={userData?.grade}
              abilityLevel={testResultLevel}
              goalTargets={userData?.goal?.targets || []}
              userId={auth.currentUser?.uid}
            />
            {/* 月1本のAIストーリー。読みものが揃うまでは出さない。
                消していないので、戻すのは false を外すだけ。 */}
            {false && (
              <StoryPanel
                monthlyStory={monthlyStory}
                pastStories={pastStories}
                storiesLoading={storiesLoading}
                isGeneratingStory={isGeneratingStory}
                storyError={storyError}
                onGenerate={handleGenerateStory}
              />
            )}
          </>
        );
      case 'free-study':
        return renderFreeStudyContent();
      case 'analytics':
        return renderAnalyticsContent();
      default:
        return renderContent();
    }
  };

  // 詳細分析コンポーネント

  // 詳細分析タブのコンテンツ
  const renderAnalyticsContent = () => (
    <AnalyticsPanel
      onNavigateTab={setActiveTab}
      onStartTest={startCheckTest}
    />
  );

  // 長文タブのコンテンツ

  /** 語数。単語データを読む前は数えられないので null。0語の級を隠す判定にも使う。 */
  const wordCountOf = (textbookId) =>
    masterWords.length === 0 ? null : getTextbookWordCount(textbookId, masterWords, textbookCounts);

  /** 「おすすめ」バッジの強さ。今の力に合っていなければ null。 */
  const recommendationOf = (textbookId) => {
    if (!isRecommendedTextbook(textbookId, testResultLevel, userData)) return null;
    const match = getRecommendedLevels(testResultLevel).recommended
      .find((rec) => isRecommendedTextbook(textbookId, rec.level, userData));
    return match ? match.priority : 'medium';
  };

  /** 戻るボタンの右に出す、今いる場所の名前。 */
  const freeStudyTitle = {
    eiken: '英検',
    'eiken-words': '英検の単語',
    'eiken-interview': '英検 二次試験（面接）',
    'eiken-writing': '英検 ライティング',
    books: '教材で選ぶ',
    'textbook-grade': '学校の教科書',
    'textbook-pages': `Sunshine ${gradeOfSunshineId(selectedTextbookId) ?? ''}年`,
  }[selectionMode]
    || freeStudyOptions.find(opt => opt.id === selectedTextbookId)?.label
    || selectedTextbookId;

  // 自由学習タブのコンテンツ
  const renderFreeStudyContent = () => (
    <div className="free-study-tab-content">
            <div className="section-card">
              {/* 見出しと「選択中の教材」を横に並べると、狭い幅で本文に
                  重なっていた。縦に積んで、先へ進んだあとは説明文を出さない。 */}
              {selectionMode === 'main' ? (
                <div className="free-study-head">
                  <h3 className="home-section-eyebrow">えらぶ</h3>
                  <p className="tile-caption">やりたいところを選んで、自分のペースで進められます。</p>
                </div>
              ) : (
                <div className="free-study-head free-study-head--selected">
                  <button
                    type="button"
                    className="free-study-back"
                    onClick={handleBackToMainMenu}
                    aria-label="ひとつ前に戻る"
                  >
                    <FaArrowLeft aria-hidden="true" />
                  </button>
                  <div>
                    <p className="home-section-eyebrow">えらぶ</p>
                    <p className="free-study-title">{freeStudyTitle}</p>
                  </div>
                </div>
              )}

              {selectionMode !== 'filter' ? (
                <FreeStudyMenu
                  mode={selectionMode}
                  onNavigate={setSelectionMode}
                  eikenOptions={freeStudyOptions.filter((option) => option.group === 'eiken')}
                  interviewGrades={INTERVIEW_GRADES}
                  books={BOOKS}
                  selectedBook={getBook(selectedTextbookId)}
                  wordCountOf={wordCountOf}
                  recommendationOf={recommendationOf}
                  onSelectTextbook={handleSelectTextbook}
                  onSelectInterview={setInterviewGrade}
                  onSelectWriting={setWritingGrade}
                  onSelectBook={handleSelectBook}
                  onSelectRange={startBookRange}
                  textbookCards={textbookCards}
                  textbookError={textbookError}
                  textbookGrade={gradeOfSunshineId(selectedTextbookId)}
                  onSelectTextbookGrade={handleSelectTextbookGrade}
                  onStartTextbookPages={startTextbookPages}
                />
              ) : (
                <>
                  <div className="free-study-tabs" role="tablist" aria-label="絞り込み">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filterTab === 'level'}
                      className="free-study-tab"
                      onClick={() => setFilterTab('level')}
                    >
                      レベル別
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filterTab === 'pos'}
                      className="free-study-tab"
                      onClick={() => setFilterTab('pos')}
                    >
                      品詞別
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filterTab === 'theme'}
                      className="free-study-tab"
                      onClick={() => setFilterTab('theme')}
                    >
                      意味別
                    </button>
                  </div>
                  <div className="selection-grid">
              {filterTab === 'level' && !showSubLevels && (
                Object.entries(
                  selectedTextbookId === 'osaka-koukou-nyuushi' ? osakaLevelDescriptions : 
                  selectedTextbookId === 'highschool-english' ? highschoolLevelDescriptions :
                  (selectedTextbookId && selectedTextbookId.startsWith('eiken-') ? eikenLevelDescriptions : levelDescriptions)
                ).map(([level, info]) => {
                  let levelWords = [];
                  
                  if (selectedTextbookId && selectedTextbookId.startsWith('eiken-')) {
                    // 英検級の場合はeikenLevelsを基準にフィルタ
                    const levelPart = selectedTextbookId.split('-')[1];
                    let targetEikenLevel;
                    if (levelPart === 'pre2') {
                      targetEikenLevel = 'pre2';
                    } else if (levelPart === 'pre1') {
                      targetEikenLevel = 'pre1';
                    } else {
                      targetEikenLevel = parseInt(levelPart);
                    }
                    
                    // 英検級の順序（下位から上位へ）
                    const eikenLevelOrder = [5, 4, 3, 'pre2', 2, 'pre1', 1];
                    const targetIndex = eikenLevelOrder.indexOf(targetEikenLevel);
                    
                    if (targetIndex !== -1) {
                      // 選択された級以下の全ての級を含む（復習として下位級も含む）
                      // 英検2級を選択した場合、英検5級〜英検2級までを復習として表示
                      const allowedLevels = eikenLevelOrder.slice(0, targetIndex + 1);
                      
                      // 現在の表示レベルに対応する英検級を取得
                      const currentLevelEiken = eikenLevelOrder[parseInt(level) - 1];
                      
                      // 現在の表示レベルが選択された級以下の場合のみ表示
                      if (currentLevelEiken && allowedLevels.includes(currentLevelEiken)) {
                        // 一番やさしい級にだけ属させる。複数の級に入っている語を
                        // 級ごとに出すと、同じ単語を何度も学ぶことになる。
                        levelWords = allWords.filter(
                          (word) => easiestEikenLevel(word) === currentLevelEiken
                        );
                        
                        logger.debug(`🔍 英検${currentLevelEiken}級フィルタリング:`, {
                          選択された級: targetEikenLevel,
                          表示レベル: level,
                          対応英検級: currentLevelEiken,
                          フィルタ後単語数: levelWords.length,
                          サンプル単語: levelWords.slice(0, 3).map(w => ({ word: w.word, eikenLevels: w.eikenLevels }))
                        });
                      }
                    }
                  } else if (selectedTextbookId === 'highschool-english') {
                    levelWords = allWords.filter(word => inHighschoolCard(word, level));
                  } else if (selectedTextbookId === 'osaka-koukou-nyuushi') {
                    // 大阪府公立入試英単語の場合はlevelフィールドを基準にフィルタ
                    levelWords = allWords.filter(word => word.level === parseInt(level));
                    logger.debug(`🔍 大阪府公立入試英単語レベル${level}フィルタリング:`, {
                      全単語数: allWords.length,
                      フィルタ後単語数: levelWords.length,
                      サンプル単語: levelWords.slice(0, 3).map(w => ({ word: w.word, level: w.level }))
                    });
                  } else {
                    // その他の教材の場合はlevelフィールドを基準にフィルタ
                    levelWords = allWords.filter(word => word.level === parseInt(level));
                    logger.debug(`🔍 通常レベル${level}フィルタリング:`, {
                      全単語数: allWords.length,
                      フィルタ後単語数: levelWords.length,
                      サンプル単語: levelWords.slice(0, 3).map(w => ({ word: w.word, level: w.level }))
                    });
                  }
                  
                        const progressKey = `${selectedTextbookId}_${levelProgressKey(selectedTextbookId, level)}`;
                        const lastIndex = freeStudyProgress[progressKey] || 0;
                        const progressText = lastIndex > 0 ? `前回: ${lastIndex + 1}/${levelWords.length}単語まで` : '未学習';
                        
                  // 大阪府公立入試英単語の場合、レベル8-10はグレー表示（2級レベルまで）
                  const isOsakaKoukou = selectedTextbookId === 'osaka-koukou-nyuushi';
                  const isUnusedLevel = isOsakaKoukou && (level >= 8);
                  
                  // 英検教材の場合、選択された級より上位のレベルはグレー表示
                  let isEikenUnusedLevel = false;
                  if (selectedTextbookId && selectedTextbookId.startsWith('eiken-')) {
                    const levelPart = selectedTextbookId.split('-')[1];
                    let targetEikenLevel;
                    if (levelPart === 'pre2') {
                      targetEikenLevel = 'pre2';
                    } else if (levelPart === 'pre1') {
                      targetEikenLevel = 'pre1';
                    } else {
                      targetEikenLevel = parseInt(levelPart);
                    }
                    
                    const eikenLevelOrder = [5, 4, 3, 'pre2', 2, 'pre1', 1];
                    const targetIndex = eikenLevelOrder.indexOf(targetEikenLevel);
                    const currentLevelEiken = eikenLevelOrder[parseInt(level) - 1];
                    
                    // 現在の表示レベルが選択された級より上位の場合はグレー表示
                    isEikenUnusedLevel = currentLevelEiken && targetIndex !== -1 && 
                      eikenLevelOrder.indexOf(currentLevelEiken) > targetIndex;
                  }
                  
                  // 収録語が1語も無いレベルはカードごと出さない。
                  // 単語データのレベル体系は1〜7で、レベル8〜10には単語が存在しない。
                  // 「対象外」と表示すべきレベルは別で判定しているので、それらは残す。
                  if (levelWords.length === 0 && !isUnusedLevel && !isEikenUnusedLevel) {
                    return null;
                  }

                  // 推奨判定
                  const isRecommended = isRecommendedLevel(Number(level), testResultLevel);
                  const recommendations = getRecommendedLevels(testResultLevel);
                  const recommendationType = recommendations.recommended.find(rec => rec.level === Number(level));
                  const priority = recommendationType ? recommendationType.priority : 'medium';
                  
                                  // 詳細デバッグログ（すべてのレベルで出力）
                  logger.debug('🎯 親レベル推奨判定詳細:', {
                    level: Number(level),
                    testResultLevel,
                    isRecommended,
                    priority,
                    isUnusedLevel,
                    isEikenUnusedLevel,
                    selectedTextbookId,
                    recommendations: recommendations.recommended,
                    recommendationType,
                    willShowBadge: isRecommended && !isUnusedLevel && !isEikenUnusedLevel,
                    userData: userData ? 'loaded' : 'not loaded',
                    userLevel: userData?.level
                        });

                        // その教材に含まれないレベルは出さない。英検5級を選ぶと
                        // 「対象外」の行が6つ並んで画面を埋めていた。
                        if (isUnusedLevel || isEikenUnusedLevel) return null;

                        return (
                    <div key={level} style={{ position: 'relative' }}>
                          <button
                        className="selection-card"
                        disabled={!levelWords.length || isUnusedLevel || isEikenUnusedLevel}
                        onClick={() => {
                          if (!isUnusedLevel && !isEikenUnusedLevel) {
                            if (selectedTextbookId && selectedTextbookId.startsWith('eiken-')) {
                              // 英検教材の場合は親レベル選択
                              handleParentLevelClick(Number(level));
                            } else {
                              // その他の教材は直接学習開始
                              startLearning('level', Number(level));
                            }
                          }
                        }}
                      >
                      {/* 中央寄せで4行積むと階層が読めなかった。
                          左に名前と目安、右に語数と進み具合を置く。
                          「(目安: 1,335語)」は収録語数と紛らわしいので外した。 */}
                      <span className="selection-card-main">
                        <span className="selection-card-titles">
                          <span className="selection-card-level">{info.label}</span>
                          {info.priority === 'high' && (
                            <RecommendationBadge type="priority" priority="high" />
                          )}
                          {isRecommended && !isUnusedLevel && !isEikenUnusedLevel && (
                            <RecommendationBadge type="level" priority={priority} />
                          )}
                        </span>
                        <span className="selection-card-desc">{info.equivalent}</span>
                      </span>
                      <span className="selection-card-side">
                        <span className="selection-card-meta">
                          {isUnusedLevel || isEikenUnusedLevel ? '対象外' : `${levelWords.length}語`}
                        </span>
                        <span className="selection-card-progress">
                          {isUnusedLevel || isEikenUnusedLevel ? '対象外' : progressText}
                        </span>
                      </span>
                          </button>
                    </div>
                        );
                      })
                    )}
              
              {/* サブレベル表示（親レベル選択時） */}
              {filterTab === 'level' && showSubLevels && selectedParentLevel && (
                (() => {
                  // 親レベル範囲内の単語を取得
                  let parentLevelWords = [];
                  
                  if (selectedTextbookId && selectedTextbookId.startsWith('eiken-')) {
                    // 英検教材の場合：選択された親レベル（selectedParentLevel）に対応する英検級の単語を取得
                    const eikenLevelOrder = [5, 4, 3, 'pre2', 2, 'pre1', 1];
                    const targetEikenLevel = eikenLevelOrder[selectedParentLevel - 1];
                    
                    logger.debug('🔍 英検級フィルタリング:', {
                      selectedTextbookId,
                      selectedParentLevel,
                      targetEikenLevel,
                      allWordsLength: allWords.length
                    });
                    
                    parentLevelWords = allWords.filter(word => {
                      // eikenLevelsフィールドがある場合（wordsData.jsonから取得した単語）
                      if (word.eikenLevels && Array.isArray(word.eikenLevels)) {
                        return word.eikenLevels.includes(targetEikenLevel);
                      }
                      
                      // eikenLevelsフィールドがない場合（words.jsonから取得した単語）
                      // levelフィールドを英検級にマッピングして判定
                      if (word.level) {
                        const levelToEikenMapping = {
                          1: 5, 2: 4, 3: 3, 4: 2, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1
                        };
                        const mappedEikenLevel = levelToEikenMapping[word.level];
                        
                        if (typeof targetEikenLevel === 'number') {
                          return mappedEikenLevel === targetEikenLevel;
                        } else if (targetEikenLevel === 'pre2') {
                          return mappedEikenLevel === 4; // 準2級はレベル4
                        } else if (targetEikenLevel === 'pre1') {
                          return mappedEikenLevel === 7; // 準1級はレベル7
                        }
                      }
                      
                      return false;
                    });
                    
                    logger.debug(`英検${targetEikenLevel}級の単語数:`, parentLevelWords.length);
                    
                    // サンプル単語を表示
                    const sampleWords = parentLevelWords.slice(0, 5).map(w => w.word);
                    logger.debug(`英検${targetEikenLevel}級のサンプル単語:`, sampleWords);
                  } else {
                    // その他の教材の場合：選択された親レベルの単語を取得
                    parentLevelWords = allWords.filter(word => word.level === selectedParentLevel);
                    logger.debug(`レベル${selectedParentLevel}の単語数:`, parentLevelWords.length);
                  }
                  
                  // levelに従ってランク分け
                  const levelGroups = {};
                  parentLevelWords.forEach(word => {
                    const level = word.level || 1;
                    if (!levelGroups[level]) {
                      levelGroups[level] = [];
                    }
                    levelGroups[level].push(word);
                  });
                  
                  // レベル順にソート
                  const sortedLevels = Object.keys(levelGroups).sort((a, b) => parseInt(a) - parseInt(b));
                  
                  logger.debug('サブレベル表示のランク分け:', {
                    selectedTextbookId,
                    selectedParentLevel,
                    parentLevelWordsCount: parentLevelWords.length,
                    levelGroups: Object.keys(levelGroups).map(level => ({
                      level: parseInt(level),
                      count: levelGroups[level].length
                    }))
                  });
                  
                  // デバッグ：各レベルのサンプル単語を表示
                  Object.keys(levelGroups).forEach(level => {
                    const sampleWords = levelGroups[level].slice(0, 3).map(w => w.word);
                    logger.debug(`レベル${level}のサンプル単語:`, sampleWords);
                  });
                  
                  return (
                    <>
                      {/* 戻るボタン */}
                      <div style={{ gridColumn: '1 / -1', marginBottom: '20px' }}>
                        <button
                          onClick={resetParentLevelSelection}
                          style={{
                            padding: '10px 20px',
                            backgroundColor: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          ← 親レベル選択に戻る
                        </button>
                      </div>
                      
                      {/* サブレベルカード */}
                      {sortedLevels.map(level => {
                        const levelWords = levelGroups[level];
                        const progressKey = `${selectedTextbookId}_${levelProgressKey(selectedTextbookId, level)}`;
                        const lastIndex = freeStudyProgress[progressKey] || 0;
                        const progressText = lastIndex > 0 ? `前回: ${lastIndex + 1}/${levelWords.length}単語まで` : '未学習';
                        
                        
                        // 無効化判定（大阪府公立入試のみ適用）
                        const isOsakaKoukou = selectedTextbookId === 'osaka-koukou-nyuushi';
                        const isUnusedLevel = isOsakaKoukou && (level >= 8);
                        
                        // 英検教材のサブレベルは無効化しない（選択された級内のレベル別表示のため）
                        const isEikenUnusedLevel = false;
                        
                        // 推奨判定
                        // 親レベル（英検の級）が推奨されていれば、その中のレベルも推奨
                        const isRecommended = isRecommendedLevel(selectedParentLevel, testResultLevel);
                        const recommendations = getRecommendedLevels(testResultLevel);
                        const recommendationType = recommendations.recommended.find(rec => 
                          isRecommendedLevel(selectedParentLevel, rec.level)
                        );
                        const priority = recommendationType ? recommendationType.priority : 'medium';
                        
                        // デバッグログ
                        if (isRecommended) {
                          logger.debug('🎯 子レベル推奨バッジ表示:', {
                            level,
                            selectedParentLevel,
                            testResultLevel,
                            isRecommended,
                            priority,
                            selectedTextbookId
                          });
                        }
                        
                        return (
                          <div key={level} style={{ position: 'relative' }}>
                            <button
                              className={`selection-card ${isUnusedLevel || isEikenUnusedLevel ? 'selection-card-disabled' : ''}`}
                              disabled={!levelWords.length || isUnusedLevel || isEikenUnusedLevel}
                              onClick={() => {
                                if (!isUnusedLevel && !isEikenUnusedLevel) {
                                  handleSubLevelClick(level);
                                }
                              }}
                            >
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '8px',
                              justifyContent: 'flex-start',
                              flexWrap: 'wrap'
                            }}>
                              <span className="selection-card-level">
                                {`レベル ${level}`}
                              </span>
                              {isRecommended && !isUnusedLevel && !isEikenUnusedLevel ? (
                                <RecommendationBadge type="sublevel" priority={priority} />
                              ) : (
                                <span style={{
                                  backgroundColor: '#3b82f6',
                                  color: 'white',
                                  fontSize: '0.7em',
                                  padding: '2px 6px',
                                  borderRadius: '10px',
                                  fontWeight: 'bold'
                                }}>
                                  ランク
                                </span>
                              )}
                            </div>
                            <span className="selection-card-desc">
                              {selectedTextbookId && selectedTextbookId.startsWith('eiken-') 
                                ? `英検${selectedTextbookId.split('-')[1]}級レベル内`
                                : `レベル${selectedParentLevel}内`
                              }
                            </span>
                            <span className="selection-card-meta">
                              {isUnusedLevel || isEikenUnusedLevel ? '対象外' : `単語数: ${levelWords.length}語`}
                            </span>
                            <span className="selection-card-progress">{isUnusedLevel || isEikenUnusedLevel ? '対象外' : progressText}</span>
                            </button>
                          </div>
                        );
                      })}
                    </>
                  );
                })()
              )}
              
                    {filterTab === 'pos' && (
                (() => {
                  // デバッグ: サンプル単語の品詞データを確認
                  if (allWords.length > 0) {
                    logger.debug('サンプル単語の品詞データ:', allWords.slice(0, 5).map(w => ({
                      word: w.word,
                      partOfSpeech: w.partOfSpeech,
                      type: typeof w.partOfSpeech
                    })));
                  }
                  return posDisplayOrder.map(pos => (
                        <button
                          key={pos}
                          className="selection-card"
                          onClick={() => startLearning('pos', pos)}
                        >
                    <span className="selection-card-level">{posLabels[pos]}</span>
                    <span className="selection-card-desc">{posDescriptions[pos]}</span>
                    <span className="selection-card-meta">
                      単語数: {(() => {
                        const posAbbr = posMap[pos] || pos;
                        const count = allWords.filter(w => {
                          return w.partOfSpeech && w.partOfSpeech.includes(posAbbr);
                        }).length;
                        logger.debug(`品詞 ${pos} (${posAbbr}): ${count}語`);
                        return count;
                      })()}語
                    </span>
                        </button>
                  ));
                })()
                    )}
                    {filterTab === 'theme' && (
                Object.entries(themeGroups).map(([theme, { words }]) => (
                          <button
                    key={theme}
                            className="selection-card"
                    onClick={() => startLearning('theme', theme)}
                  >
                    <span className="selection-card-level">{themeLabels[theme]}</span>
                    <span className="selection-card-desc">{themeDescriptions[theme]}</span>
                    <span className="selection-card-meta">
                      単語数: {words.length}語
                    </span>
                          </button>
                ))
                    )}
                  </div>
                </>
              )}
            </div>
    </div>
  );

  // フラッシュカード・単語帳・面接では下部タブを出さない。出さないなら、
  // タブのぶんの余白（.dashboard-container の padding-bottom）も空けない。
  const showTabBar = !interviewGrade && !writingGrade
    && viewMode !== 'learn' && viewMode !== 'review' && viewMode !== 'test' && viewMode !== 'result';

  return (
    <div className={showTabBar ? 'dashboard-container' : 'dashboard-container has-no-tab-bar'}>
      {/* 初回だけ。読み込みを待つ間に、操作を一度だけ見せる。 */}
      {onboardingOverlay}

      <StudentHeader userName={userData?.name} onLogout={handleLogout} onShowGuide={reopenOnboarding} />
      
      {/* 初回テストと学習計画最適化のボタン */}
      {testResultLevel === 0 && viewMode !== 'learn' && viewMode !== 'review' && viewMode !== 'test' && viewMode !== 'result' && (
        <div className="initial-test-banner" style={{
          backgroundColor: '#3b82f6',
          color: 'white',
          padding: '16px 20px',
          margin: '0 15px 20px 15px',   // .card-main の padding と揃える（20px だと他のカードと5pxズレる）
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          // 390px では横に並びきらず、ボタンが「テスト／を開始」と2行に割れる。
          // 折り返しを許して、入らないときはボタンを次の行へ送る。
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: 'bold' }}>
              単語力チェックテスト
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>
              あなたの現在の単語力を診断して、最適な学習計画を作成します
            </p>
          </div>
          <button
            onClick={startCheckTest}
            style={{
              backgroundColor: 'white',
              color: '#3b82f6',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#f8fafc';
              e.target.style.transform = 'translateY(-1px)';
              e.target.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = 'white';
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
            }}
          >
            テストを開始
          </button>
              </div>
            )}
      
      <main className="card-main">
        {renderTabContent()}
      </main>
      {/* フラッシュカードページと面接モードではタブバーを非表示 */}
      {showTabBar && <TabBar />}
    </div>
  );
}