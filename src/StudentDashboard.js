import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from './firebaseConfig';
import './Analytics.css';
import wordsData from './wordsData.json';
import { collection, getDocs, doc, getDoc, setDoc, query, orderBy, updateDoc, increment, where } from "firebase/firestore";
import { generateDailyPlan } from './logic/learningPlanner';
import { addWordToReview } from './logic/reviewLogic';
import { updateProgressPercentage } from './logic/progressLogic';
import { logStudySession } from './logic/studyLogger';
import { saveFreeStudyProgress, getFreeStudyProgress, getAllFreeStudyProgress } from './logic/freeStudyProgress';
import { analyzeUserPerformance, generateLearningRecommendations } from './logic/basicAnalytics';
import { predictPerformance } from './logic/predictionModel';
import { generateSmartRecommendations } from './logic/recommendationEngine';
import VocabularyCheckTest from './VocabularyCheckTest';
import TestResult from './TestResult';
import LearningFlashcard from './LearningFlashcard';
import ReviewFlashcard from './ReviewFlashcard';
import LevelBadge from './LevelBadge';
import { FaBook, FaSyncAlt, FaMagic } from 'react-icons/fa';
import { getTodayKey, getCurrentMonthKey, getTokyoDateKey } from './logic/dateKeys';
import { getRecommendedTextbooks, toGoalIds } from './config';

// デバッグ: wordsDataの読み込み確認
console.log('🔍 wordsData読み込み確認:', {
  総単語数: wordsData ? wordsData.length : 'undefined',
  サンプル: wordsData ? wordsData.slice(0, 2) : 'undefined'
});

// 英検教材の単語数を計算する関数（実際の収録単語数）
const getEikenWordCount = (textbookId) => {
  if (!wordsData) return 0;
  
  const levelPart = textbookId.split('-')[1];
  let targetEikenLevel;
  if (levelPart === 'pre2') {
    targetEikenLevel = 'pre2';
  } else if (levelPart === 'pre1') {
    targetEikenLevel = 'pre1';
  } else {
    targetEikenLevel = parseInt(levelPart);
  }
  
  console.log('🎯 英検教材単語数計算:', { textbookId, targetEikenLevel });
  
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
    
    console.log(`英検${levelPart}級の実際の収録単語数:`, actualCount);
  }
  
  return actualCount;
};

// 各教材の単語数を計算する関数
const getTextbookWordCount = (textbookId) => {
  console.log('📊 単語数計算開始:', { textbookId });
  
  // 英検教材の場合は実際の処理ロジックを再現
  if (textbookId.startsWith('eiken-')) {
    const count = getEikenWordCount(textbookId);
    console.log('📊 英検教材単語数取得:', { textbookId, count });
    return count;
  }
  
  switch (textbookId) {
    case 'osaka-koukou-nyuushi':
      // 大阪府公立入試英単語：tsukutan-app/words.jsonから取得（固定値）
      // 実際の処理ではfetchで取得しているが、表示用なので固定値を使用
      const osakaCount = 1969; // tsukutan-app/words.jsonの実際の単語数
      console.log('📚 大阪府公立入試英単語数:', osakaCount);
      return osakaCount;
    
    case 'highschool-english':
      // 高校英語：wordsData.jsonからレベル5-7の単語をカウント
      if (!wordsData) return 0;
      const highschoolCount = wordsData.filter(word => {
        const level = word.level || 1;
        return level >= 5 && level <= 7;
      }).length;
      console.log('🎓 高校英語単語数:', highschoolCount);
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
  
  console.log('🎯 推奨レベル計算:', {
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
      console.log('🎯 大阪府公立入試英単語: 高校受験目標なしのため非推奨');
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
    'eiken-pre1': { min: 6, max: 7 },
    'eiken-1': { min: 7, max: 8 }
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
    console.log('🎯 レベル推奨判定:', {
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
          icon: '★',
          borderColor: '#dc2626'
        };
      case 'medium':
        return {
          backgroundColor: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          color: 'white',
          text: 'おすすめ',
          icon: '☆',
          borderColor: '#d97706'
        };
      case 'low':
        return {
          backgroundColor: 'linear-gradient(135deg, #10b981, #059669)',
          color: 'white',
          text: '復習',
          icon: '↻',
          borderColor: '#047857'
        };
      default:
        return {
          backgroundColor: 'linear-gradient(135deg, #6b7280, #4b5563)',
          color: 'white',
          text: '推奨',
          icon: '●',
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
      <span style={{ fontSize: '10px' }}>{badgeStyle.icon}</span>
      <span>{badgeStyle.text}</span>
    </div>
  );
};

// 既存の定数やヘルパー関数（すべて維持）
const freeStudyOptions = [
  { id: 'osaka-koukou-nyuushi', label: '大阪府公立入試英単語', textbooks: ['osaka-koukou-nyuushi'], levels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { id: 'highschool-english', label: '高校英語', textbooks: ['highschool-english'], levels: [1, 2, 3] },
  { id: 'eiken-5', label: '英検5級', textbooks: ['highschool-english'] },
  { id: 'eiken-4', label: '英検4級', textbooks: ['highschool-english'] },
  { id: 'eiken-3', label: '英検3級', textbooks: ['highschool-english'] },
  { id: 'eiken-pre2', label: '英検準2級', textbooks: ['highschool-english'] },
  { id: 'eiken-2', label: '英検2級', textbooks: ['highschool-english'] },
  { id: 'eiken-pre1', label: '英検準1級', textbooks: ['highschool-english'] },
  { id: 'eiken-1', label: '英検1級', textbooks: ['highschool-english'] }
];
// 通常のレベル定義（実際のデータに基づいて調整）
const levelDescriptions = {
    1: { label: "中学基礎", equivalent: "英検5級 / Pre-A1", wordsRequired: 600 },
    2: { label: "中学標準", equivalent: "英検4級 / A1", wordsRequired: 1300 },
    3: { label: "中学卒業", equivalent: "英検3級 / A2", wordsRequired: 2100 },
    4: { label: "高校基礎", equivalent: "英検準2級 / A2", wordsRequired: 3600 },
    5: { label: "高校標準", equivalent: "英検2級 / B1", wordsRequired: 5100 },
    6: { label: "高校応用", equivalent: "英検2級〜準1級 / B1-B2", wordsRequired: 6000 },
    7: { label: "大学中級", equivalent: "英検準1級 / B2", wordsRequired: 8000 }
    // レベル8以上は実際のデータに存在しないため削除
};

// 高校英語専用のレベル定義
const highschoolLevelDescriptions = {
    1: { label: "高校基礎", equivalent: "英検準2級 / A2-B1", wordsRequired: 1335 },
    2: { label: "高校標準", equivalent: "英検2級 / B1-B2", wordsRequired: 2941 },
    3: { label: "高校応用", equivalent: "英検準1級 / B2-C1", wordsRequired: 1658 }
};

// 英検級レベル変換関数
const getEikenLevel = (level) => {
  const eikenMapping = {
    1: '英検5級', 2: '英検4級', 3: '英検3級', 4: '英検準2級',
    5: '英検2級', 6: '英検2級', 7: '英検準1級', 8: '英検1級',
    9: '英検1級+', 10: 'ネイティブ'
  };
  return eikenMapping[level] || `レベル${level}`;
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
const eikenLevelDescriptions = {
    1: { label: "英検5級レベル", equivalent: "中1レベル", wordsRequired: 600 },
    2: { label: "英検4級レベル", equivalent: "中2レベル", wordsRequired: 1300 },
    3: { label: "英検3級レベル", equivalent: "中3レベル", wordsRequired: 2100 },
    4: { label: "英検準2級レベル", equivalent: "高1レベル", wordsRequired: 3600 },
    5: { label: "英検2級レベル", equivalent: "高2レベル", wordsRequired: 5100 },
    6: { label: "英検準1級レベル", equivalent: "高3レベル", wordsRequired: 6000 },
    7: { label: "英検1級レベル", equivalent: "大学レベル", wordsRequired: 8000 },
    8: { label: "上級レベル", equivalent: "大学上級レベル", wordsRequired: 10000 },
    9: { label: "最上級レベル", equivalent: "大学院レベル", wordsRequired: 12000 },
    10:{ label: "ネイティブレベル", equivalent: "ネイティブレベル", wordsRequired: 15000 }
};

// 大阪府公立入試英単語専用のレベル定義
const osakaLevelDescriptions = {
    1: { label: "中学基礎", equivalent: "英検5級 / Pre-A1", wordsRequired: 600 },
    2: { label: "中学標準", equivalent: "英検4級 / A1", wordsRequired: 1300 },
    3: { label: "中学卒業", equivalent: "英検3級 / A2", wordsRequired: 2100 },
    4: { label: "高校基礎", equivalent: "英検準2級 / A2", wordsRequired: 3600 },
    5: { label: "高校標準", equivalent: "英検2級 / B1", wordsRequired: 5100 },
    6: { label: "高校応用", equivalent: "英検2級 / B1", wordsRequired: 6000 },
    7: { label: "高校上級", equivalent: "英検2級〜準1級 / B1-B2", wordsRequired: 8000 },
    8: { label: "大学中級", equivalent: "英検準1級 / B2", wordsRequired: 10000 },
    9: { label: "大学上級", equivalent: "英検1級 / C1", wordsRequired: 12000 },
    10: { label: "ネイティブ", equivalent: "ネイティブレベル", wordsRequired: 15000 }
};
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
const themeLabels = {
  'seeing': '見る',
  'opinion': '意見・考える',
  'emotion': '感情',
  'movement': '移動',
  'effort': '学ぶ・努力'
};

const themeDescriptions = {
  'seeing': '視覚に関する単語',
  'opinion': '思考や意見に関する単語',
  'emotion': '感情や気持ちに関する単語',
  'movement': '動きや移動に関する単語',
  'effort': '学習や努力に関する単語'
};

const THEME_DEFINITIONS = [
  {
    id: 'seeing',
    label: '見る',
    keywords: ['see', 'watch', 'look', 'view', 'glance', 'observe', 'glimpse', 'peek', 'stare', 'scan', 'survey', '見', '視', '観', '眺']
  },
  {
    id: 'opinion',
    label: '意見・考える',
    keywords: ['think', 'believe', 'opine', 'suppose', 'consider', 'reckon', 'idea', '意見', '考', '思']
  },
  {
    id: 'emotion',
    label: '感情',
    keywords: ['love', 'like', 'admire', 'hate', 'dislike', 'fear', 'worry', 'enjoy', 'emotion', '感情', '好き', '嫌', '恐']
  },
  {
    id: 'movement',
    label: '移動',
    keywords: ['go', 'come', 'move', 'travel', 'run', 'walk', 'ride', 'fly', 'depart', 'arrive', '移動', '進', '歩']
  },
  {
    id: 'effort',
    label: '学ぶ・努力',
    keywords: ['study', 'learn', 'practice', 'train', 'review', 'prepare', '努力', '学ぶ', '練習', '復習']
  },
];

const buildSemanticGroups = (words) => {
  const groups = {};
  if (!Array.isArray(words)) return groups;

  words.forEach((word) => {
    const surface = (word.word || '').toLowerCase();
    const combinedMeaning = [word.meaning, word.japanese]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    THEME_DEFINITIONS.forEach((theme) => {
      const matchesTheme = theme.keywords.some((keyword) => {
        const normalized = keyword.toLowerCase();
        return surface.includes(normalized) || combinedMeaning.includes(normalized);
      });

      if (matchesTheme) {
        if (!groups[theme.id]) {
          groups[theme.id] = { label: theme.label, words: [] };
        }
        if (!groups[theme.id].words.some((entry) => entry.id === word.id)) {
          groups[theme.id].words.push(word);
        }
      }
    });
  });

  return groups;
};

export default function StudentDashboard() {
  // --- State宣言 ---
  const [allWords, setAllWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState(null);
  const [viewMode, setViewMode] = useState('select');
  const [selectionMode, setSelectionMode] = useState('main');
  const [testResultLevel, setTestResultLevel] = useState(0);
  
  // デバッグログ: testResultLevelの値を監視
  useEffect(() => {
    console.log('🎯 testResultLevel更新:', testResultLevel);
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
  
  // ▼▼▼ 親レベル選択用のState ▼▼▼
  const [selectedParentLevel, setSelectedParentLevel] = useState(null);
  const [showSubLevels, setShowSubLevels] = useState(false);
  
  const navigate = useNavigate();
  const themeGroups = useMemo(() => buildSemanticGroups(allWords), [allWords]);

  // 復習単語をハイライトする関数
  const highlightReviewWords = (text, usedWords) => {
    if (!usedWords || usedWords.length === 0) {
      return text;
    }
    
    let highlightedText = text;
    usedWords.forEach(word => {
      // 単語の境界を考慮した正規表現で置換
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      highlightedText = highlightedText.replace(regex, `<mark style="background-color: #ffeb3b; padding: 2px 4px; border-radius: 3px; font-weight: bold;">${word}</mark>`);
    });
    
    return <span dangerouslySetInnerHTML={{ __html: highlightedText }} />;
  };

  const scheduleMetrics = useMemo(() => {
    if (!userData?.goal?.targetDate) return null;
    const targetVocabulary = userData?.progress?.targetVocabulary;
    if (!targetVocabulary || targetVocabulary <= 0) {
      return {
        targetVocabulary: 0,
        mastered: userData?.progress?.currentVocabulary || 0,
        remainingWords: 0,
        remainingDays: 0,
        recommendedPerDay: dailyPlan?.dailyTarget || 0,
        todaysPlan: dailyPlan?.newWords?.length || 0,
        status: 'completed',
        deadlineLabel: '-'
      };
    }

    const mastered = userData?.progress?.currentVocabulary || 0;
    const remainingWords = Math.max(0, targetVocabulary - mastered);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const targetDate = new Date(userData.goal.targetDate);
    targetDate.setHours(0, 0, 0, 0);

    const deadline = new Date(targetDate);
    deadline.setMonth(deadline.getMonth() - 1);
    if (deadline < today) {
      deadline.setTime(targetDate.getTime());
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const remainingDaysRaw = Math.ceil((deadline - today) / msPerDay);
    const remainingDays = Number.isFinite(remainingDaysRaw) ? Math.max(1, remainingDaysRaw) : 1;

    const recommendedPerDay = Math.max(1, Math.ceil(remainingWords / remainingDays));
    const todaysPlan = dailyPlan?.newWords?.length || 0;

    let status = 'ontrack';
    if (remainingWords === 0) {
      status = 'completed';
    } else if (todaysPlan < recommendedPerDay * 0.9) {
      status = 'behind';
    } else if (todaysPlan >= recommendedPerDay * 1.3) {
      status = 'ahead';
    }

    const deadlineLabel = `${deadline.getFullYear()}-${String(deadline.getMonth() + 1).padStart(2, '0')}-${String(deadline.getDate()).padStart(2, '0')}`;

    return {
      targetVocabulary,
      mastered,
      remainingWords,
      remainingDays,
      recommendedPerDay,
      todaysPlan,
      status,
      deadlineLabel,
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
        const stories = querySnapshot.docs.map(doc => {
          const storyData = { id: doc.id, ...doc.data() };
          
          // createdAtフィールドがFirestoreのTimestampオブジェクトの場合は文字列に変換
          if (storyData.createdAt && typeof storyData.createdAt === 'object' && storyData.createdAt.seconds) {
            storyData.createdAt = new Date(storyData.createdAt.seconds * 1000).toLocaleDateString('ja-JP');
          }
          
          // 既存のストーリーにsentences配列がない場合は作成
          if (!storyData.sentences) {
            const sentences = [];
            if (storyData.story1 && storyData.translation1) {
              sentences.push({
                english: storyData.story1,
                japanese: storyData.translation1
              });
            }
            if (storyData.story2 && storyData.translation2) {
              sentences.push({
                english: storyData.story2,
                japanese: storyData.translation2
              });
            }
            storyData.sentences = sentences;
          }
          
          return storyData;
        });
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
        console.log('👤 ユーザーデータ取得:', {
          level: data.level,
          testResultLevel: data.testResultLevel,
          finalLevel: data.finalLevel,
          全フィールド: Object.keys(data),
          progress: data.progress
        });
        setUserData(data);
        
        // testResultLevelの設定を詳細にログ出力
        const levelToSet = data.level || 0;
        console.log('🎯 testResultLevel設定:', {
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
        console.log("No such document! Redirecting to test.");
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
      console.log('自由学習進捗読み込み:', progress);
      setFreeStudyProgress(progress);
    } catch (error) {
      console.error('自由学習進捗の読み込みに失敗しました:', error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
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
      let combinedWords = [];
      
      // wordsData.jsonから直接読み込み（全教材の単語を含む）
      console.log('📚 単語力チェックテスト用wordsData.json読み込み成功:', {
        総単語数: wordsData.length,
        サンプル単語: wordsData.slice(0, 3).map(w => ({ word: w.word, level: w.level }))
      });
      
      const words = wordsData.map((word) => ({ 
        sourceTextbook: 'words-master', 
        ...word 
      }));
      combinedWords.push(...words);
      console.log(`単語マスターから取得した単語数:`, words.length);
      
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
    console.log('🎯 テスト完了処理開始:', finalLevel, responseTimes);
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
        
        console.log('進捗保存:', {
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
        
        console.log('進捗保存完了:', progressKey, lastIndex);
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
    console.log('教材選択:', textbookId);
    
    try {
        const option = freeStudyOptions.find(opt => opt.id === textbookId);
        const targetTextbookIds = option?.textbooks || [textbookId];
        
        console.log('教材オプション:', option);
        console.log('対象テキストブックIDs:', targetTextbookIds);

        let combinedWords = [];
        
        // 大阪府公立入試英単語の場合はtsukutan-app/words.jsonから直接読み込み
        if (textbookId === 'osaka-koukou-nyuushi') {
          console.log('🏫 大阪府公立入試英単語の処理開始');
          
          try {
            // tsukutan-app/words.jsonから直接読み込み
            const osakaWordsData = await fetch('/data/words-osaka.json').then(res => res.json());
            console.log('📚 大阪府公立入試英単語データ読み込み成功:', {
              総単語数: osakaWordsData.length,
              サンプル単語: osakaWordsData.slice(0, 3).map(w => ({ word: w.word, level: w.level }))
            });
            
            const words = osakaWordsData.map((word) => ({ 
              sourceTextbook: 'osaka-koukou-nyuushi', 
              ...word 
            }));
            combinedWords.push(...words);
            console.log(`大阪府公立入試英単語から取得した単語数:`, words.length);
          } catch (error) {
            console.error('❌ 大阪府公立入試英単語データの読み込みに失敗:', error);
            throw new Error('大阪府公立入試英単語データの読み込みに失敗しました');
          }
        } else if (textbookId === 'highschool-english') {
          // 高校英語の場合はwordsData.jsonからレベル5-7の単語を取得
          console.log('🎓 高校英語の処理開始');
          console.log('🔍 wordsData存在確認:', wordsData ? '存在' : 'undefined');
          
          if (!wordsData || !Array.isArray(wordsData)) {
            console.error('❌ wordsDataが正しく読み込まれていません');
            throw new Error('wordsDataの読み込みに失敗しました');
          }
          
          // レベル5-7の単語をフィルタ（高校英語として分類された単語）
          const highschoolWords = wordsData.filter(word => {
            const level = word.level || 1;
            return level >= 5 && level <= 7;
          });
          
          console.log('📚 高校英語単語フィルタ成功:', {
            総単語数: wordsData.length,
            高校英語単語数: highschoolWords.length,
            サンプル単語: highschoolWords.slice(0, 3).map(w => ({ word: w.word, level: w.level }))
          });
          
          const words = highschoolWords.map((word) => ({ 
            sourceTextbook: 'highschool-english', 
            ...word 
          }));
          combinedWords.push(...words);
          console.log(`高校英語から取得した単語数:`, words.length);
        } else {
          // 英検教材の場合はwordsData.jsonとwords.jsonの両方から取得
          if (textbookId.startsWith('eiken-')) {
            console.log('🎯 英検教材の処理開始:', textbookId);
            
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
            
            // 1. wordsData.jsonから取得（eikenLevelsフィールドあり）
            if (wordsData && Array.isArray(wordsData)) {
              const eikenWordsFromWordsData = wordsData.filter(word => {
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
              
              console.log(`wordsData.jsonから英検${levelPart}級以下の単語数:`, eikenWordsFromWordsData.length);
              
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
              
              console.log(`words.jsonから英検${levelPart}級以下の単語数:`, eikenWordsFromWords.length);
              
              const wordsFromWords = eikenWordsFromWords.map((word) => ({ 
                sourceTextbook: textbookId, 
                ...word 
              }));
              combinedWords.push(...wordsFromWords);
            } catch (error) {
              console.error('❌ words.jsonの読み込みに失敗:', error);
            }
            
            console.log(`英検教材から取得した総単語数:`, combinedWords.length);
          } else {
            // その他の教材はFirebaseから取得
        for (const id of targetTextbookIds) {
          const snapshot = await getDocs(collection(db, 'textbooks', id, 'words'));
          const words = snapshot.docs.map(d => ({ id: d.id, sourceTextbook: id, ...d.data() }));
          combinedWords.push(...words);
          console.log(`テキストブック ${id} から取得した単語数:`, words.length);
            }
          }
        }

        // 永続IDで重複を除去する。表面語をキーにすると意味違いの同綴語が消える。
        const uniqueWords = Array.from(new Map(combinedWords.map(item => [item.id, item])).values());
        if (uniqueWords.length !== combinedWords.length) {
          console.log(`${textbookId}: 重複除去 ${combinedWords.length} → ${uniqueWords.length}`);
        }

        let filteredWords = uniqueWords;
        
        // 英検級の場合は全ての単語を保持（レベル別表示で個別にフィルタリング）
        if (option.id.startsWith('eiken-')) {
          console.log('英検教材選択: 全単語を保持、レベル別表示で個別フィルタリング');
        } else if (option?.levels?.length) {
          // 通常のレベル別の場合は既存のlevelフィールドを使用
          console.log('🔍 レベルフィルタリング開始:', {
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
            console.log('高校英語: レベル5-7の単語を保持、単語数:', filteredWords.length);
          } else {
            filteredWords = filteredWords.filter(word => {
              return option.levels.includes(word.level);
            });
          }
          
          console.log('レベルフィルタ後:', {
            フィルタ後単語数: filteredWords.length,
            レベル別分布: filteredWords.reduce((acc, word) => {
              acc[word.level] = (acc[word.level] || 0) + 1;
              return acc;
            }, {})
          });
        }

        if (option?.topics?.length && filteredWords[0]?.topic !== undefined) {
          filteredWords = filteredWords.filter(word => option.topics.includes(word.topic));
          console.log('トピックフィルタ後:', filteredWords.length);
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

        console.log('📊 最終的な単語データ:', {
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
            console.log(`英検${targetEikenLevel}級以下フィルタ後:`, eikenFilteredWords.length);
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
    console.log('親レベル選択:', parentLevel);
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
    
    console.log('学習開始:', {
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
            console.log(`🎓 高校英語サブレベル${value}から取得した単語数:`, filtered.length, `(親レベル範囲内: ${parentLevelWords.length}語)`);
            sessionLabel = `サブレベル${value}`;
          } else {
            // 通常のレベルの場合
            filtered = parentLevelWords.filter(word => word.level === Number(value));
            console.log(`サブレベル${value}から取得した単語数:`, filtered.length, `(親レベル範囲内: ${parentLevelWords.length}語)`);
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
          console.log(`英検${targetEikenLevel}級以下から取得した単語数:`, filtered.length);
          sessionLabel = `英検${targetEikenLevel}級以下`;
        } else if (selectedTextbookId === 'osaka-koukou-nyuushi') {
          // 大阪府公立入試英単語の場合はlevelフィールドを基準にフィルタ
          filtered = allWords.filter(word => word.level === Number(value));
          console.log('大阪府公立入試英単語から取得した単語数:', filtered.length);
          sessionLabel = `レベル${value}`;
        } else {
          // 通常のレベル別学習の場合、levelフィールドを基準にフィルタ
          filtered = allWords.filter(word => word.level === Number(value));
        console.log('allWordsから取得した単語数（固定順序）:', filtered.length);
          sessionLabel = `レベル${value}`;
        }
        
        // 前回の進捗を取得
        if (selectedTextbookId) {
          startIndex = await getFreeStudyProgress(auth.currentUser.uid, selectedTextbookId, String(value));
          console.log('進捗取得:', {
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
    console.log('セッション情報設定:', {
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

    const callGenerateApi = async (words) => {
      const user = auth.currentUser;
      if (!user) throw new Error("ログインしていません。");

      const idToken = await user.getIdToken();
      const functionUrl = 'https://us-central1-tsukutan-58b3f.cloudfunctions.net/generateStoryFromWords';

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ words }),
      });

      if (!response.ok) {
        let errorMsg = `ストーリーの生成に失敗しました (HTTP ${response.status})。`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMsg = errorData.error;
          }
          if (response.status === 429 && (errorData.story || errorData.story1)) {
             const err = new Error('今月のストーリーは既に生成されています。');
             err.isRateLimit = true;
             err.existingStory = { id: getCurrentMonthKey(), ...errorData };
             throw err;
          }
        } catch (e) {
           if (e.isRateLimit) throw e;
          console.error("Could not parse error response as JSON.", e);
          errorMsg = "サーバーで予期せぬエラーが発生しました。しばらくしてからもう一度お試しください。";
        }
        throw new Error(errorMsg);
      }
      return response.json();
    };

    try {
      // First generation
      const result1 = await callGenerateApi(wordsToUse);

      let finalStoryData = {
        story1: result1.story,
        translation1: result1.translation,
        story2: null,
        translation2: null,
        unusedWords: result1.unusedWords,
        words: wordsToUse,
      };

      // Second generation if there are unused words
      if (result1.unusedWords && result1.unusedWords.length > 0) {
        const wordsForSecondAttempt = result1.unusedWords
          .map(wordStr => wordsToUse.find(w => w.word === wordStr))
          .filter(Boolean); // Filter out any null/undefined entries

        if (wordsForSecondAttempt.length > 0) {
            const result2 = await callGenerateApi(wordsForSecondAttempt);
            finalStoryData.story2 = result2.story;
            finalStoryData.translation2 = result2.translation;
            finalStoryData.unusedWords = result2.unusedWords;
        }
      }

      // sentences配列を作成
      const sentences = [];
      if (finalStoryData.story1 && finalStoryData.translation1) {
        sentences.push({
          english: finalStoryData.story1,
          japanese: finalStoryData.translation1
        });
      }
      if (finalStoryData.story2 && finalStoryData.translation2) {
        sentences.push({
          english: finalStoryData.story2,
          japanese: finalStoryData.translation2
        });
      }

      const newStory = { 
        id: getCurrentMonthKey(), 
        title: '今月の長文',
        createdAt: new Date().toLocaleDateString('ja-JP'),
        sentences: sentences,
        ...finalStoryData 
      };
      setMonthlyStory(newStory);
      setPastStories(prevStories => [newStory, ...prevStories.filter(s => s.id !== newStory.id)]);

    } catch (error) {
      if (error.isRateLimit) {
        setMonthlyStory(error.existingStory);
        alert(error.message);
      } else {
        console.error("ストーリー生成エラー:", error);
        alert(error.message);
      }
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
      console.log('目標をリセットしています...');
      
      // Reset goal data in Firestore
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        goal: {
          targets: [],
          targetDate: null,
          isSet: false,
        }
      });

      console.log('Firestoreの更新が完了しました');

      // Clear local state
      setUserData(prev => ({
        ...prev,
        goal: {
          targets: [],
          targetDate: null,
          isSet: false,
        }
      }));

      console.log('ローカル状態の更新が完了しました');

      // Show success message
      alert('目標がリセットされました。新しい目標を設定してください。');

      // Reload the page to trigger App.js useEffect
      console.log('ページをリロードして目標設定画面に遷移します');
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

                {paceSuggestion && paceSuggestion.recommended > 0 && (
                  <div className={`pace-advice pace-${paceSuggestion.status}`} style={{marginTop: '12px', padding: '10px', borderRadius: '6px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.9rem'}}>
                    <p style={{margin: '0', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <span>学習ペース</span>
                      <span style={{fontWeight: 'normal'}}>
                        平均 <strong style={{fontSize: '1.1em'}}>{paceSuggestion.average.toFixed(1)}</strong> 語/日 (推奨 {paceSuggestion.recommended} 語)
                      </span>
                    </p>
                    {paceSuggestion.status === 'ahead' && (
                      <p style={{margin: '4px 0 0', color: '#16a34a', fontSize: '0.85rem'}}>
                        素晴らしいペースです！「おかわり学習」で更に差をつけましょう。
                      </p>
                    )}
                    {paceSuggestion.status === 'behind' && (
                      <p style={{margin: '4px 0 0', color: '#dc2626', fontSize: '0.85rem'}}>
                        少し遅れ気味です。まずは今日のタスクを完了させましょう。
                      </p>
                    )}
                    {paceSuggestion.status === 'ontrack' && (
                      <p style={{margin: '4px 0 0', color: '#65a30d', fontSize: '0.85rem'}}>
                        目標通り進んでいます。この調子でいきましょう！
                      </p>
                    )}
                  </div>
                )}
              </div>


              {/* やる気レベル表示 */}
              {userData?.goal?.motivationLevel && (
                <div style={{
                  marginTop: '12px',
                  padding: '8px 12px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '6px',
                  fontSize: '0.9rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '500', color: '#166534' }}>
                      やる気レベル: {userData.goal.motivationLevel === 'low' ? 'そこそこ' : 
                                   userData.goal.motivationLevel === 'normal' ? '普通' : 
                                   userData.goal.motivationLevel === 'high' ? 'やる気満々' : '不明'}
                    </span>
                    <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                      {userData.goal.motivationLevel === 'low' ? '約19分/日' : 
                       userData.goal.motivationLevel === 'normal' ? '約27分/日' : 
                       userData.goal.motivationLevel === 'high' ? '約40分/日' : ''}
                    </span>
                  </div>
                </div>
              )}


              <button
                className="ghost-button"
                style={{ alignSelf: 'flex-start', marginTop: '12px' }}
                onClick={handleResetGoal}
              >
                目標を再設定する
              </button>

              <div className={`schedule-banner ${scheduleMetrics?.status}`}>
                {scheduleMetrics ? (
                  <>
                    <div>
                      <h4>締切: {scheduleMetrics.deadlineLabel}</h4>
                      <p>残り {scheduleMetrics.remainingWords.toLocaleString()} 語 / {scheduleMetrics.remainingDays} 日</p>
                    </div>
                    <div className="schedule-math">
                      <span>推奨 {scheduleMetrics.recommendedPerDay} 語/日</span>
                      <span>今日 {scheduleMetrics.todaysPlan} 語</span>
                    </div>
                  </>
                ) : (
                  <p>目標または締切が未設定です。</p>
                )}
              </div>

            </div>

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
              </div>
            </div>

            {outstandingSummary.show && (
              <div className="alert-card info">
                <div className="alert-pill">
                  今日やること
                </div>
                <div className="alert-body">
                  {outstandingSummary.hasOutstandingNew && (
                    <p>新規単語がまだ {outstandingSummary.newWordCount} 語残っています。</p>
                  )}
                  {outstandingSummary.hasOutstandingReview && (
                    <p>復習単語は {outstandingSummary.reviewCount} 語。忘れる前にチェックしましょう。</p>
                  )}
                  {!outstandingSummary.hasOutstandingNew && !outstandingSummary.hasOutstandingReview && (
                    <p>本日の必須タスクは完了しました！おかわり学習でさらに前倒しできます。</p>
                  )}
                </div>
              </div>
            )}



          </>
        );
    }
  };

  // タブバーコンポーネント
  const TabBar = () => (
    <div className="tab-bar">
                <button 
        className={`tab-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => setActiveTab('home')}
      >
        <span className="tab-label">HOME</span>
      </button>
      <button 
        className={`tab-item ${activeTab === 'story' ? 'active' : ''}`}
        onClick={() => setActiveTab('story')}
      >
        <span className="tab-label">長文</span>
      </button>
      <button 
        className={`tab-item ${activeTab === 'free-study' ? 'active' : ''}`}
        onClick={() => setActiveTab('free-study')}
      >
        <span className="tab-label">自由学習</span>
      </button>
      <button 
        className={`tab-item ${activeTab === 'analytics' ? 'active' : ''}`}
        onClick={() => setActiveTab('analytics')}
      >
        <span className="tab-label">詳細分析</span>
                </button>
                </div>
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
        return renderStoryContent();
      case 'free-study':
        return renderFreeStudyContent();
      case 'analytics':
        return renderAnalyticsContent();
      default:
        return renderContent();
    }
  };

  // 詳細分析コンポーネント
  const AnalyticsContent = () => {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [predictions, setPredictions] = useState(null);
  const [smartRecommendations, setSmartRecommendations] = useState([]);

    useEffect(() => {
      const loadAnalytics = async () => {
        setLoading(true);
        try {
          const user = auth.currentUser;
          if (user) {
            console.log('🔍 詳細分析開始:', user.uid);
            
            // まずユーザーデータを最新状態で取得
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            let currentUserLevel = 0;
            if (userDoc.exists()) {
              const userData = userDoc.data();
              console.log('👤 最新ユーザーデータ:', userData);
              currentUserLevel = userData.level || 0;
              console.log('📊 ユーザーデータから取得したレベル:', currentUserLevel);
            }
            
            // 基本的な分析データを取得
            const analysis = await analyzeUserPerformance(user.uid);
            console.log('📊 分析結果:', analysis);
            
            // ユーザーデータのレベルを優先して使用
            const correctedAnalysis = {
              ...analysis,
              currentLevel: currentUserLevel || analysis.currentLevel
            };
            
            console.log('📊 詳細分析 - 修正後の現在のレベル:', correctedAnalysis.currentLevel);
            console.log('📊 詳細分析 - テスト回数:', correctedAnalysis.totalTests);
            console.log('📊 詳細分析 - 平均回答時間:', correctedAnalysis.averageResponseTime);
            setAnalyticsData(correctedAnalysis);
            
            if (correctedAnalysis.hasData) {
              const recs = generateLearningRecommendations(correctedAnalysis);
              console.log('💡 推奨事項:', recs);
              setRecommendations(recs);
              
              // 予測データを取得
              const pred = await predictPerformance(user.uid);
              console.log('🔮 予測結果:', pred);
              setPredictions(pred);
              
              // スマート推奨を取得
              const smartRecs = await generateSmartRecommendations(user.uid);
              console.log('🎯 スマート推奨:', smartRecs);
              setSmartRecommendations(smartRecs.recommendations || []);
            } else {
              console.log('❌ 分析データなし:', correctedAnalysis);
            }
          } else {
            console.log('❌ ユーザーがログインしていません');
          }
        } catch (error) {
          console.error('Failed to load analytics:', error);
        } finally {
          setLoading(false);
        }
      };
      
      loadAnalytics();
    }, []); // 初回のみ実行

    // 初回読み込み時のみデータを取得
    // 定期更新や外部状態への依存を削除して他の機能への影響を防ぐ

    if (loading) {
      return (
        <div className="analytics-tab-content">
          <div className="section-card">
            <h2 className="section-title">詳細分析</h2>
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>分析データを読み込み中...</p>
            </div>
          </div>
        </div>
      );
    }

    // デバッグ: 現在の状態を確認
    console.log('🔍 詳細分析レンダリング時の状態:', {
      analyticsData,
      hasData: analyticsData?.hasData,
      currentLevel: analyticsData?.currentLevel,
      totalTests: analyticsData?.totalTests,
      loading
    });

    if (!analyticsData || !analyticsData.hasData) {
      return (
        <div className="analytics-tab-content">
          <div className="section-card">
            <h2 className="section-title">詳細分析</h2>
            <div className="empty-state">
              <div className="empty-icon">📈</div>
              <p>まだテストデータがありません。</p>
              <p>まずは単語力チェックテストを受けてください。</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="analytics-tab-content">
        <div className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 className="section-title">詳細分析</h2>
              <p className="section-description">あなたの学習データを詳しく分析しています。</p>
            </div>
          </div>
          
          {/* 基本統計 */}
          <div className="analytics-section">
            <div className="section-header">
              <h3>基本統計</h3>
              <div className="section-divider"></div>
            </div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-label">現在のレベル</span>
                  <div className="stat-icon level-icon">LV</div>
                </div>
                <div className="stat-value">
                  {analyticsData.currentLevel === 0 ? (
                    <span style={{ color: '#ef4444', fontSize: '1.2rem' }}>未測定</span>
                  ) : analyticsData.currentLevel > 10 ? (
                    <span style={{ color: '#ef4444', fontSize: '1.2rem' }}>データエラー</span>
                  ) : (
                    eikenLevelDescriptions[analyticsData.currentLevel]?.label || `レベル${analyticsData.currentLevel}`
                  )}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-label">テスト回数</span>
                  <div className="stat-icon test-icon">TEST</div>
                </div>
                <div className="stat-value">{analyticsData.totalTests}</div>
                <div className="stat-unit">回</div>
              </div>
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-label">レベル上昇</span>
                  <div className="stat-icon growth-icon">↑</div>
                </div>
                <div className="stat-value">
                  {analyticsData.improvementRate > 0 && '+'}{analyticsData.improvementRate}
                  {analyticsData.improvementRate !== 0 && (
                    <span className="level-change-detail">
                      ({analyticsData.improvementRate > 0 ? '上昇' : '下降'})
                    </span>
                  )}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-label">平均回答時間</span>
                  <div className="stat-icon time-icon">⏱</div>
                </div>
                <div className="stat-value">{Math.round(analyticsData.averageResponseTime / 1000)}</div>
                <div className="stat-unit">秒</div>
              </div>
            </div>
          </div>

          {/* 苦手分野 */}
          {analyticsData.weakAreas && analyticsData.weakAreas.length > 0 && (
            <div className="analytics-section">
              <div className="section-header">
                <h3>苦手分野</h3>
                <div className="section-divider"></div>
              </div>
              <div className="weak-areas-list">
                {analyticsData.weakAreas.map((area, index) => {
                  const eikenLevel = getEikenLevel(area.level);
                  
                  return (
                    <div key={index} className="weak-area-item clickable" onClick={() => {
                      console.log('苦手分野クリック:', { level: area.level, eikenLevel });
                      
                      // レベルに応じて適切な教材を選択
                      let targetTextbookId = '';
                      if (area.level <= 3) {
                        targetTextbookId = 'osaka-koukou-nyuushi'; // 中学レベル
                      } else if (area.level <= 7) {
                        targetTextbookId = 'highschool-english'; // 高校レベル
                      } else {
                        targetTextbookId = 'osaka-koukou-nyuushi'; // その他
                      }
                      
                      // 自由学習タブに切り替えて教材を選択
                      setActiveTab('free-study');
                      handleSelectTextbook(targetTextbookId);
                      
                      // 少し遅延してからレベル学習を開始
                      setTimeout(() => {
                        startLearning('level', area.level);
                      }, 100);
                    }}>
                      <div className="weak-area-header">
                        <span className="area-level">
                          自由学習メニューの{eikenLevel}から始めましょう
                        </span>
                        <div className="accuracy-badge">{Math.round(area.accuracy)}%</div>
                      </div>
                      <div className="area-details">
                        <span className="area-questions">{area.totalQuestions}問実施済み</span>
                        <span className="click-hint">クリックして学習開始</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 学習パターン */}
          <div className="analytics-section">
            <div className="section-header">
              <h3>学習パターン</h3>
              <div className="section-divider"></div>
            </div>
            <div className="study-patterns">
              <div className="pattern-card">
                <div className="pattern-label">最適な学習時間</div>
                <div className="pattern-value">{analyticsData.optimalStudyTime?.optimalHour || 12}時</div>
              </div>
              <div className="pattern-card">
                <div className="pattern-label">最適な学習曜日</div>
                <div className="pattern-value">{analyticsData.optimalStudyTime?.optimalDay || '月'}曜日</div>
              </div>
              <div className="pattern-card">
                <div className="pattern-label">平均学習間隔</div>
                <div className="pattern-value">{Math.round(analyticsData.optimalStudyTime?.averageSessionInterval || 0)}日</div>
              </div>
            </div>
          </div>

          {/* 学習セッション分析 */}
          {analyticsData.learningSessions && analyticsData.learningSessions.total > 0 && (
            <div className="analytics-section">
              <div className="section-header">
                <h3>学習セッション分析</h3>
                <div className="section-divider"></div>
              </div>
              <div className="learning-sessions-info">
                <div className="session-summary">
                  <div className="session-stat-card">
                    <div className="session-stat-label">総学習セッション数</div>
                    <div className="session-stat-value">{analyticsData.learningSessions.total}</div>
                    <div className="session-stat-unit">回</div>
                  </div>
                  <div className="session-stat-card">
                    <div className="session-stat-label">学習継続率</div>
                    <div className="session-stat-value">{analyticsData.learningSessions.frequency}</div>
                    <div className="session-stat-unit">%</div>
                  </div>
                </div>
                
                <div className="session-types">
                  <h4>学習タイプ別統計</h4>
                  <div className="type-list">
                    {analyticsData.learningSessions.types.map((type, index) => (
                      <div key={index} className="type-item">
                        <div className="type-info">
                          <span className="type-name">
                            {type.type === 'learning_session' && '新規学習'}
                            {type.type === 'review_session' && '復習学習'}
                            {type.type === 'free_study_session' && '自由学習'}
                            {type.type === 'placement_test' && '実力テスト'}
                            {!['learning_session', 'review_session', 'free_study_session', 'placement_test'].includes(type.type) && type.type}
                          </span>
                          <span className="type-count">{type.count}回</span>
                        </div>
                        <div className="type-progress">
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${type.percentage}%` }}></div>
                          </div>
                          <span className="type-percentage">{type.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 予測機能 */}
          {predictions && predictions.hasData && (
            <div className="analytics-section">
              <div className="section-header">
                <h3>学習予測</h3>
                <div className="section-divider"></div>
              </div>
              <div className="prediction-card">
                <div className="prediction-summary">
                  <div className="prediction-item">
                    <div className="prediction-label">1週間後の予測レベル</div>
                    <div className="prediction-value">
                      {predictions.nextWeekLevel > 7 ? (
                        <span style={{ color: '#ef4444' }}>データエラー</span>
                      ) : (
                        levelDescriptions[predictions.nextWeekLevel]?.label || `レベル${predictions.nextWeekLevel}`
                      )}
                    </div>
                  </div>
                  <div className="prediction-item">
                    <div className="prediction-label">予測の信頼度</div>
                    <div className="prediction-value">{Math.round(predictions.confidence * 100)}%</div>
                  </div>
                </div>
                {predictions.recommendations && predictions.recommendations.length > 0 && (
                  <div className="prediction-recommendations">
                    <h4>予測に基づくアドバイス</h4>
                    <div className="recommendation-list">
                      {predictions.recommendations.map((rec, index) => (
                        <div key={index} className={`prediction-recommendation ${rec.priority}`}>
                          <div className="recommendation-content">
                            <span className="recommendation-message">{rec.message}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* スマート推奨 */}
          {smartRecommendations.length > 0 && (
            <div className="analytics-section">
              <div className="section-header">
                <h3>スマート推奨</h3>
                <div className="section-divider"></div>
              </div>
              <div className="smart-recommendations-list">
                {smartRecommendations.map((rec, index) => {
                  // レベルベースの推奨の場合はクリック可能にする
                  const isClickable = rec.type === 'focus_level' && rec.targetLevel;
                  const handleClick = isClickable ? async () => {
                    console.log('スマート推奨クリック:', { level: rec.targetLevel });
                    
                    // レベルに応じて適切な教材を選択
                    let targetTextbookId = '';
                    if (rec.targetLevel <= 3) {
                      targetTextbookId = 'osaka-koukou-nyuushi'; // 中学レベル
                    } else if (rec.targetLevel <= 7) {
                      targetTextbookId = 'highschool-english'; // 高校レベル
                    } else {
                      targetTextbookId = 'osaka-koukou-nyuushi'; // その他
                    }
                    
                    // 教材を選択してから学習を開始
                    await handleSelectTextbook(targetTextbookId);
                    await startLearning('level', rec.targetLevel);
                  } : undefined;
                  
                  
                  // タイトルと説明文を英検級レベルで表示するように変換
                  const displayTitle = isClickable && rec.targetLevel 
                    ? rec.title.replace(/レベル \d+/, getEikenLevel(rec.targetLevel))
                    : rec.title;
                  const displayDescription = isClickable && rec.targetLevel
                    ? rec.description.replace(/レベル \d+/, getEikenLevel(rec.targetLevel))
                    : rec.description;
                  const displayTargetMetric = isClickable && rec.targetLevel
                    ? rec.targetMetric?.replace(/レベル \d+/, getEikenLevel(rec.targetLevel))
                    : rec.targetMetric;
                  
                  return (
                    <div 
                      key={index} 
                      className={`smart-recommendation-item ${rec.priority} ${isClickable ? 'clickable' : ''}`}
                      onClick={handleClick}
                    >
                      <div className="smart-recommendation-header">
                        <h4 className="smart-recommendation-title">{displayTitle}</h4>
                        <span className={`smart-priority-badge ${rec.priority}`}>
                          {rec.priority === 'high' && '重要'}
                          {rec.priority === 'medium' && '推奨'}
                          {rec.priority === 'low' && '参考'}
                        </span>
                      </div>
                      <p className="smart-recommendation-description">{displayDescription}</p>
                      <div className="smart-recommendation-meta">
                        <span className="estimated-time">{rec.estimatedTime}</span>
                        {displayTargetMetric && <span className="target-metric">{displayTargetMetric}</span>}
                        {isClickable && <span className="click-hint">クリックして学習開始</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 従来の推奨事項 */}
          {recommendations.length > 0 && (
            <div className="analytics-section">
              <div className="section-header">
                <h3>学習推奨</h3>
                <div className="section-divider"></div>
              </div>
              <div className="recommendations-list">
                {recommendations.map((rec, index) => {
                  
                  // メッセージ内のレベル表記を英検級に変換
                  const displayMessage = rec.message
                    .replace(/レベル\s*(\d+)/g, (match, level) => getEikenLevel(parseInt(level)))
                    .replace(/中学レベルの単語/g, '英検3級レベルの単語')
                    .replace(/高校レベルの単語/g, '英検準2級〜2級レベルの単語')
                    .replace(/大学レベルの単語/g, '英検準1級〜1級レベルの単語');
                  
                  return (
                    <div key={index} className={`recommendation-item ${rec.priority}`}>
                      <div className="recommendation-header">
                        <span className="recommendation-type">
                          {rec.type === 'basic' && '基礎学習'}
                          {rec.type === 'intermediate' && '中級学習'}
                          {rec.type === 'advanced' && '上級学習'}
                          {rec.type === 'weakness' && '苦手克服'}
                          {rec.type === 'speed' && '速度向上'}
                          {rec.type === 'frequency' && '学習頻度'}
                        </span>
                        <span className={`priority-badge ${rec.priority}`}>
                          {rec.priority === 'high' && '重要'}
                          {rec.priority === 'medium' && '推奨'}
                          {rec.priority === 'low' && '参考'}
                        </span>
                      </div>
                      <p className="recommendation-message">{displayMessage}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 詳細分析タブのコンテンツ
  const renderAnalyticsContent = () => {
    return <AnalyticsContent />;
  };

  // 長文タブのコンテンツ
  const renderStoryContent = () => (
    <div className="story-tab-content">
      <div className="section-card">
        <h2 className="section-title">君が世界で最も嫌いな長文</h2>
        <p className="section-description">英文とその和訳を交互に表示する長文学習機能です。</p>
              
              {storiesLoading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>長文データを読み込み中...</p>
          </div>
        ) : isGeneratingStory ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>長文を生成しています...</p>
          </div>
        ) : monthlyStory && monthlyStory.sentences && Array.isArray(monthlyStory.sentences) ? (
          <div className="story-content">
            <div className="story-header">
              <h3>{monthlyStory.title || '長文'}</h3>
              <p className="story-date">
                {monthlyStory.createdAt ? 
                  (typeof monthlyStory.createdAt === 'object' && monthlyStory.createdAt.seconds ? 
                    new Date(monthlyStory.createdAt.seconds * 1000).toLocaleDateString('ja-JP') :
                    monthlyStory.createdAt.toString()
                  ) : ''
                }
              </p>
            </div>
            <div className="story-text">
              {monthlyStory.sentences.map((sentence, index) => (
                <div key={index} className="sentence-pair">
                  <div className="english-sentence">
                    {sentence.english ? highlightReviewWords(sentence.english, monthlyStory.usedWords || []) : ''}
                  </div>
                  <div className="japanese-sentence">{sentence.japanese || ''}</div>
                </div>
              ))}
            </div>
            
            {/* 使用できなかった復習単語の表示 */}
            {monthlyStory.unusedWords && monthlyStory.unusedWords.length > 0 && (
              <div className="unused-words-section" style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#6c757d', fontSize: '0.9rem' }}>使用できなかった復習単語</h4>
                <div className="unused-words-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {monthlyStory.unusedWords.map((word, index) => (
                    <span key={index} className="unused-word-tag" style={{
                      backgroundColor: '#e9ecef',
                      color: '#6c757d',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      border: '1px solid #dee2e6'
                    }}>
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}
                <button 
              className="story-generate-btn"
                  onClick={handleGenerateStory} 
            >
              <FaMagic /> 新しい長文を生成
            </button>
            </div>
        ) : (
          <div className="no-story">
            <p>まだ長文が生成されていません。</p>
            <button 
                  className="story-generate-btn"
              onClick={handleGenerateStory}
                >
              <FaMagic /> 長文を生成する
                </button>
              </div>
        )}
              
        {/* 過去の長文一覧 */}
        {console.log('長文タブ - pastStories:', pastStories, 'storiesLoading:', storiesLoading, 'pastStories.length:', pastStories.length)}
        {pastStories.length > 0 && (
          <div className="section-card" style={{ marginTop: '20px' }}>
            <h3 className="section-title">過去の長文一覧</h3>
              {storiesLoading ? (
              <div className="loading-container" style={{height: '50px'}}>
                <div className="loading-spinner"></div>
              </div>
            ) : (
                  <div className="past-stories-list">
                {pastStories.map(story => {
                  console.log('長文データ詳細:', story.id, story);
                  return (
                          <details key={story.id} className="past-story-item">
                      <summary style={{ 
                        padding: '1rem', 
                        backgroundColor: '#f8f9fa', 
                        cursor: 'pointer', 
                        fontWeight: '600',
                        borderRadius: '8px',
                        marginBottom: '8px',
                        border: '1px solid #e9ecef'
                      }}>
                        {story.id} の長文 {story.sentences ? `(${story.sentences.length}文)` : '(文なし)'}
                      </summary>
                      <div style={{ padding: '1rem', backgroundColor: 'white', borderRadius: '8px' }}>
                        <div className="story-text">
                          {story.sentences && story.sentences.length > 0 ? (
                            <>
                              {story.sentences.map((sentence, index) => (
                                <div key={index} className="sentence-pair">
                                  <div className="english-sentence">
                                    {sentence.english ? highlightReviewWords(sentence.english, story.usedWords || []) : ''}
                                  </div>
                                  <div className="japanese-sentence">{sentence.japanese || ''}</div>
                                </div>
                              ))}
                              
                              {/* 使用できなかった復習単語の表示 */}
                              {story.unusedWords && story.unusedWords.length > 0 && (
                                <div className="unused-words-section" style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
                                  <h5 style={{ margin: '0 0 8px 0', color: '#6c757d', fontSize: '0.8rem' }}>使用できなかった復習単語</h5>
                                  <div className="unused-words-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {story.unusedWords.map((word, index) => (
                                      <span key={index} className="unused-word-tag" style={{
                                        backgroundColor: '#e9ecef',
                                        color: '#6c757d',
                                        padding: '3px 6px',
                                        borderRadius: '3px',
                                        fontSize: '0.75rem',
                                        border: '1px solid #dee2e6'
                                      }}>
                                        {word}
                                      </span>
                      ))}
                  </div>
                                </div>
                              )}
                </>
              ) : (
                            <p style={{ color: '#64748b', fontStyle: 'italic' }}>
                              この長文には文が含まれていません。
                </p>
              )}
            </div>
                      </div>
                          </details>
                  );
                })}
                  </div>
              )}
            </div>
        )}
        
        {/* 長文データが存在しない場合の表示 */}
        {!storiesLoading && pastStories.length === 0 && (
          <div className="section-card" style={{ marginTop: '20px' }}>
            <h3 className="section-title">過去の長文一覧</h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', textAlign: 'center', padding: '2rem' }}>
              過去に生成された長文はありません。
            </p>
          </div>
        )}
      </div>
    </div>
  );

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ 
                      fontSize: '0.9rem', 
                      color: 'var(--primary-color)', 
                      fontWeight: '600',
                      backgroundColor: 'var(--primary-light)',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem'
                    }}>
                      選択中: {freeStudyOptions.find(opt => opt.id === selectedTextbookId)?.label || selectedTextbookId}
                    </span>
                    <button className="ghost-button" onClick={handleBackToMainMenu}>
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
              
              const wordCount = getTextbookWordCount(id);
              
              return (
                <button key={id} className="tile-button" onClick={() => {
                  console.log('🎯 教材選択ボタンクリック:', { id, label, isRecommended, wordCount });
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
                        
                        console.log(`🔍 英検${currentLevelEiken}級フィルタリング:`, {
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
                    console.log(`🔍 高校英語レベル${level}→${targetLevel}フィルタリング:`, {
                      全単語数: allWords.length,
                      フィルタ後単語数: levelWords.length,
                      サンプル単語: levelWords.slice(0, 3).map(w => ({ word: w.word, level: w.level }))
                    });
                  } else if (selectedTextbookId === 'osaka-koukou-nyuushi') {
                    // 大阪府公立入試英単語の場合はlevelフィールドを基準にフィルタ
                    levelWords = allWords.filter(word => word.level === parseInt(level));
                    console.log(`🔍 大阪府公立入試英単語レベル${level}フィルタリング:`, {
                      全単語数: allWords.length,
                      フィルタ後単語数: levelWords.length,
                      サンプル単語: levelWords.slice(0, 3).map(w => ({ word: w.word, level: w.level }))
                    });
                  } else {
                    // その他の教材の場合はlevelフィールドを基準にフィルタ
                    levelWords = allWords.filter(word => word.level === parseInt(level));
                    console.log(`🔍 通常レベル${level}フィルタリング:`, {
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
                  
                  // 推奨判定
                  const isRecommended = isRecommendedLevel(Number(level), testResultLevel);
                  const recommendations = getRecommendedLevels(testResultLevel);
                  const recommendationType = recommendations.recommended.find(rec => rec.level === Number(level));
                  const priority = recommendationType ? recommendationType.priority : 'medium';
                  
                                  // 詳細デバッグログ（すべてのレベルで出力）
                  console.log('🎯 親レベル推奨判定詳細:', {
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
                    
                    console.log('🔍 英検級フィルタリング:', {
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
                    
                    console.log(`英検${targetEikenLevel}級の単語数:`, parentLevelWords.length);
                    
                    // サンプル単語を表示
                    const sampleWords = parentLevelWords.slice(0, 5).map(w => w.word);
                    console.log(`英検${targetEikenLevel}級のサンプル単語:`, sampleWords);
                  } else if (selectedTextbookId === 'highschool-english') {
                    // 高校英語の場合：選択された親レベル内の英単語をサブレベル別に分けて表示
                    // 高校英語のレベルマッピング: 1→5, 2→6, 3→7
                    const highschoolLevelMapping = { 1: 5, 2: 6, 3: 7 };
                    const targetLevel = highschoolLevelMapping[selectedParentLevel];
                    
                    console.log('🎓 高校英語フィルタリング:', {
                      selectedTextbookId,
                      selectedParentLevel,
                      targetLevel,
                      allWordsLength: allWords.length
                    });
                    
                    // 選択された親レベル内の英単語を取得（当該レベルのみ）
                    parentLevelWords = allWords.filter(word => word.level === targetLevel);
                    
                    console.log(`高校英語レベル${targetLevel}の単語数:`, parentLevelWords.length);
                    
                    // サンプル単語を表示
                    const sampleWords = parentLevelWords.slice(0, 5).map(w => w.word);
                    console.log(`高校英語レベル${targetLevel}のサンプル単語:`, sampleWords);
                  } else {
                    // その他の教材の場合：選択された親レベルの単語を取得
                    parentLevelWords = allWords.filter(word => word.level === selectedParentLevel);
                    console.log(`レベル${selectedParentLevel}の単語数:`, parentLevelWords.length);
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
                  
                  console.log('サブレベル表示のランク分け:', {
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
                    console.log(`レベル${level}のサンプル単語:`, sampleWords);
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
                          console.log('🎯 子レベル推奨バッジ表示:', {
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
                    console.log('サンプル単語の品詞データ:', allWords.slice(0, 5).map(w => ({
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
                        console.log(`品詞 ${pos} (${posAbbr}): ${count}語`);
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
      <header className="dashboard-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: window.innerWidth < 768 ? '1rem' : '1rem 2rem',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        minHeight: '60px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h2 className='logo-title' style={{
            fontSize: window.innerWidth < 768 ? '2rem' : '2.5rem',
            fontWeight: 'bold',
            color: '#A3E635',
            margin: 0,
            marginRight: window.innerWidth < 768 ? '0.5rem' : '1rem'
          }}>
            つくたん
          </h2>
        </div>
        
        <div className="user-info" style={{
          display: 'flex',
          alignItems: 'center',
          gap: window.innerWidth < 768 ? '0.5rem' : '1rem'
        }}>
          {userData && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              padding: window.innerWidth < 768 ? '0.3rem 0.6rem' : '0.4rem 0.8rem',
              backgroundColor: '#f3f4f6',
              borderRadius: '20px',
              fontSize: window.innerWidth < 768 ? '0.7rem' : '0.8rem',
              color: '#374151'
            }}>
              <span style={{ fontWeight: '500' }}>{userData.name}</span>
            </div>
          )}
                    <button
            onClick={handleLogout} 
            className="logout-btn"
            style={{
              padding: window.innerWidth < 768 ? '0.3rem 0.6rem' : '0.4rem 0.8rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: window.innerWidth < 768 ? '0.7rem' : '0.8rem',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#4b5563';
              e.target.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#6b7280';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            ログアウト
                    </button>
                </div>
      </header>
      
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
              🎯 単語力チェックテスト
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