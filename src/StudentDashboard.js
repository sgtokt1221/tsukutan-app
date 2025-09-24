import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from './firebaseConfig';
import { collection, getDocs, doc, getDoc, setDoc, writeBatch, deleteDoc, addDoc, query, orderBy, limit } from "firebase/firestore";
import { generateDailyPlan } from './logic/learningPlanner';
import VocabularyCheckTest from './VocabularyCheckTest';
import TestResult from './TestResult';
import LearningFlashcard from './LearningFlashcard';
import ReviewFlashcard from './ReviewFlashcard';
import LevelBadge from './LevelBadge';
import { FaBook, FaSyncAlt, FaBullseye, FaExclamationTriangle, FaPen } from 'react-icons/fa';

// ▼▼▼ 既存の定数やヘルパー関数（あなたのコードから完全に維持） ▼▼▼
const textbooks = {
  'osaka-koukou-nyuushi': '大阪府公立入試英単語',
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
  '助動詞': '助', '疑問副詞': '疑副', '疑問形容詞': '疑形',
  '疑問代名詞': '疑代', '関係代名詞': '関代'
};
const posDisplayOrder = [
  '名詞', '動詞', '形容詞', '副詞', '代名詞', '前置詞', '接続詞', '助動詞',
  '疑問副詞', '疑問形容詞', '疑問代名詞', '関係代名詞', '冠詞', '間投詞', '熟語'
];
const getRecommendedLevels = (resultLevel) => {
  if (resultLevel === null || resultLevel === undefined || resultLevel === 0) return [];
  if (resultLevel >= 10) return [10];
  return [resultLevel, resultLevel + 1];
};
// ▲▲▲ ここまで ▲▲▲

export default function StudentDashboard() {
  // --- 既存のStateをすべて維持 ---
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
  
  // --- 新機能用のState ---
  const [userData, setUserData] = useState(null);
  const [dailyPlan, setDailyPlan] = useState({ newWords: [], reviewWords: [] });
  const [showRetestPrompt, setShowRetestPrompt] = useState(false);
  
  const navigate = useNavigate();

  // --- 既存のuseEffectをベースに、新機能のロジックを追加 ---
  useEffect(() => {
    const fetchUserData = async () => {
      if (auth.currentUser) {
        const uid = auth.currentUser.uid;
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
            
            if (diffDays > 7) { setShowRetestPrompt(true); }
          }

          const reviewWordsColRef = collection(db, 'users', uid, 'reviewWords');
          const reviewWordsSnapshot = await getDocs(reviewWordsColRef);
          setReviewWords(reviewWordsSnapshot.docs.map(d => d.data()));
          
          const logsColRef = collection(db, 'users', uid, 'logs');
          const q = query(logsColRef, orderBy("timestamp", "desc"), limit(1));
          const logSnapshot = await getDocs(q);
          if (!logSnapshot.empty) { setLastSession(logSnapshot.docs[0].data()); }
        }
      }
      setLoading(false);
    };
    fetchUserData();
  }, []);

  // --- 既存の関数を、省略せずに完全に維持 ---
  const resumeLearning = async () => {
    if (!lastSession) return;
    setLoading(true);
    try {
      const wordsSnapshot = await getDocs(collection(db, 'textbooks', lastSession.textbookId, 'words'));
      const wordsData = wordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      let filtered = [];
      if (lastSession.filterType === 'level') {
        filtered = wordsData.filter(word => word.level === lastSession.filterValue);
      } else if (lastSession.filterType === 'pos') {
        const posAbbreviation = posMap[lastSession.filterValue];
        filtered = wordsData.filter(word => word.partOfSpeech && word.partOfSpeech.includes(posAbbreviation));
      }
      setLearningWords(filtered);
      setInitialLearnIndex(lastSession.index);
      setCurrentSessionInfo(lastSession);
      setViewMode('learn');
    } catch(error) {
      console.error("学習データの読み込みに失敗しました:", error);
      alert('学習データの読み込みに失敗しました。');
      setLastSession(null);
    } finally { setLoading(false); }
  };
  
  const startLearning = (filterType, value) => {
    let filtered = [];
    if (filterType === 'level') {
      filtered = allWords.filter(word => word.level === value);
    } else if (filterType === 'pos') {
      const posAbbreviation = posMap[value];
      filtered = allWords.filter(word => word.partOfSpeech && word.partOfSpeech.includes(posAbbreviation));
    }
    if (filtered.length === 0) {
      alert('選択された条件に一致する単語がありません。');
      return;
    }
    setLearningWords(filtered);
    setInitialLearnIndex(0);
    setCurrentSessionInfo({ textbookId: selectedTextbookId, filterType, filterValue: value });
    setViewMode('learn');
  };
  
  const handleLearningBack = async (incorrectWords) => {
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      setLastSession(null);
      if (incorrectWords && incorrectWords.length > 0) {
        const batch = writeBatch(db);
        const newReviewWords = [...reviewWords];
        incorrectWords.forEach(word => {
          if (!newReviewWords.some(rw => rw.id === word.id)) {
            newReviewWords.push(word);
            const reviewWordRef = doc(db, 'users', uid, 'reviewWords', word.id);
            batch.set(reviewWordRef, word);
          }
        });
        await batch.commit();
        setReviewWords(newReviewWords);
      }
    }
    setViewMode('select');
    setSelectionMode('filter');
  };

  const handleSelectTextbook = async (textbookId) => {
    setLoading(true);
    setSelectedTextbookId(textbookId);
    try {
      const wordsSnapshot = await getDocs(collection(db, 'textbooks', textbookId, 'words'));
      const wordsData = wordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllWords(wordsData);
      setSelectionMode('filter');
    } catch (error) {
      console.error("単語データの取得に失敗しました:", error);
      alert("単語データの読み込みに失敗しました。");
    } finally { setLoading(false); }
  };

  const handleLogout = () => auth.signOut();

  const startCheckTest = async () => {
    setLoading(true);
    try {
      let combinedWords = [];
      for (const id of Object.keys(textbooks)) {
        const wordsSnapshot = await getDocs(collection(db, 'textbooks', id, 'words'));
        const wordsData = wordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        combinedWords = [...combinedWords, ...wordsData];
      }
      const uniqueWords = Array.from(new Map(combinedWords.map(word => [word.word, word])).values());
      setTestWords(uniqueWords);
      setViewMode('test');
    } catch (error) {
      console.error("全単語データの取得に失敗しました:", error);
    } finally { setLoading(false); }
  };

  const handleTestComplete = async (finalLevel) => {
    setTestResultLevel(finalLevel);
    if (auth.currentUser) {
      try {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        await setDoc(userDocRef, { level: finalLevel }, { merge: true });
      } catch (error) {
        console.error("テスト結果の保存に失敗しました:", error);
      }
    }
    setViewMode('result');
  };
  
  const startReview = () => {
    setViewMode('review');
  };

  const handleReviewComplete = async (remainingWords) => {
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      const originalWordIds = reviewWords.map(w => w.id);
      const remainingWordIds = remainingWords.map(w => w.id);
      const completedWordIds = originalWordIds.filter(id => !remainingWordIds.includes(id));
      if (completedWordIds.length > 0) {
        const batch = writeBatch(db);
        completedWordIds.forEach(wordId => {
          const reviewWordRef = doc(db, 'users', uid, 'reviewWords', wordId);
          batch.delete(reviewWordRef);
        });
        await batch.commit();
      }
    }
    setReviewWords(remainingWords);
    setViewMode('select');
    setSelectionMode('main');
  };
  
  const handleBackToMainMenu = () => {
    setSelectionMode('main');
    setSelectedTextbookId(null);
    setAllWords([]);
  };

  const handleSaveLog = async (sessionData) => {
    if (auth.currentUser) {
      const uid = auth.currentUser.uid;
      const logsColRef = collection(db, 'users', uid, 'logs');
      await addDoc(logsColRef, { ...sessionData, status: 'paused' });
      console.log('学習進捗をDBに保存しました:', sessionData);
    }
  };

  if (loading) return <div className="loading-container"><p>読み込み中...</p></div>;

  // --- 【UI刷新】ここから下の表示部分を全面的に再設計 ---
  const renderContent = () => {
    switch (viewMode) {
      case 'learn':
        return <LearningFlashcard words={learningWords} onBack={handleLearningBack} initialIndex={initialLearnIndex} sessionInfo={currentSessionInfo} onSaveLog={handleSaveLog}/>;
      case 'review':
        return <ReviewFlashcard words={reviewWords} onBack={handleReviewComplete} />;
      case 'test':
        return <VocabularyCheckTest allWords={testWords} onTestComplete={handleTestComplete} />;
      case 'result':
        return <TestResult level={testResultLevel} onRestart={() => setViewMode('select')} />;
      case 'select':
      default:
        const progressPercentage = userData?.progress?.percentage || 0;
        return (
          <>
            {showRetestPrompt && (
              <div className="retest-prompt card-style" onClick={startCheckTest}>
                <FaExclamationTriangle className="retest-icon" />
                <div className="retest-text">
                  <h4>学習計画を最適化！</h4>
                  <p>前回の実力テストから1週間が経過しました。計画を見直しませんか？</p>
                </div>
              </div>
            )}
            
            <div className="card-style">
              <div className="goal-display">
                <FaBullseye className="goal-icon" />
                <span>目標: {userData?.goal?.targets?.map(t => t.displayName).join(', ') || '未設定'}</span>
                <button onClick={() => navigate('/set-goal')} className="edit-goal-btn"><FaPen /></button>
              </div>
              <h2 className="section-title">ゴールまでの進捗</h2>
              <div className="progress-bar-container"><div className="progress-bar-fill" style={{ width: `${progressPercentage}%` }}></div></div>
              <span className="progress-label">{progressPercentage}%</span>

              <h2 className="section-title" style={{marginTop: '2rem'}}>今日のタスク</h2>
              <div className="task-cards-container">
                  <div className="task-card" onClick={() => { setLearningWords(dailyPlan.newWords); setViewMode('learn'); }}>
                      <FaBook className="task-icon new-word-icon" />
                      <div className="task-info"><p>新規単語</p><span>{dailyPlan.newWords.length}語</span></div>
                  </div>
                  <div className="task-card" onClick={() => { setReviewWords(dailyPlan.reviewWords); setViewMode('review'); }}>
                      <FaSyncAlt className="task-icon review-word-icon" />
                      <div className="task-info"><p>復習単語</p><span>{dailyPlan.reviewWords.length}語</span></div>
                  </div>
              </div>
            </div>

            <div className="card-style">
              {selectionMode === 'filter' && selectedTextbookId ? (
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
                  <LevelBadge level={testResultLevel} />
                  <h2 className="section-title">自由学習メニュー</h2>
                  {lastSession && <button className="main-selection-card resume-card" onClick={resumeLearning}>前回の続きから...</button>}
                  <button className="main-selection-card" onClick={startCheckTest}>単語力チェックテスト</button>
                  {Object.entries(textbooks).map(([id, name]) => ( <button key={id} className="main-selection-card" onClick={() => handleSelectTextbook(id)}>{name}</button> ))}
                  <button className="main-selection-card" onClick={startReview} disabled={reviewWords.length === 0}>復習モード ({reviewWords.length}語)</button>
                </div>
              )}
            </div>
          </>
        );
    }
  };

  return (
    <div className="dashboard-container-centered">
      <header className="dashboard-header">
        <h2>つくたん</h2>
        <div className="user-info">
          {auth.currentUser && <span>{auth.currentUser.email}</span>}
          <button onClick={handleLogout} className="logout-btn">ログアウト</button>
        </div>
      </header>
      <main className="card-main">
        {renderContent()}
      </main>
    </div>
  );
}