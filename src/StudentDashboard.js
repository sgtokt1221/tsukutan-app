import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from './firebaseConfig';
// ▼▼▼ Firebaseの初期化とFunctionsを呼び出すためのインポートを修正 ▼▼▼
import { collection, getDocs, doc, getDoc, setDoc, query, orderBy, limit, updateDoc, increment, where } from "firebase/firestore";

// 既存のコンポーネントとロジックのインポート
import { generateDailyPlan } from './logic/learningPlanner';
import { addWordToReview } from './logic/reviewLogic';
import { updateProgressPercentage } from './logic/progressLogic';
import { logStudySession } from './logic/studyLogger';
import { saveFreeStudyProgress, getFreeStudyProgress, getAllFreeStudyProgress, updateAllFreeStudyProgress } from './logic/freeStudyProgress';
import VocabularyCheckTest from './VocabularyCheckTest';
import TestResult from './TestResult';
import LearningFlashcard from './LearningFlashcard';
import ReviewFlashcard from './ReviewFlashcard';
import LevelBadge from './LevelBadge';
// import { buildThemeGroups, computeKnowledgeMap, getKnowledgeGaps } from './logic/knowledgeAnalysis';

// アイコンのインポート
import { FaBook, FaSyncAlt, FaMagic } from 'react-icons/fa';

// 既存の定数やヘルパー関数（すべて維持）
const textbooks = {
  'osaka-koukou-nyuushi': '大阪府公立入試英単語',
  'highschool-english': '高校英語'
};
const freeStudyOptions = [
  { id: 'osaka-koukou-nyuushi', label: '大阪府公立入試英単語', textbooks: ['osaka-koukou-nyuushi'], levels: [1, 2, 3, 4] },
  { id: 'highschool-english', label: '高校英語', textbooks: ['highschool-english'], levels: [4, 5, 6, 7, 8, 9, 10] },
  { id: 'eiken-5', label: '英検5級', textbooks: ['osaka-koukou-nyuushi', 'highschool-english'] },
  { id: 'eiken-4', label: '英検4級', textbooks: ['osaka-koukou-nyuushi', 'highschool-english'] },
  { id: 'eiken-3', label: '英検3級', textbooks: ['osaka-koukou-nyuushi', 'highschool-english'] },
  { id: 'eiken-pre2', label: '英検準2級', textbooks: ['osaka-koukou-nyuushi', 'highschool-english'] },
  { id: 'eiken-2', label: '英検2級', textbooks: ['osaka-koukou-nyuushi', 'highschool-english'] },
  { id: 'eiken-pre1', label: '英検準1級', textbooks: ['osaka-koukou-nyuushi', 'highschool-english'] },
  { id: 'eiken-1', label: '英検1級', textbooks: ['osaka-koukou-nyuushi', 'highschool-english'] }
];
// 通常のレベル定義
const levelDescriptions = {
    1: { label: "中学基礎", equivalent: "英検5級 / Pre-A1", wordsRequired: 600 },
    2: { label: "中学標準", equivalent: "英検4級 / A1", wordsRequired: 1300 },
    3: { label: "中学卒業", equivalent: "英検3級 / A2", wordsRequired: 2100 },
    4: { label: "高校基礎", equivalent: "英検準2級 / A2", wordsRequired: 3600 },
    5: { label: "高校標準", equivalent: "英検2級 / B1", wordsRequired: 5100 },
    6: { label: "高校応用", equivalent: "英検2級〜準1級 / B1-B2", wordsRequired: 6000 },
    7: { label: "大学中級", equivalent: "英検準1級 / B2", wordsRequired: 8000 },
    8: { label: "大学上級", equivalent: "英検1級 / C1", wordsRequired: 10000 },
    9: { label: "超上級", equivalent: "英検1級+", wordsRequired: 12000 },
    10:{ label: "ネイティブ", equivalent: "ネイティブレベル", wordsRequired: 15000 }
};

// 英検教材用のレベル定義
const eikenLevelDescriptions = {
    1: { label: "英検5級レベル", equivalent: "英検5級相当", wordsRequired: 600 },
    2: { label: "英検4級レベル", equivalent: "英検4級相当", wordsRequired: 1300 },
    3: { label: "英検3級レベル", equivalent: "英検3級相当", wordsRequired: 2100 },
    4: { label: "英検準2級レベル", equivalent: "英検準2級相当", wordsRequired: 3600 },
    5: { label: "英検2級レベル", equivalent: "英検2級相当", wordsRequired: 5100 },
    6: { label: "英検準1級レベル", equivalent: "英検準1級相当", wordsRequired: 6000 },
    7: { label: "英検1級レベル", equivalent: "英検1級相当", wordsRequired: 8000 },
    8: { label: "上級レベル", equivalent: "英検1級+", wordsRequired: 10000 },
    9: { label: "最上級レベル", equivalent: "ネイティブ級", wordsRequired: 12000 },
    10:{ label: "ネイティブレベル", equivalent: "ネイティブ級", wordsRequired: 15000 }
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
  const [viewMode, setViewMode] = useState('select');
  const [selectionMode, setSelectionMode] = useState('main');
  const [testResultLevel, setTestResultLevel] = useState(0);
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

        const yearMonth = new Date().toISOString().slice(0, 7);
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
    try {
      const userDocRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData(data);
        setTestResultLevel(data.level || 0);
        
        const plan = await generateDailyPlan(data, uid);
        setDailyPlan(plan);

        // Check for daily completion
        const todayStr = new Date().toISOString().slice(0, 10);
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
            const dayKey = ts.toISOString().slice(0, 10);

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

        const logsColRef = collection(db, 'users', uid, 'logs');
        const q = query(logsColRef, orderBy("timestamp", "desc"), limit(1));
        const logSnapshot = await getDocs(q);
        // setLastSession(logSnapshot.empty ? null : logSnapshot.docs[0].data());
      } else {
        console.log("No such document! Redirecting to test.");
        setViewMode('test'); 
      }
    } catch (error) {
      console.error("Error refreshing dashboard data: ", error);
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
  }, [refreshDashboardData, navigate, fetchStories]);
  
  // --- イベントハンドラ (既存のものは変更なし) ---
  const handleLogout = () => auth.signOut().then(() => navigate('/login'));
  
  const startCheckTest = async () => {
    setLoading(true);
    try {
      let combinedWords = [];
      const textbookIds = Object.keys(textbooks);
      for (const id of textbookIds) {
        const wordsSnapshot = await getDocs(collection(db, 'textbooks', id, 'words'));
        combinedWords.push(...wordsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      }
      const uniqueWords = Array.from(new Map(combinedWords.map(w => [w.word, w])).values());
      setTestWords(uniqueWords);
      setViewMode('test');
    } catch (error) {
      console.error("Error fetching test words:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTestComplete = (finalLevel) => {
    setTestResultLevel(finalLevel);
    if (auth.currentUser) {
      refreshDashboardData(auth.currentUser.uid);
    }
    setViewMode('result');
  };

  const markDailyTaskAsCompleted = async (userId) => {
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
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
      incorrectWords.forEach(word => {
        addWordToReview(user.uid, word);
      });
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
        for (const id of targetTextbookIds) {
          const snapshot = await getDocs(collection(db, 'textbooks', id, 'words'));
          const words = snapshot.docs.map(d => ({ id: d.id, sourceTextbook: id, ...d.data() }));
          combinedWords.push(...words);
          console.log(`テキストブック ${id} から取得した単語数:`, words.length);
        }

        // 単語の重複を除去（'word'プロパティを基準に）
        const uniqueWords = Array.from(new Map(combinedWords.map(item => [item.word, item])).values());
        console.log('重複除去後の単語数:', uniqueWords.length);

        let filteredWords = uniqueWords;
        
        // 英検級の場合は完全に独立したフィルタリング
        if (option.id.startsWith('eiken-')) {
          // 英検級の識別子を取得（例: 'eiken-5' → 5, 'eiken-pre2' → 'pre2', 'eiken-pre1' → 'pre1'）
          const levelPart = option.id.split('-')[1];
          let eikenLevel;
          if (levelPart === 'pre2') {
            eikenLevel = 'pre2';
          } else if (levelPart === 'pre1') {
            eikenLevel = 'pre1';
          } else {
            eikenLevel = parseInt(levelPart);
          }
          
          filteredWords = filteredWords.filter(word => {
            // eikenLevelsフィールドに該当する級が含まれている場合のみ表示
            return word.eikenLevels && 
                   Array.isArray(word.eikenLevels) && 
                   word.eikenLevels.includes(eikenLevel);
          });
          console.log(`英検${eikenLevel}級フィルタ後:`, filteredWords.length);
        } else if (option?.levels?.length) {
          // 通常のレベル別の場合は既存のlevelフィールドを使用
          filteredWords = filteredWords.filter(word => {
            return option.levels.includes(word.level);
          });
          console.log('レベルフィルタ後:', filteredWords.length);
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

        console.log('最終的な単語数（固定順序）:', filteredWords.length);
        setAllWords(filteredWords);
        
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

  const startLearning = async (filterType, value) => {
    let filtered = [];
    let sessionLabel = '';
    let startIndex = 0;
    
    console.log('学習開始:', {
      filterType,
      value,
      selectedTextbookId,
      allWordsLength: allWords.length
    });
    
    if (filterType === 'level') {
        // レベル別学習の場合、allWordsから取得（既に固定順序でソート済み）
        filtered = allWords.filter(word => word.level === value);
        console.log('allWordsから取得した単語数（固定順序）:', filtered.length);
        
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
          alert(`レベル${value}の単語が見つかりません。別のレベルを選択してください。`);
          return;
        }
        
        sessionLabel = `レベル${value}`;
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
             err.existingStory = { id: new Date().toISOString().slice(0, 7), ...errorData };
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
        id: new Date().toISOString().slice(0, 7), 
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
        return <TestResult level={testResultLevel} onRestart={() => {}} />;
      case 'select':
      default:
        const progressPercentage = userData?.progress?.percentage || 0;

        const StoryDisplay = ({ storyData }) => {
            if (!storyData) return null;

            // デフォルトのstory/translationもstory1/translation1として扱う
            const { story1, translation1, story2, translation2, unusedWords } = {
                story1: storyData.story1 || storyData.story,
                translation1: storyData.translation1 || storyData.translation,
                ...storyData
            };

            const InterleavedText = ({ story, translation, title }) => {
                if (!story || !translation) return null;

                // シンプルで確実な文分割関数
                const splitEnglishSentences = (text) => {
                    // 文末の句読点で分割（引用符内も含む）
                    const sentences = text.split(/(?<=[.!?])\s+/)
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    return sentences;
                };

                const splitJapaneseSentences = (text) => {
                    // 日本語の文分割（句読点で分割）
                    return text.split(/[。！？]+/)
                        .map(s => s.trim())
                        .filter(s => s.length > 0)
                        .map(s => {
                            // 句読点を復元
                            if (s && !/[。！？]$/.test(s)) {
                                return s + '。';
                            }
                            return s;
                        });
                };

                let englishSentences = splitEnglishSentences(story);
                let japaneseSentences = splitJapaneseSentences(translation);
                
                // デバッグ情報（開発時のみ）
                if (process.env.NODE_ENV === 'development') {
                    console.log('文分割結果:', {
                        englishCount: englishSentences.length,
                        japaneseCount: japaneseSentences.length,
                        englishSentences: englishSentences,
                        japaneseSentences: japaneseSentences
                    });
                }
                
                // 文の数を揃える（少ない方に合わせる）
                const minLength = Math.min(englishSentences.length, japaneseSentences.length);
                const interleaved = [];

                for (let i = 0; i < minLength; i++) {
                    // 英文を先に追加
                    if (englishSentences[i]) {
                        interleaved.push({ type: 'en', text: englishSentences[i].trim() });
                    }
                    // 対応する和文を追加
                    if (japaneseSentences[i]) {
                        interleaved.push({ type: 'ja', text: japaneseSentences[i].trim() });
                    }
                }
                
                // 余った文がある場合は最後に追加
                if (englishSentences.length > minLength) {
                    for (let i = minLength; i < englishSentences.length; i++) {
                        interleaved.push({ type: 'en', text: englishSentences[i].trim() });
                    }
                }
                if (japaneseSentences.length > minLength) {
                    for (let i = minLength; i < japaneseSentences.length; i++) {
                        interleaved.push({ type: 'ja', text: japaneseSentences[i].trim() });
                    }
                }

                return (
                    <div style={{ marginBottom: '2rem' }}>
                        <h4 style={{ color: 'var(--primary-color)', borderBottom: '2px solid var(--primary-color)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>{title}</h4>
                        {interleaved.map((item, index) => (
                            <p key={index} lang={item.type === 'ja' ? 'ja' : 'en'} style={{
                                background: item.type === 'ja' ? '#f3f4f6' : 'transparent',
                                padding: '0.5rem',
                                borderRadius: '4px',
                                margin: '0.5rem 0',
                                lineHeight: '1.7',
                            }}>
                                {item.text}
                            </p>
                        ))}
                    </div>
                );
            };

            return (
                <div className="story-display" style={{ marginTop: '1.5rem' }}>
                    <InterleavedText story={story1} translation={translation1} title="一つ目の長文" />
                    {story2 && <InterleavedText story={story2} translation={translation2} title="二つ目の長文" />}

                    {unusedWords && unusedWords.length > 0 && (
                        <div className="unused-words" style={{ marginTop: '1rem' }}>
                            <h5 style={{ color: '#ef4444' }}>論理的に使用できなかった単語</h5>
                            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {unusedWords.map((word, index) => (
                                    <li key={index} style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.8rem' }}>
                                        {typeof word === 'object' ? word.word : word}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            );
        };

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



            {dailyPlan?.knowledgeHints && dailyPlan.knowledgeHints.length > 0 && (
              <div className="section-card">
                <h3 className="section-title">おすすめテーマ</h3>
                <div className="knowledge-hints">
                  {dailyPlan.knowledgeHints.map((hint) => (
                    <button
                      key={hint.themeId}
                      className="knowledge-chip"
                      onClick={() => {
                        setSelectionMode('filter');
                        setFilterTab('theme');
                        requestAnimationFrame(() => startLearning('theme', hint.themeId));
                      }}
                    >
                      <span className="chip-label">{hint.label}</span>
                      <span className="chip-meta">復習 {hint.strugglingCount} / 未学習 {hint.pristineCount}</span>
                      {hint.sampleWords && hint.sampleWords.length > 0 && (
                        <span className="chip-sample">例: {hint.sampleWords.join(', ')}</span>
                      )}
                    </button>
                  ))}
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
      default:
        return renderContent();
    }
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
              className="generate-new-story-btn"
              onClick={handleGenerateStory}
            >
              新しい長文を生成
            </button>
          </div>
        ) : (
          <div className="no-story">
            <p>まだ長文が生成されていません。</p>
            <button 
              className="generate-story-btn"
              onClick={handleGenerateStory}
            >
              長文を生成する
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
            {freeStudyOptions.map(({ id, label }) => (
              <button key={id} className="tile-button" onClick={() => handleSelectTextbook(id)}>
                <span>{label}</span>
                <FaBook />
              </button>
            ))}
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
              {filterTab === 'level' && (
                Object.entries(selectedTextbookId && selectedTextbookId.startsWith('eiken-') ? eikenLevelDescriptions : levelDescriptions).map(([level, info]) => {
                  const levelWords = allWords.filter(word => word.level === Number(level));
                  const progressKey = `${selectedTextbookId}_${level}`;
                  const lastIndex = freeStudyProgress[progressKey] || 0;
                  const progressText = lastIndex > 0 ? `前回: ${lastIndex + 1}/${levelWords.length}単語まで` : '未学習';
                  
                  return (
                    <button
                      key={level}
                      className="selection-card"
                      disabled={!levelWords.length}
                      onClick={() => startLearning('level', Number(level))}
                    >
                      <span className="selection-card-level">{info.label}</span>
                      <span className="selection-card-desc">{info.equivalent}</span>
                      <span className="selection-card-meta">目安: {info.wordsRequired.toLocaleString()}語</span>
                      <span className="selection-card-progress">{progressText}</span>
                    </button>
                  );
                })
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
      <header className="dashboard-header">
        <h2 className='logo-title' style={{fontSize: '2.5rem'}}>つくたん</h2>
        <div className="user-info">
          {userData && <span>{userData.name}</span>}
          <button onClick={handleLogout} className="logout-btn">ログアウト</button>
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