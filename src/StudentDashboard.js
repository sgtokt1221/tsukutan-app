import React, { useState, useEffect } from 'react';
import { auth, db } from './firebaseConfig';
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import VocabularyCheckTest from './VocabularyCheckTest';
import TestResult from './TestResult';
import LearningFlashcard from './LearningFlashcard';
import ReviewFlashcard from './ReviewFlashcard';
import LevelBadge from './LevelBadge';

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

// ▼▼▼ 修正点：この関数を再度追加しました ▼▼▼
const getRecommendedLevels = (resultLevel) => {
  if (resultLevel === null || resultLevel === undefined || resultLevel === 0) return [];
  if (resultLevel >= 10) return [10];
  return [resultLevel, resultLevel + 1];
};
// ▲▲▲ 修正完了 ▲▲▲

export default function StudentDashboard() {
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

  useEffect(() => {
    const savedSession = localStorage.getItem('lastLearningSession');
    if (savedSession) {
      try {
        setLastSession(JSON.parse(savedSession));
      } catch (e) {
        console.error("セッション情報の読み込みに失敗:", e);
        localStorage.removeItem('lastLearningSession');
      }
    }
    
    const savedReviewWords = localStorage.getItem('reviewWords');
    if (savedReviewWords) {
      try {
        setReviewWords(JSON.parse(savedReviewWords));
      } catch (e) {
        console.error("復習単語の読み込みに失敗しました:", e);
        setReviewWords([]);
      }
    }

    const fetchUserData = async () => {
      if (auth.currentUser) {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists() && userDoc.data().level) {
          setTestResultLevel(userDoc.data().level);
        }
      }
      setLoading(false);
    };
    fetchUserData();
  }, []);

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
      localStorage.removeItem('lastLearningSession');
      setLastSession(null);
    } finally {
      setLoading(false);
    }
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
  
  const handleLearningBack = (incorrectWords) => {
    localStorage.removeItem('lastLearningSession');
    setLastSession(null); 
    
    if (incorrectWords && incorrectWords.length > 0) {
      const newReviewWords = [...reviewWords];
      incorrectWords.forEach(word => {
        if (!newReviewWords.some(rw => rw.id === word.id)) {
          newReviewWords.push(word);
        }
      });
      setReviewWords(newReviewWords);
      localStorage.setItem('reviewWords', JSON.stringify(newReviewWords));
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
    } finally {
      setLoading(false);
    }
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
    } finally {
      setLoading(false);
    }
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

  const handleReviewComplete = (remainingWords) => {
    setReviewWords(remainingWords);
    localStorage.setItem('reviewWords', JSON.stringify(remainingWords));
    setViewMode('select');
    setSelectionMode('main');
  };
  
  const handleBackToMainMenu = () => {
    setSelectionMode('main');
    setSelectedTextbookId(null);
    setAllWords([]);
  };

  if (loading) return <div className="loading-container"><p>読み込み中...</p></div>;

  const renderContent = () => {
    switch (viewMode) {
      case 'learn':
        return <LearningFlashcard 
                  words={learningWords} 
                  onBack={handleLearningBack}
                  initialIndex={initialLearnIndex}
                  sessionInfo={currentSessionInfo}
                />;
      case 'review':
        return <ReviewFlashcard words={reviewWords} onBack={handleReviewComplete} />;
      case 'test':
        return <VocabularyCheckTest allWords={testWords} onTestComplete={handleTestComplete} />;
      case 'result':
        return <TestResult level={testResultLevel} onRestart={() => setViewMode('select')} />;
      case 'select':
      default:
        if (selectionMode === 'filter' && selectedTextbookId) {
          const recommendedLevels = getRecommendedLevels(testResultLevel);
          return (
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
                  {Object.entries(levelDescriptions).map(([level, { label, equivalent }]) => {
                    const levelNum = parseInt(level);
                    return (
                      <button key={level} className="selection-card" onClick={() => startLearning('level', levelNum)}>
                        <span className="selection-card-level">{label}</span>
                        <span className="selection-card-desc">{equivalent}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {filterTab === 'pos' && (
                <div className="selection-grid pos-grid">
                  {posDisplayOrder.map(pos => (
                    <button key={pos} className="selection-card pos-card" onClick={() => startLearning('pos', pos)}>
                      {pos}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return (
          <div className="selection-container main-menu">
            <LevelBadge level={testResultLevel} />
            <h3>学習メニュー</h3>
            
            {lastSession && (
              <button className="main-selection-card resume-card" onClick={resumeLearning}>
                <span className="main-selection-title">前回の続きから</span>
                <span className="main-selection-desc">
                  {textbooks[lastSession.textbookId] || '教材'} - {
                    lastSession.filterType === 'level' 
                    ? (levelDescriptions[lastSession.filterValue]?.label || `レベル${lastSession.filterValue}`)
                    : lastSession.filterValue
                  } ({lastSession.index + 1}番目〜)
                </span>
              </button>
            )}

            <button className="main-selection-card test-card" onClick={startCheckTest}>
              <span className="main-selection-title">単語力チェックテスト</span>
              <span className="main-selection-desc">現在の実力を測定します</span>
            </button>

            {Object.entries(textbooks).map(([id, name]) => (
              <button key={id} className="main-selection-card" onClick={() => handleSelectTextbook(id)}>
                <span className="main-selection-title">{name}</span>
                <span className="main-selection-desc">レベル別・品詞別で学習</span>
              </button>
            ))}
            
            <button 
              className="main-selection-card" 
              onClick={startReview} 
              disabled={reviewWords.length === 0}
            >
              <span className="main-selection-title">復習モード</span>
              <span className="main-selection-desc">{reviewWords.length}単語を復習</span>
            </button>
          </div>
        );
    }
  };

  return (
    <div className="dashboard-container">
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

