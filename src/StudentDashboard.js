import React, { useState, useEffect, useMemo } from 'react';
import { auth, db } from './firebaseConfig';
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import VocabularyCheckTest from './VocabularyCheckTest';
import TestResult from './TestResult';
import LearningFlashcard from './LearningFlashcard';
import ReviewFlashcard from './ReviewFlashcard';

const levelDescriptions = {
  1: "中1・前期", 2: "中1・後期", 3: "中2・前期", 4: "中2・後期", 5: "中3・前期",
  6: "中3・後期", 7: "高校入試標準", 8: "高校入試応用", 9: "高校基礎", 10: "難関レベル",
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
  if (!resultLevel || resultLevel === 0) return [];
  switch (resultLevel) {
    case 2: return [1, 2, 3];
    case 4: return [4, 5];
    case 6: return [6, 7];
    case 8: return [8, 9];
    default: return [];
  }
};

export default function StudentDashboard() {
  const [allWords, setAllWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('select');
  const [selectionMode, setSelectionMode] = useState('main');
  const [testResultLevel, setTestResultLevel] = useState(0);
  const [learningWords, setLearningWords] = useState([]);
  const [reviewWords, setReviewWords] = useState([]);

  useEffect(() => {
    const savedReviewWords = localStorage.getItem('reviewWords');
    if (savedReviewWords) {
      setReviewWords(JSON.parse(savedReviewWords));
    }

    const fetchInitialData = async () => {
      try {
        const wordsSnapshot = await getDocs(collection(db, 'words'));
        const wordsData = wordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllWords(wordsData);

        if (auth.currentUser) {
          const userDocRef = doc(db, 'users', auth.currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists() && userDoc.data().level) {
            setTestResultLevel(userDoc.data().level);
          }
        }
      } catch (error) {
        console.error("データの取得に失敗しました:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  const handleLogout = () => auth.signOut();

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

  const startLearning = (filterType, value) => {
    let filtered = [];
    if (filterType === 'level') {
      filtered = allWords.filter(word => word.level === value);
    } else if (filterType === 'pos') {
      const posAbbreviation = posMap[value];
      filtered = allWords.filter(word => word.partOfSpeech.includes(posAbbreviation));
    }
    if (filtered.length === 0) {
      alert('選択された条件に一致する単語がありません。');
      return;
    }
    setLearningWords(filtered);
    setViewMode('learn');
  };

  const handleLearningBack = (incorrectWords) => {
    if (incorrectWords.length > 0) {
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

  const startReview = () => {
    setViewMode('review');
  };

  const handleUpdateReviewWords = (wordToRemove) => {
    const newReviewWords = reviewWords.filter(word => word.id !== wordToRemove.id);
    setReviewWords(newReviewWords);
    localStorage.setItem('reviewWords', JSON.stringify(newReviewWords));
  };

  if (loading) return <div className="loading-container"><p>単語データを読み込み中...</p></div>;

  const renderContent = () => {
    switch(viewMode) {
      case 'learn':
        return <LearningFlashcard words={learningWords} onBack={handleLearningBack} />;
      case 'review':
        return <ReviewFlashcard 
                  words={reviewWords} 
                  onBack={() => setViewMode('select')} 
                  onUpdateReviewWords={handleUpdateReviewWords} 
                />;
      case 'test':
        return <VocabularyCheckTest allWords={allWords} onTestComplete={handleTestComplete} />;
      case 'result':
        return <TestResult level={testResultLevel} onRestart={() => setViewMode('select')} />;
      case 'select':
      default:
        if (selectionMode === 'filter') {
          const recommendedLevels = getRecommendedLevels(testResultLevel);
          return (
            <div className="selection-container">
              <div className="filter-header">
                <button onClick={() => setSelectionMode('main')} className="back-btn">← 教材選択に戻る</button>
                <h3>大阪府公立入試英単語</h3>
                {testResultLevel > 0 && (
                  <div className="user-level-display">
                    あなたのレベル: <strong>{testResultLevel}</strong>
                  </div>
                )}
              </div>

             <button className="main-selection-card test-card" onClick={() => setViewMode('test')}>
  <span className="main-selection-title">単語力チェックテスト</span>
  <span className="main-selection-desc">現在の実力を測定します</span>
</button>

              <p className="description">
                {recommendedLevels.length > 0
                  ? `あなたへのおすすめは緑色のレベルです！`
                  : "学習したい範囲をタップしてください。"
                }
              </p>
              <h4>レベルから選ぶ</h4>
              <div className="selection-grid">
                {Object.entries(levelDescriptions).map(([level, desc]) => {
                  const levelNum = parseInt(level);
                  const isRecommended = recommendedLevels.includes(levelNum);
                  return (
                    <button key={level} className={`selection-card ${isRecommended ? 'recommended' : ''}`} onClick={() => startLearning('level', levelNum)}>
                      <span className="selection-card-level">レベル {level}</span>
                      <span className="selection-card-desc">{desc}</span>
                    </button>
                  );
                })}
              </div>
              <h4>品詞から選ぶ</h4>
              <div className="selection-grid pos-grid">
                {posDisplayOrder.map(pos => (
                  <button key={pos} className="selection-card pos-card" onClick={() => startLearning('pos', pos)}>
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          );
        }
        // メイン選択画面
        return (
          <div className="selection-container main-menu">
            <h3>学習メニュー</h3>
            <button className="main-selection-card" onClick={() => setSelectionMode('filter')}>
              <span className="main-selection-title">大阪府公立入試英単語</span>
              <span className="main-selection-desc">レベル別・品詞別で学習</span>
            </button>
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