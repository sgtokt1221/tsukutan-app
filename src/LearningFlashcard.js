import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { getAuth } from 'firebase/auth';
import { FaUndo, FaArrowLeft } from 'react-icons/fa';

// 忘却曲線に基づき、単語の習熟度を更新するロジック
import { updateUserWordProgress } from './logic/reviewLogic';

// 配列をシャッフルするヘルパー関数
const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export default function LearningFlashcard({ words, onBack, initialIndex = 0, sessionInfo, onSaveLog, onFirstCompletion }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFlipped, setIsFlipped] = useState(false);
  const [incorrectWords, setIncorrectWords] = useState([]);
  const [correctlyLearnedWords, setCorrectlyLearnedWords] = useState(new Set());
  const [shuffledWords, setShuffledWords] = useState([]);
  const [hasCompletedOnce, setHasCompletedOnce] = useState(false);
  
  const auth = getAuth();
  const userId = auth.currentUser ? auth.currentUser.uid : null;
  const sessionStartTime = useRef(new Date());

  useEffect(() => {
    // 自由学習モード（sessionInfoがある）の場合はシャッフルしない
    if (sessionInfo) {
      setShuffledWords(words);
    } else {
      setShuffledWords(shuffleArray(words));
    }
    sessionStartTime.current = new Date();
  }, [words, sessionInfo]);

  // initialIndexが変更された時にcurrentIndexを更新
  useEffect(() => {
    console.log('LearningFlashcard initialIndex変更:', {
      initialIndex: initialIndex,
      currentIndex: currentIndex,
      wordsLength: words.length
    });
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  // Framer Motion の設定
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const cardColor = useTransform(x, [-100, 0, 100], ["#fee2e2", "#ffffff", "#dcfce7"]);
  
  const handleBackButtonClick = useCallback(() => {
    const sessionEndTime = new Date();
    const durationInSeconds = (sessionEndTime - sessionStartTime.current) / 1000;

    if (onSaveLog && durationInSeconds > 10 && currentIndex > 0) {
      const logData = {
        ...sessionInfo,
        index: currentIndex,
        durationInSeconds: Math.round(durationInSeconds),
        timestamp: new Date()
      };
      onSaveLog(logData);
    }
    onBack(incorrectWords, correctlyLearnedWords.size);
  }, [onSaveLog, sessionInfo, currentIndex, onBack, incorrectWords, correctlyLearnedWords]);

  const handleDragEnd = useCallback((event, info) => {
    if (Math.abs(info.offset.x) < 50) return;
    
    const isCorrect = info.offset.x > 0;
    const currentWord = shuffledWords[currentIndex];

    if (userId && currentWord) {
      // 実際の復習ロジックを使用
      updateUserWordProgress(userId, currentWord, isCorrect);
    }

    if (isCorrect) {
      setCorrectlyLearnedWords(prev => new Set(prev).add(currentWord.id));
    } else {
      setIncorrectWords(prev => [...prev, currentWord]);
    }

    if (currentIndex < shuffledWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // 最後の単語の場合
      if (!hasCompletedOnce) {
        setHasCompletedOnce(true);
        if (onFirstCompletion) {
          onFirstCompletion();
        }
      }
      handleBackButtonClick();
    }
  }, [currentIndex, shuffledWords, incorrectWords, onBack, x, userId, hasCompletedOnce, onFirstCompletion, handleBackButtonClick]);

  const handleTap = useCallback(() => {
    setIsFlipped(prev => !prev);
    if (!isFlipped && shuffledWords.length > 0) {
      const utterance = new SpeechSynthesisUtterance(shuffledWords[currentIndex].word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }, [isFlipped, currentIndex, shuffledWords]);

  if (shuffledWords.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <p>学習する単語がありません。</p>
        <button onClick={() => onBack([], 0)} className="back-btn">戻る</button>
      </div>
    );
  }

  const currentWord = shuffledWords[currentIndex];
  
  // デバッグ情報
  console.log('LearningFlashcard 現在の状態:', {
    currentIndex: currentIndex,
    shuffledWordsLength: shuffledWords.length,
    currentWord: currentWord?.word,
    initialIndex: initialIndex
  });

  return (
    // ▼▼▼【修正】元のコードのJSX構造を完全に復元▼▼▼
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div className="test-header">
        <h3>新規学習</h3>
      </div>
      
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${((currentIndex + 1) / shuffledWords.length) * 100}%` }}
        ></div>
      </div>
      
      <div className="card-container">
        <motion.div
          className="flashcard"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          style={{ x, rotate, backgroundColor: cardColor }}
          onDragEnd={handleDragEnd}
          onTap={handleTap}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="card-face card-front" style={{ backgroundColor: 'transparent' }}>
            <p id="card-front-text">{currentWord?.word}</p>
          </div>
          <div className="card-face card-back" style={{ backgroundColor: 'transparent' }}>
            <h3 id="card-back-word">{currentWord?.word}</h3>
            <p id="card-back-meaning">{currentWord?.japanese || currentWord?.meaning}</p>
            {(currentWord?.example || currentWord?.exampleJa) && <hr />}
            <p className="example-text">{currentWord?.example}</p>
            <p className="example-text-ja">{currentWord?.exampleJa}</p>
          </div>
        </motion.div>
      </div>
      
      <div className="card-actions">
        <button onClick={() => handleDragEnd(null, { offset: { x: -100 } })} className="action-btn incorrect-btn">
          <FaUndo /> わからない
        </button>
        <button onClick={() => handleDragEnd(null, { offset: { x: 100 } })} className="action-btn correct-btn">
          わかる <FaUndo style={{ transform: 'scaleX(-1)' }} />
        </button>
      </div>
      
      <div className="test-footer">
        <span className="word-count">{currentIndex + 1} / {shuffledWords.length}</span>
        <button onClick={handleBackButtonClick} className="back-btn">
          <FaArrowLeft /> ダッシュボードに戻る
        </button>
      </div>
    </div>
  );
}