import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from './firebaseConfig';
// ▼▼▼ Firebaseの初期化とFunctionsを呼び出すためのインポートを修正 ▼▼▼
import { getApp } from "firebase/app"; 
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, getDocs, doc, getDoc, setDoc, addDoc, query, orderBy, limit } from "firebase/firestore";

// 既存のコンポーネントとロジックのインポート
import { generateDailyPlan } from './logic/learningPlanner';
import { addWordToReview } from './logic/reviewLogic';
import VocabularyCheckTest from './VocabularyCheckTest';
import TestResult from './TestResult';
import LearningFlashcard from './LearningFlashcard';
import ReviewFlashcard from './ReviewFlashcard';
import LevelBadge from './LevelBadge';

// アイコンのインポート
import { FaBook, FaSyncAlt, FaBullseye, FaExclamationTriangle, FaPen, FaMagic } from 'react-icons/fa';

// 既存の定数やヘルパー関数（すべて維持）
const textbooks = {
  'osaka-kouhou-nyuushi': '大阪府公立入試英単語',
  'target-1900': 'ターゲット1900'
};
const levelDescriptions = {
    1: { label: "中学基礎", equivalent: "英検5級 / Pre-A1" },
    2: { label: "中学標準", equivalent: "英検4級 / A1" },
    3: { label: "中学卒業", equivalent: "英検3級 / A2" },
    4: { label: "高校基礎", equivalent: "英検準2級 / A2" },
    5: { label: "高校標準", equivalent: "英検2級 / B1" },
    6: { label: "高校応用", equivalent: "英検2級〜準1級 / B1-B2" },
    7: { label: "大学中級", equivalent: "英検準1級 / B2" },
    8: { label: "大学上級", equivalent: "英検1級 / C1" },
    9: { label: "超上級", equivalent: "英検1級+" },
    10:{ label: "ネイティブ", equivalent: "ネイティブレベル" }
};
const posMap = {
  '名詞': '名', '動詞': '動', '形容詞': '形', '副詞': '副', '代名詞': '代',
  '前置詞': '前', '接続詞': '接', '冠詞': '冠', '間投詞': '間', '熟語': '熟語',
  '助動詞': '助'
};
const posDisplayOrder = Object.keys(posMap);

export default function StudentDashboard() {
  // --- State宣言 ---
  const [allWords, setAllWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('select');
  const [selectionMode, setSelectionMode] = useState('main');
  const [testResultLevel, setTestResultLevel] = useState(0);
  const [learningWords, setLearningWords] = useState([]);
  const [reviewWords, setReviewWords] = useState([]);
  const [filterTab, setFilterTab] = useState('level');
  const [selectedTextbookId, setSelectedTextbookId] = useState(null);
  const [testWords, setTestWords] = useState([]);
  const [lastSession, setLastSession] = useState(null);
  const [initialLearnIndex, setInitialLearnIndex] = useState(0);
  const [currentSessionInfo, setCurrentSessionInfo] = useState(null);
  const [userData, setUserData] = useState(null);
  const [dailyPlan, setDailyPlan] = useState({ newWords: [], reviewWords: [], extraNewWords: [] });
  const [showRetestPrompt, setShowRetestPrompt] = useState(false);
  
  // ▼▼▼ ストーリー生成用のState ▼▼▼
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [monthlyStory, setMonthlyStory] = useState(null);
  const [pastStories, setPastStories] = useState([]);
  const [storiesLoading, setStoriesLoading] = useState(true);
  
  const navigate = useNavigate();

  const fetchStories = useCallback(async (uid) => {
    setStoriesLoading(true);
    try {
        const storiesColRef = collection(db, 'users', uid, 'generatedStories');
        const q = query(storiesColRef, orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const stories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPastStories(stories);

        const yearMonth = new Date().toISOString().slice(0, 7);
        const currentMonthStory = stories.find(story => story.id === yearMonth);
        setMonthlyStory(currentMonthStory || null);

    } catch (error) {
        console.error("Error fetching stories:", error);
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
        setLastSession(logSnapshot.empty ? null : logSnapshot.docs[0].data());
      } else {
        console.log("No such document! Redirecting to test.");
        setViewMode('test'); 
      }
    } catch (error) {
      console.error("Error refreshing dashboard data: ", error);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        setLoading(true);
        Promise.all([
          refreshDashboardData(user.uid),
          fetchStories(user.uid)
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
      } catch (error) {
        console.error("Error marking daily task as completed:", error);
      }
  };

  const handleLearningBack = (incorrectWords) => {
    if (incorrectWords && incorrectWords.length > 0 && auth.currentUser) {
      incorrectWords.forEach(word => {
        addWordToReview(auth.currentUser.uid, word);
      });
    }
    refreshDashboardData(auth.currentUser.uid);
    setViewMode('select');
    setSelectionMode('main');
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
    try {
        const wordsSnapshot = await getDocs(collection(db, 'textbooks', textbookId, 'words'));
        setAllWords(wordsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        setSelectionMode('filter');
    } catch (error) {
        console.error("Error fetching textbook words:", error);
    } finally {
        setLoading(false);
    }
  };

  const handleBackToMainMenu = () => {
    setSelectionMode('main');
    setSelectedTextbookId(null);
    setAllWords([]);
  };

  const startLearning = (filterType, value) => {
    let filtered = [];
    if (filterType === 'level') {
        filtered = allWords.filter(word => word.level === value);
    } else if (filterType === 'pos') {
        const posAbbr = posMap[value] || value;
        filtered = allWords.filter(word => word.partOfSpeech.includes(posAbbr));
    }
    setLearningWords(filtered);
    setViewMode('learn');
  };

  const startDailyNewWords = () => {
    if (!dailyPlan.newWords || dailyPlan.newWords.length === 0) {
      alert('今日の新規単語はありません。');
      return;
    }
    setLearningWords(dailyPlan.newWords);
    setViewMode('learn');
  };

  const startDailyReviewWords = () => {
    if (!dailyPlan.reviewWords || dailyPlan.reviewWords.length === 0) {
      alert('今日の復習単語はありません。');
      return;
    }
    setReviewWords(dailyPlan.reviewWords);
    setViewMode('review');
  };

  const handleGenerateStory = async () => {
    const wordsToUse = dailyPlan.reviewWords;
    if (!wordsToUse || wordsToUse.length === 0) {
      alert("ストーリーを生成するための復習単語がありません。");
      return;
    }
    setIsGeneratingStory(true);

    try {
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
        body: JSON.stringify({ words: wordsToUse }),
      });

      if (!response.ok) {
        let errorMsg = `ストーリーの生成に失敗しました (HTTP ${response.status})。`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMsg = errorData.error;
          }
          if (response.status === 429 && errorData.story) {
            const existingStory = { id: new Date().toISOString().slice(0, 7), ...errorData };
            setMonthlyStory(existingStory);
            alert('今月のストーリーは既に生成されています。');
            return;
          }
        } catch (e) {
          console.error("Could not parse error response as JSON.", e);
          errorMsg = "サーバーで予期せぬエラーが発生しました。しばらくしてからもう一度お試しください。";
        }
        throw new Error(errorMsg);
      }

      const resultData = await response.json();
      const newStory = { id: new Date().toISOString().slice(0, 7), ...resultData };
      setMonthlyStory(newStory);
      setPastStories(prevStories => [newStory, ...prevStories.filter(s => s.id !== newStory.id)]);

    } catch (error) {
      console.error("ストーリー生成エラー:", error);
      alert(error.message);
    } finally {
      setIsGeneratingStory(false);
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
                  onFirstCompletion={() => markDailyTaskAsCompleted(auth.currentUser.uid)}
                />;
      case 'review':
        return <ReviewFlashcard words={dailyPlan.reviewWords} onBack={handleReviewComplete} />;
      case 'test':
        return <VocabularyCheckTest allWords={testWords} onTestComplete={handleTestComplete} />;
      case 'result':
        return <TestResult level={testResultLevel} onRestart={() => setViewMode('select')} />;
      case 'select':
      default:
        const progressPercentage = userData?.progress?.percentage || 0;

        const StoryDisplay = ({ storyData }) => {
            if (!storyData) return null;
            const { story, translation, unusedWords, words } = storyData;
            return (
              <div className="story-display" style={{ marginTop: '1.5rem' }}>
                <div className="story-english">
                  <h4 style={{ color: 'var(--primary-color)' }}>Your Story</h4>
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{story}</p>
                </div>
                <hr style={{ margin: '1.5rem 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
                <div className="story-japanese">
                  <h4 style={{ color: 'var(--primary-color)' }}>和訳</h4>
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{translation}</p>
                </div>
                {unusedWords && unusedWords.length > 0 && (
                  <div className="unused-words" style={{ marginTop: '1rem' }}>
                    <h5 style={{ color: '#ef4444' }}>論理的に使用できなかった単語</h5>
                    <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {unusedWords.map((word, index) => (
                        <li key={index} style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.8rem' }}>
                          {word}
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
            {showRetestPrompt && (
              <div className="card-style retest-prompt" onClick={startCheckTest}>
                <FaExclamationTriangle className="retest-icon" />
                <div className="retest-text">
                  <h4>学習計画を最適化！</h4>
                  <p>実力テストを受けて、あなたにぴったりの学習プランを作成しましょう。</p>
                </div>
              </div>
            )}
            
            <div className="card-style">
               <div className="goal-display">
                 <FaBullseye className="goal-icon" />
                 <span>目標: {userData?.goal?.targets?.map(t => t.displayName).join(', ') || '未設定'}</span>
                 <button onClick={() => navigate('/set-goal')} className="edit-goal-btn"><FaPen /></button>
               </div>
               <div className="progress-bar-container">
                 <div className="progress-bar-fill" style={{ width: `${progressPercentage}%` }}></div>
               </div>
               <span className="progress-label">{progressPercentage}%</span>
            </div>

            <div className="card-style">
              <h2 className="section-title">今日のタスク</h2>
               <div className="task-cards-container">
                  <div className="task-card" onClick={startDailyNewWords}>
                      <FaBook className="task-icon new-word-icon" />
                      <div className="task-info"><p>新規単語</p><span>{dailyPlan.newWords.length}</span></div>
                  </div>
                  <div className="task-card" onClick={startDailyReviewWords}>
                      <FaSyncAlt className="task-icon review-word-icon" />
                      <div className="task-info"><p>復習単語</p><span>{dailyPlan.reviewWords.length}</span></div>
                  </div>
              </div>
            </div>

            <div className="card-style">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FaMagic style={{ color: 'var(--primary-color)' }}/>
                <h2 className="section-title" style={{ borderBottom: 'none', marginBottom: 0 }}>君が世界最も嫌いな長文</h2>
              </div>
              
              {storiesLoading ? (
                <div className="loading-container" style={{height: '100px'}}><div className="spinner"></div></div>
              ) : monthlyStory ? (
                <>
                  <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.5rem 0 1rem 0' }}>
                    今月の長文です。何度も音読して完璧にしましょう。
                  </p>
                  <StoryDisplay storyData={monthlyStory} />
                </>
              ) : (
                <>
                  <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.5rem 0 1.5rem 0' }}>
                    今日の復習単語を使って、AIがオリジナルの短文と和訳を作成します。（月に1回まで）
                  </p>
                  <button 
                    onClick={handleGenerateStory} 
                    disabled={isGeneratingStory}
                    className="login-btn"
                  >
                    {isGeneratingStory ? '生成中...' : 'ストーリーを生成する'}
                  </button>
                </>
              )}
            </div>

            <div className="card-style">
              <h2 className="section-title">過去の長文一覧</h2>
              {storiesLoading ? (
                  <div className="loading-container" style={{height: '50px'}}><div className="spinner"></div></div>
              ) : pastStories.length > 0 ? (
                  <div className="past-stories-list">
                      {pastStories.map(story => (
                          <details key={story.id} className="past-story-item">
                              <summary>{story.id} の長文</summary>
                              <StoryDisplay storyData={story} />
                          </details>
                      ))}
                  </div>
              ) : (
                  <p style={{ color: '#64748b', fontSize: '0.9rem' }}>過去に生成されたストーリーはありません。</p>
              )}
            </div>

            <div className="card-style">
              <h2 className="section-title">自由学習メニュー</h2>
              {selectionMode === 'filter' ? (
                <div className="selection-container">
                  <div className="filter-header">
                    <button onClick={handleBackToMainMenu} className="back-btn">← 教材選択に戻る</button>
                    <h3>{textbooks[selectedTextbookId]}</h3>
                  </div>
                  <div className="filter-tabs">
                    <button onClick={() => setFilterTab('level')} className={filterTab === 'level' ? 'active' : ''}>レベル別</button>
                    <button onClick={() => setFilterTab('pos')} className={filterTab === 'pos' ? 'active' : ''}>品詞別</button>
                  </div>
                  {filterTab === 'level' && (
                    <div className="selection-grid">
                      {Object.entries(levelDescriptions).map(([level, { label }]) => (
                        <button key={level} className="selection-card" onClick={() => startLearning('level', parseInt(level))}>{label}</button>
                      ))}
                    </div>
                  )}
                  {filterTab === 'pos' && (
                     <div className="selection-grid pos-grid">
                      {posDisplayOrder.map(pos => <button key={pos} className="selection-card pos-card" onClick={() => startLearning('pos', pos)}>{pos}</button>)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="selection-container main-menu">
                  {lastSession && <button className="main-selection-card resume-card" onClick={() => {/* resumeLearning logic here */}}>前回の続きから...</button>}
                  {Object.entries(textbooks).map(([id, name]) => ( <button key={id} className="main-selection-card" onClick={() => handleSelectTextbook(id)}>{name}</button>))}
                </div>
              )}
            </div>
          </>
        );
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h2 className='logo-title' style={{fontSize: '1.5rem'}}>つくたん</h2>
        <div className="user-info">
          {userData && <span>{userData.name}</span>}
          <LevelBadge level={testResultLevel} />
          <button onClick={handleLogout} className="logout-btn">ログアウト</button>
        </div>
      </header>
      <main className="card-main">
        {renderContent()}
      </main>
    </div>
  );
}