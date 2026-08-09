import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from './firebaseConfig';
import './Analytics.css';
import { collection, getDocs, doc, getDoc, setDoc, query, orderBy, updateDoc, increment, where } from "firebase/firestore";
import { generateDailyPlan } from './logic/learningPlanner';
import { addWordToReview } from './logic/reviewLogic';
import { updateProgressPercentage } from './logic/progressLogic';
import { logStudySession } from './logic/studyLogger';
import { saveFreeStudyProgress, getFreeStudyProgress, getAllFreeStudyProgress } from './logic/freeStudyProgress';
import VocabularyCheckTest from './VocabularyCheckTest';
import TestResult from './TestResult';
import LearningFlashcard from './LearningFlashcard';
import { buildThemeGroups, themeLabels, themeDescriptions } from './logic/themeMatcher';
import AnalyticsPanel from './components/student/AnalyticsPanel';
import StoryPanel from './components/student/StoryPanel';
import { useBookmarks } from './logic/useBookmarks';
import ReviewFlashcard from './ReviewFlashcard';
import LevelBadge from './LevelBadge';
import { FaBook, FaSyncAlt, FaMagic, FaStar } from 'react-icons/fa';
import { getTodayKey, getCurrentMonthKey, getTokyoDateKey, parseLocalDate } from './logic/dateKeys';
import { getRecommendedTextbooks, toGoalIds, getMotivationConfig, LEVELS } from './config';
import { normalizeStory, isDisplayableStory } from './logic/storyView';
import { StudentHeader, StudentBottomNav } from './components/layout/StudentShell';
import { loadWordMaster, loadManifest } from './logic/wordMaster';
import logger from './logic/logger';

// 英検教材の単語数を計算する関数（実際の収録単語数）
const getEikenWordCount = (textbookId, wordsData = []) => {
  if (!wordsData.length) return 0;
  
  const levelPart = textbookId.split('-')[1];
  let targetEikenLevel;
  if (levelPart === 'pre2') {
    targetEikenLevel = 'pre2';
  } else if (levelPart === 'pre1') {
    targetEikenLevel = 'pre1';
  } else {
    targetEikenLevel = parseInt(levelPart);
  }
  
  logger.debug('🎯 英検教材単語数計算:', { textbookId, targetEikenLevel });
  
  // 実際の収録単語数（当該級 + 当該級未満、重複除去後）
  let actualCount = 0;
  
  if (wordsData && Array.isArray(wordsData)) {

    // 重複除去のためのSet
    const seenWords = new Set();
    
    if (targetEikenLevel === 5) {
      // 英検5級：5級のみ
      wordsData.forEach(word => {
        if (word.eikenLevels && word.eikenLevels.includes(5) && !seenWords.has(word.word)) {
          seenWords.add(word.word);
          actualCount++;
        }
      });
    } else if (targetEikenLevel === 4) {
      // 英検4級：4級 + 5級
      wordsData.forEach(word => {
        if (word.eikenLevels && (word.eikenLevels.includes(4) || word.eikenLevels.includes(5)) && !seenWords.has(word.word)) {
          seenWords.add(word.word);
          actualCount++;
        }
      });
    } else if (targetEikenLevel === 3) {
      // 英検3級：3級 + 4級 + 5級
      wordsData.forEach(word => {
        if (word.eikenLevels && (word.eikenLevels.includes(3) || word.eikenLevels.includes(4) || word.eikenLevels.includes(5)) && !seenWords.has(word.word)) {
          seenWords.add(word.word);
          actualCount++;
        }
      });
    } else if (targetEikenLevel === 'pre2') {
      // 英検準2級：準2級 + 3級 + 4級 + 5級
      wordsData.forEach(word => {
        if (word.eikenLevels && (word.eikenLevels.includes('pre2') || word.eikenLevels.includes(3) || word.eikenLevels.includes(4) || word.eikenLevels.includes(5)) && !seenWords.has(word.word)) {
          seenWords.add(word.word);
          actualCount++;
        }
      });
    } else if (targetEikenLevel === 2) {
      // 英検2級：2級 + 準2級 + 3級 + 4級 + 5級
      wordsData.forEach(word => {
        if (word.eikenLevels && (word.eikenLevels.includes(2) || word.eikenLevels.includes('pre2') || word.eikenLevels.includes(3) || word.eikenLevels.includes(4) || word.eikenLevels.includes(5)) && !seenWords.has(word.word)) {
          seenWords.add(word.word);
          actualCount++;
        }
      });
    } else if (targetEikenLevel === 'pre1') {
      // 英検準1級：準1級 + 2級 + 準2級 + 3級 + 4級 + 5級
      wordsData.forEach(word => {
        if (word.eikenLevels && (word.eikenLevels.includes('pre1') || word.eikenLevels.includes(2) || word.eikenLevels.includes('pre2') || word.eikenLevels.includes(3) || word.eikenLevels.includes(4) || word.eikenLevels.includes(5)) && !seenWords.has(word.word)) {
          seenWords.add(word.word);
          actualCount++;
        }
      });
    } else if (targetEikenLevel === 1) {
      // 英検1級：1級のみ（現在は存在しない）
      wordsData.forEach(word => {
        if (word.eikenLevels && word.eikenLevels.includes(1) && !seenWords.has(word.word)) {
          seenWords.add(word.word);
          actualCount++;
        }
      });
    }
    
    logger.debug(`英検${levelPart}級の実際の収録単語数:`, actualCount);
  }
  
  return actualCount;
};

// 各教材の単語数を計算する関数
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
      // 固定値 1969 が書かれていたが、Firestore の収録分をマスターへ
      // 取り込んだあとは 3,193 語になり、表示だけ古いままだった。
      // 教材ごとの件数は manifest から取る。
      return textbookCounts[textbookId] ?? 0;
    
    case 'highschool-english':
      // 高校英語：wordsData.jsonからレベル5-7の単語をカウント
      if (!wordsData.length) return 0;
      const highschoolCount = wordsData.filter(word => {
        const level = word.level || 1;
        return level >= 5 && level <= 7;
      }).length;
      logger.debug('🎓 高校英語単語数:', highschoolCount);
      return highschoolCount;
    
    
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

  // 子レベルの推奨判定関数
  const isRecommendedSubLevel = (subLevel, parentLevel, testLevel) => {
    if (!testLevel || testLevel === 0) return false;
    
    // 親レベルが推奨されている場合、その子レベルも推奨
    if (isRecommendedLevel(parentLevel, testLevel)) {
      return true;
    }
    
    // 特定のサブレベルが推奨される場合（例：7Aは2級レベル）
    const subLevelMapping = {
      '5A': 4, '5B': 5, '5C': 5,
      '6A': 5, '6B': 6, '6C': 6,
      '7A': 6, '7B': 7, '7C': 7
    };
    
    const mappedLevel = subLevelMapping[subLevel];
    if (mappedLevel && Math.abs(mappedLevel - testLevel) <= 1) {
      return true;
    }
    
    return false;
  };

  // 大阪府公立入試教材を推奨すべき目標かどうか。
  // 旧IDの手書きリスト（hs1〜hs5）ではなく、共通定義の recommendedTextbooks を見る。
  const isHighSchoolExamTarget = (userData) => {
    if (!userData?.goal?.targets || !Array.isArray(userData.goal.targets)) {
      return false;
    }
    return getRecommendedTextbooks(toGoalIds(userData.goal.targets)).includes('osaka-koukou-nyuushi');
  };

// 推奨バッジコンポーネント（カード内部表示用）
const RecommendationBadge = ({ type, priority = 'medium' }) => {
  const getBadgeStyle = () => {
    switch (priority) {
      case 'high':
        return {
          backgroundColor: 'linear-gradient(135deg, #ff6b6b, #ee5a52)',
          color: 'white',
          text: '推奨',
          icon: null,
          borderColor: '#dc2626'
        };
      case 'medium':
        return {
          backgroundColor: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          color: 'white',
          text: 'おすすめ',
          icon: null,
          borderColor: '#d97706'
        };
      case 'low':
        return {
          backgroundColor: 'linear-gradient(135deg, #10b981, #059669)',
          color: 'white',
          text: '復習',
          icon: null,
          borderColor: '#047857'
        };
      default:
        return {
          backgroundColor: 'linear-gradient(135deg, #6b7280, #4b5563)',
          color: 'white',
          text: '推奨',
          icon: null,
          borderColor: '#374151'
        };
    }
  };

  const badgeStyle = getBadgeStyle();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: badgeStyle.backgroundColor,
        color: badgeStyle.color,
        fontSize: '11px',
        fontWeight: '600',
        padding: '4px 8px',
        borderRadius: '12px',
        border: `1px solid ${badgeStyle.borderColor}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        whiteSpace: 'nowrap',
        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
        letterSpacing: '0.025em'
      }}
    >
      {/* 記号を出さず、文言と枠の色だけで区別する（絵文字を使わない方針） */}
      <span>{badgeStyle.text}</span>
    </div>
  );
};

// 既存の定数やヘルパー関数（すべて維持）
const freeStudyOptions = [
  { id: 'osaka-koukou-nyuushi', label: '大阪府公立入試英単語', textbooks: ['osaka-koukou-nyuushi'], levels: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'highschool-english', label: '高校英語', textbooks: ['highschool-english'], levels: [1, 2, 3] },
  { id: 'eiken-5', label: '英検5級', textbooks: ['highschool-english'] },
  { id: 'eiken-4', label: '英検4級', textbooks: ['highschool-english'] },
  { id: 'eiken-3', label: '英検3級', textbooks: ['highschool-english'] },
  { id: 'eiken-pre2', label: '英検準2級', textbooks: ['highschool-english'] },
  { id: 'eiken-2', label: '英検2級', textbooks: ['highschool-english'] },
  { id: 'eiken-pre1', label: '英検準1級', textbooks: ['highschool-english'] }
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

// 高校英語専用のレベル定義
const highschoolLevelDescriptions = {
    1: { label: "高校基礎", equivalent: "英検準2級 / A2-B1", wordsRequired: 1335 },
    2: { label: "高校標準", equivalent: "英検2級 / B1-B2", wordsRequired: 2941 },
    3: { label: "高校応用", equivalent: "英検準1級 / B2-C1", wordsRequired: 1658 }
};


// 高校英語のサブレベル説明を生成する関数
const getHighschoolSubLevelDescription = (subLevel) => {
  const level = parseInt(subLevel.substring(0, 1));
  const subLevelLetter = subLevel.substring(1);
  
  if (level === 5) {
    // レベル5: 英検準2級レベル
    const subLevelNames = { A: '基礎', B: '標準', C: '応用' };
    return `英検準2級${subLevelNames[subLevelLetter]}`;
  } else if (level === 6) {
    // レベル6: 英検2級レベル
    const subLevelNames = { A: '基礎', B: '標準', C: '応用' };
    return `英検2級${subLevelNames[subLevelLetter]}`;
  } else if (level === 7) {
    // レベル7: 7Aは英検2級、7B・7Cは英検準1級
    if (subLevelLetter === 'A') {
      return '英検2級応用';
    } else {
      const subLevelNames = { B: '基礎', C: '応用' };
      return `英検準1級${subLevelNames[subLevelLetter]}`;
    }
  }
  
  return `高校英語${subLevel}`;
};


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
  const [testResultLevel, setTestResultLevel] = useState(0);
  
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
    return loadWordMaster({ force })
      .then((words) => {
        setMasterWords(words);
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
        
        const plan = await generateDailyPlan(data, uid);
        setDailyPlan(plan);

        // Check for daily completion
        const todayStr = getTodayKey();
        const dailyCompletionDocRef = doc(db, 'users', uid, 'dailyCompletion', todayStr);
        const dailyCompletionDoc = await getDoc(dailyCompletionDocRef);
        setIsDailyTaskCompleted(dailyCompletionDoc.exists());

        // Pace analysis from recent logs (過去5日)
        const lookbackDate = new Date();
        lookbackDate.setDate(lookbackDate.getDate() - 5);

        try {
          const logsRef = collection(db, 'users', uid, 'logs');
          const logsSnapshot = await getDocs(
            query(
              logsRef,
              where('timestamp', '>=', lookbackDate),
              orderBy('timestamp', 'desc')
            )
          );

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

  const handleTestComplete = (finalLevel, responseTimes = []) => {
    logger.debug('🎯 テスト完了処理開始:', finalLevel, responseTimes);
    setTestResultLevel(finalLevel);
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
      
      // 自由学習の場合、進捗も保存
      if (currentLearningMode === 'free' && currentSessionInfo?.filterType === 'level' && selectedTextbookId) {
        const lastIndex = logData.index || 0;
        const level = currentSessionInfo.filterValue.replace('レベル', '');
        
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

  const handleLearningBack = async (incorrectWords, newlyLearnedCount) => {
    const user = auth.currentUser;
    if (!user) return;

    // Handle incorrect words
    if (incorrectWords && incorrectWords.length > 0) {
      // forEach で投げっぱなしにすると、画面遷移で書き込みを取りこぼす（計画書10.2.10）
      await Promise.all(incorrectWords.map(word => addWordToReview(user.uid, word)));
    }

    // Update vocabulary count and progress if new words were learned
    if (newlyLearnedCount > 0) {
      const userDocRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userDocRef, {
          'progress.currentVocabulary': increment(newlyLearnedCount)
        });
        await updateProgressPercentage(user.uid);
      } catch (error) {
        console.error("Failed to update vocabulary count and progress:", error);
      }
    }

    // Refresh dashboard data and reset view
    refreshDashboardData(user.uid);
    // 学習中に登録／解除したぶんをホームの枚数へ反映する
    reloadBookmarks();
    setViewMode('select');
    
    // 自由学習モードの場合は教材のレベル別ページに戻る
    if (currentLearningMode === 'free' && selectedTextbookId) {
      setSelectionMode('filter');
    } else {
      setSelectionMode('main');
    }
  };

  const handleReviewComplete = () => {
    if (auth.currentUser) {
      refreshDashboardData(auth.currentUser.uid);
    }
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
          // 高校英語はマスターのレベル5〜7
          const master = masterWords.length > 0 ? masterWords : await loadMasterWords();

          const highschoolWords = master.filter(word => {
            const level = word.level || 1;
            return level >= 5 && level <= 7;
          });
          
          logger.debug('📚 高校英語単語フィルタ成功:', {
            高校英語単語数: highschoolWords.length,
            サンプル単語: highschoolWords.slice(0, 3).map(w => ({ word: w.word, level: w.level }))
          });
          
          const words = highschoolWords.map((word) => ({ 
            sourceTextbook: 'highschool-english', 
            ...word 
          }));
          combinedWords.push(...words);
          logger.debug(`高校英語から取得した単語数:`, words.length);
        } else {
          // 英検教材の場合はwordsData.jsonとwords.jsonの両方から取得
          if (textbookId.startsWith('eiken-')) {
            logger.debug('🎯 英検教材の処理開始:', textbookId);
            
            // 英検級に応じてフィルタリング
            const levelPart = textbookId.split('-')[1];
            let targetEikenLevel;
            if (levelPart === 'pre2') {
              targetEikenLevel = 'pre2';
            } else if (levelPart === 'pre1') {
              targetEikenLevel = 'pre1';
            } else {
              targetEikenLevel = parseInt(levelPart);
            }
            
            // 1. マスターから取得（eikenLevels フィールドあり）
            const master = masterWords.length > 0 ? masterWords : await loadMasterWords();
            {
              const eikenWordsFromWordsData = master.filter(word => {
                if (word.eikenLevels && Array.isArray(word.eikenLevels)) {
                  return word.eikenLevels.some(level => {
                    if (typeof targetEikenLevel === 'number') {
                      return level <= targetEikenLevel;
                    } else if (targetEikenLevel === 'pre2') {
                      return level <= 4; // 準2級はレベル4
                    } else if (targetEikenLevel === 'pre1') {
                      return level === 'pre1' || level === 2 || level === 'pre2' || level === 3 || level === 4 || level === 5; // 準1級は準1級 + 2級 + 準2級 + 3級 + 4級 + 5級
                    }
                    return false;
                  });
                }
                return false;
              });
              
              
              const wordsFromWordsData = eikenWordsFromWordsData.map((word) => ({ 
                sourceTextbook: textbookId, 
                ...word 
              }));
              combinedWords.push(...wordsFromWordsData);
            }
            
            // 2. words.jsonから取得（levelフィールドで振り分け）
            try {
              const osakaWordsData = await fetch('/data/words-osaka.json').then(res => res.json());
              
              // words.jsonのlevelを英検級にマッピング
              const levelToEikenMapping = {
                1: 5, // レベル1 → 英検5級
                2: 4, // レベル2 → 英検4級
                3: 3, // レベル3 → 英検3級
                4: 2, // レベル4 → 英検準2級
                5: 2, // レベル5 → 英検2級
                6: 1, // レベル6 → 英検準1級
                7: 1, // レベル7 → 英検1級
                8: 1, // レベル8 → 英検1級
                9: 1, // レベル9 → 英検1級
                10: 1 // レベル10 → 英検1級
              };
              
              const eikenWordsFromWords = osakaWordsData.filter(word => {
                const wordLevel = word.level;
                const mappedEikenLevel = levelToEikenMapping[wordLevel];
                
                if (typeof targetEikenLevel === 'number') {
                  return mappedEikenLevel <= targetEikenLevel;
                  } else if (targetEikenLevel === 'pre2') {
                    return mappedEikenLevel <= 4; // 準2級はレベル4
                  } else if (targetEikenLevel === 'pre1') {
                    return mappedEikenLevel <= 2; // 準1級は2級以下（level 1-5）
                }
                return false;
              });
              
              logger.debug(`words.jsonから英検${levelPart}級以下の単語数:`, eikenWordsFromWords.length);
              
              const wordsFromWords = eikenWordsFromWords.map((word) => ({ 
                sourceTextbook: textbookId, 
                ...word 
              }));
              combinedWords.push(...wordsFromWords);
            } catch (error) {
              console.error('❌ words.jsonの読み込みに失敗:', error);
            }
            
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
          
          if (textbookId === 'highschool-english') {
            // 高校英語の場合はレベル5-7の単語を保持（レベル1-3は表示用）
            filteredWords = filteredWords.filter(word => {
              const level = word.level || 1;
              return level >= 5 && level <= 7;
            });
            logger.debug('高校英語: レベル5-7の単語を保持、単語数:', filteredWords.length);
          } else {
            filteredWords = filteredWords.filter(word => {
              return option.levels.includes(word.level);
            });
          }
          
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
        // 英検教材の場合は選択された級以下の単語のみを設定
        if (option.id.startsWith('eiken-')) {
          // 英検級の識別子を取得
          const levelPart = option.id.split('-')[1];
          let targetEikenLevel;
          if (levelPart === 'pre2') {
            targetEikenLevel = 'pre2';
          } else if (levelPart === 'pre1') {
            targetEikenLevel = 'pre1';
          } else {
            targetEikenLevel = parseInt(levelPart);
          }
          
          // 英検級のレベル順序を定義（5級が最も低い）
          const eikenLevelOrder = [5, 4, 3, 'pre2', 2, 'pre1', 1];
          const targetIndex = eikenLevelOrder.indexOf(targetEikenLevel);
          
          if (targetIndex !== -1) {
            // 選択された級以下の単語のみをフィルタ
            const allowedLevels = eikenLevelOrder.slice(0, targetIndex + 1);
            const eikenFilteredWords = uniqueWords.filter(word => {
              if (!word.eikenLevels || !Array.isArray(word.eikenLevels)) {
                return false;
              }
              return word.eikenLevels.some(level => allowedLevels.includes(level));
            });
            setAllWords(eikenFilteredWords);
            logger.debug(`英検${targetEikenLevel}級以下フィルタ後:`, eikenFilteredWords.length);
          } else {
            setAllWords(uniqueWords);
          }
        } else {
          setAllWords(filteredWords); // フィルタ済み単語を設定
        }
        
        if (filteredWords.length === 0) {
          alert('このメニューには該当する単語がまだ登録されていません。別のメニューを選んでください。');
          setSelectionMode('main');
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

  const handleBackToMainMenu = () => {
    setSelectionMode('main');
    setSelectedTextbookId(null);
    setAllWords([]);
  };

  // 親レベル選択の処理
  const handleParentLevelClick = (parentLevel) => {
    setSelectedParentLevel(parentLevel);
    setShowSubLevels(true);
    logger.debug('親レベル選択:', parentLevel);
  };

  // サブレベル選択の処理
  const handleSubLevelClick = (subLevel) => {
    if (selectedTextbookId === 'highschool-english') {
      // 高校英語の場合はサブレベル（5A, 5B, 5Cなど）をそのまま渡す
      startLearning('sublevel', subLevel);
    } else {
      // その他の教材の場合は通常のレベル番号を渡す
      startLearning('level', subLevel);
    }
  };

  // 親レベル選択をリセット
  const resetParentLevelSelection = () => {
    setSelectedParentLevel(null);
    setShowSubLevels(false);
  };

  const startLearning = async (filterType, value) => {
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
    
    if (filterType === 'level' || filterType === 'sublevel') {
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
          } else if (selectedTextbookId === 'highschool-english') {
            // 高校英語の場合：選択された親レベル内の英単語を取得
            const highschoolLevelMapping = { 1: 5, 2: 6, 3: 7 };
            const targetLevel = highschoolLevelMapping[selectedParentLevel];
            
            parentLevelWords = allWords.filter(word => word.level === targetLevel);
          } else {
            // その他の教材の場合：選択された親レベルの単語を取得
            parentLevelWords = allWords.filter(word => word.level === selectedParentLevel);
          }
          
          // 親レベル範囲内から、指定されたlevelまたはsublevelの単語をフィルタ
          if (filterType === 'sublevel' && selectedTextbookId === 'highschool-english') {
            // 高校英語のサブレベルの場合（5A, 5B, 5Cなど）
            filtered = parentLevelWords.filter(word => word.subLevel === value);
            logger.debug(`🎓 高校英語サブレベル${value}から取得した単語数:`, filtered.length, `(親レベル範囲内: ${parentLevelWords.length}語)`);
            sessionLabel = `サブレベル${value}`;
          } else {
            // 通常のレベルの場合
            filtered = parentLevelWords.filter(word => word.level === Number(value));
            logger.debug(`サブレベル${value}から取得した単語数:`, filtered.length, `(親レベル範囲内: ${parentLevelWords.length}語)`);
            sessionLabel = `レベル${value}`;
          }
        }
        // レベル別学習の場合、教材に応じてフィルタリング
        else if (selectedTextbookId && selectedTextbookId.startsWith('eiken-')) {
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
          
          const eikenLevelOrder = [5, 4, 3, 'pre2', 2, 'pre1', 1];
          const targetIndex = eikenLevelOrder.indexOf(targetEikenLevel);
          
          if (targetIndex !== -1) {
            // 選択された級以下の全ての級を含む（復習として下位級も含む）
            const allowedLevels = eikenLevelOrder.slice(0, targetIndex + 1);
            
            // 現在の表示レベルに対応する英検級を取得
            const currentLevelEiken = eikenLevelOrder[Number(value) - 1];
            
            // 現在の表示レベルが選択された級以下の場合のみ表示
            if (currentLevelEiken && allowedLevels.includes(currentLevelEiken)) {
              filtered = allWords.filter(word => {
                // eikenLevelsフィールドがある場合（wordsData.jsonから取得した単語）
                if (word.eikenLevels && Array.isArray(word.eikenLevels)) {
                  // 子レベルでは、そのレベルの単語のみを表示
                  return word.eikenLevels.includes(currentLevelEiken);
                }
                
                // eikenLevelsフィールドがない場合（words.jsonから取得した単語）
                // levelフィールドを英検級にマッピングして判定
                if (word.level) {
                  const levelToEikenMapping = {
                    1: 5, 2: 4, 3: 3, 4: 2, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1
                  };
                  const mappedEikenLevel = levelToEikenMapping[word.level];
                  
                  if (typeof currentLevelEiken === 'number') {
                    return mappedEikenLevel === currentLevelEiken;
                  } else if (currentLevelEiken === 'pre2') {
                    return mappedEikenLevel === 4; // 英検準2級はレベル4
                  } else if (currentLevelEiken === 'pre1') {
                    return mappedEikenLevel === 7; // 英検準1級はレベル7
                  }
                }
                
                return false;
              });
            }
          }
          logger.debug(`英検${targetEikenLevel}級以下から取得した単語数:`, filtered.length);
          sessionLabel = `英検${targetEikenLevel}級以下`;
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
          startIndex = await getFreeStudyProgress(auth.currentUser.uid, selectedTextbookId, String(value));
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

  const startBookmarkWords = () => {
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
  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  if (dashboardError) {
    return (
      <div className="loading-container">
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
        return <LearningFlashcard
                  words={learningWords}
                  onBack={handleLearningBack}
                  initialIndex={currentSessionInfo?.startIndex || 0}
                  onSaveLog={handleSaveLog}
                  sessionInfo={currentSessionInfo}
                  onFirstCompletion={currentLearningMode === 'daily' ? () => markDailyTaskAsCompleted(auth.currentUser.uid) : null}
                  title={currentLearningMode === 'bookmark' ? '毎日みる単語' : undefined}
                />;
      case 'review':
        return <ReviewFlashcard 
                  words={dailyPlan.reviewWords} 
                  onBack={handleReviewComplete} 
                  onSaveLog={handleSaveLog}
                  sessionInfo={currentSessionInfo}
                />;
      case 'test':
        return <VocabularyCheckTest allWords={testWords} onTestComplete={handleTestComplete} />;
      case 'result':
        const lastResponseTimes = JSON.parse(localStorage.getItem('lastTestResponseTimes') || '[]');
        return <TestResult level={testResultLevel} onRestart={() => {}} responseTimes={lastResponseTimes} />;
      case 'select':
      default:
        const progressPercentage = userData?.progress?.percentage || 0;

        return (
          <>
            <div className="section-card">
              <h3 className="section-title">今日のタスク</h3>
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
               <div className="task-cards-container">
                  {isDailyTaskCompleted ? (
                    <div className="task-card okawari-card" onClick={startExtraNewWords}>
                      <FaMagic className="task-icon okawari-icon" />
                      <div className="task-info">
                        <p>おかわり</p>
                        <span>{dailyPlan.extraNewWords.length}</span>
                      </div>
                      <div className="okawari-label">スケジュール巻いてます！</div>
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

            <div className="section-card">
              <div className="dashboard-header" style={{ position: 'relative' }}>
                <LevelBadge level={testResultLevel} />
                {testResultLevel > 0 && (
                <button
                  onClick={startCheckTest}
                  style={{ 
                    position: 'absolute',
                    bottom: '-8px',
                    right: '-8px',
                    fontSize: '0.7rem',
                    padding: '4px 8px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    background: '#f8fafc',
                    color: '#6b7280',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontWeight: '500',
                    height: '24px',
                    minWidth: '60px',
                    justifyContent: 'center',
                    zIndex: 10,
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseOver={(e) => {
                    e.target.style.background = '#e5e7eb';
                    e.target.style.color = '#374151';
                    e.target.style.transform = 'scale(1.05)';
                  }}
                  onMouseOut={(e) => {
                    e.target.style.background = '#f8fafc';
                    e.target.style.color = '#6b7280';
                    e.target.style.transform = 'scale(1)';
                  }}
                >
                  <FaSyncAlt style={{ fontSize: '0.65rem' }} />
                  再テスト
                </button>
                )}
              </div>

              {/* 学習計画最適化ボタン */}
              {showRetestPrompt && (
                <div style={{ 
                  marginTop: '12px', 
                  padding: '8px 12px', 
                  backgroundColor: '#fef3c7', 
                  border: '1px solid #f59e0b', 
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ fontSize: '0.85rem', color: '#92400e' }}>
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
                      transition: 'all 0.2s'
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

              <div className="progress-widget">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progressPercentage}%` }} />
                </div>
                <div className="progress-caption">
                  <span>{progressPercentage}% 達成</span>
                  <span>総語彙 {userData?.progress?.targetVocabulary?.toLocaleString?.() || '-'} 語中 {userData?.progress?.currentVocabulary?.toLocaleString?.() || 0} 語</span>
                </div>

              </div>

              {/* 締切と今日の語数を1行に。以前は別ブロックで独自計算していて、
                  同じ「1日に何語」が画面に3つ並んでいた（計画書10.4 / 12.3）。 */}
              {scheduleMetrics ? (
                <div className={`schedule-line ${scheduleMetrics.status}`}>
                  <span>締切 {scheduleMetrics.deadlineLabel}（残り {scheduleMetrics.remainingDays} 日）</span>
                  <span>
                    今日 <strong>{scheduleMetrics.todaysPlan}</strong> 語
                    {scheduleMetrics.remainingWords > 0
                      && `／のこり ${scheduleMetrics.remainingWords.toLocaleString()} 語`}
                  </span>
                </div>
              ) : (
                <p className="schedule-line">目標または締切が未設定です。</p>
              )}

              {/* 常時見せる必要のない情報は畳む（計画書12.3） */}
              <details className="home-details">
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

            {wordDataError && (
              <div className="section-card word-data-error" role="alert">
                <p>{wordDataError}</p>
                <p className="field-error">
                  単語力チェックと自由学習が使えません。今日の学習プランはそのまま進められます。
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
          <StoryPanel
            monthlyStory={monthlyStory}
            pastStories={pastStories}
            storiesLoading={storiesLoading}
            isGeneratingStory={isGeneratingStory}
            storyError={storyError}
            onGenerate={handleGenerateStory}
          />
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
      onSelectTextbook={handleSelectTextbook}
      onStartLearning={startLearning}
    />
  );

  // 長文タブのコンテンツ

  // 自由学習タブのコンテンツ
  const renderFreeStudyContent = () => (
    <div className="free-study-tab-content">
            <div className="section-card">
              <div className="tile-header">
                <div>
                  <h3 className="section-title">自由学習メニュー</h3>
                  <p className="tile-caption">リラックスしながら、気になる教材を選んで学べます。</p>
                </div>
                {selectionMode === 'filter' && (
                  /* 選択中の教材と戻る導線。以前は横並び固定で、
                     幅が足りないと文字が1字ずつ折り返されていた（計画書12.4）。 */
                  <div className="textbook-context">
                    <span className="textbook-context__current">
                      選択中: {freeStudyOptions.find(opt => opt.id === selectedTextbookId)?.label || selectedTextbookId}
                    </span>
                    <button type="button" className="ghost-button textbook-context__back" onClick={handleBackToMainMenu}>
                      教材選択に戻る
                    </button>
                  </div>
                )}
              </div>

              {selectionMode === 'main' ? (
                <div className="list-group">
            {freeStudyOptions.map(({ id, label }) => {
              const isRecommended = isRecommendedTextbook(id, testResultLevel, userData);
              const recommendations = getRecommendedLevels(testResultLevel);
              const recommendationType = recommendations.recommended.find(rec => 
                isRecommendedTextbook(id, rec.level, userData)
              );
              const priority = recommendationType ? recommendationType.priority : 'medium';
              
              const wordCount = getTextbookWordCount(id, masterWords, textbookCounts);

              // 収録が0語の教材は出さない。選んでも何も学べない。
              // 単語データの読み込み前（masterWords が空）は判定できないので、
              // そのときは出したままにする。
              if (masterWords.length > 0 && wordCount === 0) return null;

              return (
                <button key={id} className="tile-button" onClick={() => {
                  logger.debug('🎯 教材選択ボタンクリック:', { id, label, isRecommended, wordCount });
                  handleSelectTextbook(id);
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <span>{label}</span>
                    {isRecommended && (
                      <RecommendationBadge type="textbook" priority={priority} />
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ 
                      fontSize: '0.875rem', 
                      color: '#6b7280',
                      fontWeight: '500'
                    }}>
                      {wordCount}語
                    </span>
                      <FaBook />
                  </div>
                    </button>
              );
            })}
                </div>
              ) : (
                <>
                  <div className="tab-switch">
                    <button
                      className={filterTab === 'level' ? 'active' : ''}
                      onClick={() => setFilterTab('level')}
                    >
                      レベル別
                    </button>
                    <button
                      className={filterTab === 'pos' ? 'active' : ''}
                      onClick={() => setFilterTab('pos')}
                    >
                      品詞別
                    </button>
                    <button
                      className={filterTab === 'theme' ? 'active' : ''}
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
                        levelWords = allWords.filter(word => {
                          if (!word.eikenLevels || !Array.isArray(word.eikenLevels)) {
                            return false;
                          }
                          // 現在の表示レベルに対応する英検級の単語のみをフィルタ
                          // 英検2級を選択した場合、レベル5では英検2級の単語のみを表示
                          return word.eikenLevels.includes(currentLevelEiken);
                        });
                        
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
                    // 高校英語の場合はレベルマッピングを使用してフィルタ
                    const highschoolLevelMapping = { 1: 5, 2: 6, 3: 7 };
                    const targetLevel = highschoolLevelMapping[parseInt(level)];
                    levelWords = allWords.filter(word => word.level === targetLevel);
                    logger.debug(`🔍 高校英語レベル${level}→${targetLevel}フィルタリング:`, {
                      全単語数: allWords.length,
                      フィルタ後単語数: levelWords.length,
                      サンプル単語: levelWords.slice(0, 3).map(w => ({ word: w.word, level: w.level }))
                    });
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
                  
                        const progressKey = `${selectedTextbookId}_${level}`;
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
                        
                        return (
                    <div key={level} style={{ position: 'relative' }}>
                          <button
                        className={`selection-card ${isUnusedLevel || isEikenUnusedLevel ? 'selection-card-disabled' : ''}`}
                        disabled={!levelWords.length || isUnusedLevel || isEikenUnusedLevel}
                        onClick={() => {
                          if (!isUnusedLevel && !isEikenUnusedLevel) {
                            if (selectedTextbookId && (selectedTextbookId.startsWith('eiken-') || selectedTextbookId === 'highschool-english')) {
                              // 英検教材と高校英語の場合は親レベル選択
                              handleParentLevelClick(Number(level));
                            } else {
                              // その他の教材は直接学習開始
                              startLearning('level', Number(level));
                            }
                          }
                        }}
                      >
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        justifyContent: 'center',
                        flexWrap: 'wrap'
                      }}>
                            <span className="selection-card-level">{info.label}</span>
                        {info.priority === 'high' && (
                          <RecommendationBadge type="priority" priority="high" />
                        )}
                        {isRecommended && !isUnusedLevel && !isEikenUnusedLevel && (
                          <RecommendationBadge type="level" priority={priority} />
                        )}
                      </div>
                            <span className="selection-card-desc">{info.equivalent}</span>
                      <span className="selection-card-meta">
                        {isUnusedLevel || isEikenUnusedLevel ? '対象外' : `単語数: ${levelWords.length}語`}
                        {!selectedTextbookId?.startsWith('eiken-') && !isUnusedLevel && !isEikenUnusedLevel && (
                          <span style={{ fontSize: '0.8em', color: '#666' }}>
                            (目安: {info.wordsRequired.toLocaleString()}語)
                          </span>
                        )}
                      </span>
                      <span className="selection-card-progress">{isUnusedLevel || isEikenUnusedLevel ? '対象外' : progressText}</span>
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
                  } else if (selectedTextbookId === 'highschool-english') {
                    // 高校英語の場合：選択された親レベル内の英単語をサブレベル別に分けて表示
                    // 高校英語のレベルマッピング: 1→5, 2→6, 3→7
                    const highschoolLevelMapping = { 1: 5, 2: 6, 3: 7 };
                    const targetLevel = highschoolLevelMapping[selectedParentLevel];
                    
                    logger.debug('🎓 高校英語フィルタリング:', {
                      selectedTextbookId,
                      selectedParentLevel,
                      targetLevel,
                      allWordsLength: allWords.length
                    });
                    
                    // 選択された親レベル内の英単語を取得（当該レベルのみ）
                    parentLevelWords = allWords.filter(word => word.level === targetLevel);
                    
                    logger.debug(`高校英語レベル${targetLevel}の単語数:`, parentLevelWords.length);
                    
                    // サンプル単語を表示
                    const sampleWords = parentLevelWords.slice(0, 5).map(w => w.word);
                    logger.debug(`高校英語レベル${targetLevel}のサンプル単語:`, sampleWords);
                  } else {
                    // その他の教材の場合：選択された親レベルの単語を取得
                    parentLevelWords = allWords.filter(word => word.level === selectedParentLevel);
                    logger.debug(`レベル${selectedParentLevel}の単語数:`, parentLevelWords.length);
                  }
                  
                  // levelに従ってランク分け
                  const levelGroups = {};
                  parentLevelWords.forEach(word => {
                    if (selectedTextbookId === 'highschool-english' && word.subLevel) {
                      // 高校英語の場合はサブレベル（5A, 5B, 5Cなど）でグループ化
                      const subLevel = word.subLevel;
                      if (!levelGroups[subLevel]) {
                        levelGroups[subLevel] = [];
                      }
                      levelGroups[subLevel].push(word);
                    } else {
                      // その他の教材の場合は通常のレベルでグループ化
                      const level = word.level || 1;
                      if (!levelGroups[level]) {
                        levelGroups[level] = [];
                      }
                      levelGroups[level].push(word);
                    }
                  });
                  
                  // レベル順にソート（高校英語の場合はサブレベル順）
                  const sortedLevels = Object.keys(levelGroups).sort((a, b) => {
                    if (selectedTextbookId === 'highschool-english') {
                      // サブレベルの場合（5A, 5B, 5C, 6A, 6B, 6C, 7A, 7B, 7C）
                      const aLevel = parseInt(a.substring(0, 1));
                      const bLevel = parseInt(b.substring(0, 1));
                      if (aLevel !== bLevel) {
                        return aLevel - bLevel;
                      }
                      return a.localeCompare(b); // A, B, Cの順
                    } else {
                      return parseInt(a) - parseInt(b);
                    }
                  });
                  
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
                        const progressKey = `${selectedTextbookId}_${level}`;
                        const lastIndex = freeStudyProgress[progressKey] || 0;
                        const progressText = lastIndex > 0 ? `前回: ${lastIndex + 1}/${levelWords.length}単語まで` : '未学習';
                        
                        
                        // 無効化判定（大阪府公立入試のみ適用）
                        const isOsakaKoukou = selectedTextbookId === 'osaka-koukou-nyuushi';
                        const isUnusedLevel = isOsakaKoukou && (level >= 8);
                        
                        // 英検教材のサブレベルは無効化しない（選択された級内のレベル別表示のため）
                        const isEikenUnusedLevel = false;
                        
                        // 推奨判定
                        const isRecommended = isRecommendedSubLevel(level, selectedParentLevel, testResultLevel);
                        const recommendations = getRecommendedLevels(testResultLevel);
                        const recommendationType = recommendations.recommended.find(rec => 
                          isRecommendedSubLevel(level, selectedParentLevel, rec.level)
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
                                {selectedTextbookId === 'highschool-english' ? level : `レベル ${level}`}
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
                              {selectedTextbookId === 'highschool-english' 
                                ? getHighschoolSubLevelDescription(level)
                                : selectedTextbookId && selectedTextbookId.startsWith('eiken-') 
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

  return (
    <div className="dashboard-container">
      <StudentHeader userName={userData?.name} onLogout={handleLogout} />
      
      {/* 初回テストと学習計画最適化のボタン */}
      {testResultLevel === 0 && viewMode !== 'learn' && viewMode !== 'review' && viewMode !== 'test' && viewMode !== 'result' && (
        <div className="initial-test-banner" style={{
          backgroundColor: '#3b82f6',
          color: 'white',
          padding: '16px 20px',
          margin: '0 20px 20px 20px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}>
          <div>
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
      {/* フラッシュカードページではタブバーを非表示 */}
      {viewMode !== 'learn' && viewMode !== 'review' && viewMode !== 'test' && viewMode !== 'result' && <TabBar />}
    </div>
  );
}