import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

// ▼▼▼ 【追加】新機能：忘却曲線ロジックと認証機能 ▼▼▼
import { updateUserWordProgress } from './logic/reviewLogic';
import { getAuth } from 'firebase/auth';

// 既存のshuffleArray関数（完全に維持）
const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};


function LearningFlashcard({ words, onBack, initialIndex = 0, sessionInfo, onSaveLog }) {
  // 既存のState（完全に維持）
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFlipped, setIsFlipped] = useState(false);
  const [incorrectWords, setIncorrectWords] = useState([]);
  const [shuffledWords, setShuffledWords] = useState([]);
  
  // ▼▼▼ 【追加】新機能：ユーザーIDを取得 ▼▼▼
  const auth = getAuth();
  const userId = auth.currentUser ? auth.currentUser.uid : null;

  const sessionStartTime = useRef(new Date());

  // 既存のuseEffect（完全に維持）
  useEffect(() => {
    setShuffledWords(shuffleArray(words));
    sessionStartTime.current = new Date();
  }, [words]);

  // 既存のframer-motionロジック（完全に維持）
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  const cardColor = useTransform(x, [-100, 0, 100], ["#ef4444", "#ffffff", "#4ade80"]);
  
  // 既存のhandleDragEnd関数に、新機能の1行を追加
  const handleDragEnd = useCallback((event, info) => {
    if (Math.abs(info.offset.x) < 50) return;
    
    const isCorrect = info.offset.x > 100;
    const currentWord = shuffledWords[currentIndex];

    // ▼▼▼ 【追加】新機能：学習結果をFirestoreに記録 ▼▼▼
    if (userId && currentWord) {
      updateUserWordProgress(userId, currentWord, isCorrect);
    }

    // --- ここから下は既存のロジックを完全に維持 ---
    if (!isCorrect) {
      setIncorrectWords(prev => [...prev, currentWord]);
    }

    if (currentIndex < shuffledWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      x.set(0);
    } else {
      onBack(incorrectWords.concat(isCorrect ? [] : [currentWord]));
    }
  }, [currentIndex, shuffledWords, incorrectWords, onBack, x, userId]);

  // 既存のhandleTap関数（完全に維持）
  const handleTap = useCallback(() => {
    setIsFlipped(prev => !prev);
    if (!isFlipped && shuffledWords.length > 0) {
      const utterance = new SpeechSynthesisUtterance(shuffledWords[currentIndex].word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }, [isFlipped, currentIndex, shuffledWords]);

  // 既存のhandleBackButtonClick関数（完全に維持）
  const handleBackButtonClick = () => {
    const sessionEndTime = new Date();
    const durationInSeconds = (sessionEndTime - sessionStartTime.current) / 1000;

    if (durationInSeconds > 10 && currentIndex > 0) {
      const logData = {
        ...sessionInfo,
        index: currentIndex,
        timestamp: new Date()
      };
      onSaveLog(logData);
    }
    onBack(incorrectWords);
  };

  // 既存のレンダリングロジック（完全に維持）
  if (shuffledWords.length === 0) {
    return (
      <div className="loading-container">
        <p>学習する単語がありません。</p>
        <button onClick={() => onBack([])}>ダッシュボードに戻る</button>
      </div>
    );
  }

  const currentWord = shuffledWords[currentIndex];

  return (
    <>
      <div className="test-header">
        <button onClick={handleBackButtonClick} className="back-btn">← 終了</button>
        <h3>新規学習</h3>
      </div>
      <div id="flashcard-container">
        <motion.div
          key={currentIndex}
          id="flashcard"
          drag="x"
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          style={{ x, rotate, backgroundColor: cardColor }}
          onDragEnd={handleDragEnd}
          onTap={handleTap}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="card-face card-front"><p id="card-front-text">{currentWord?.word}</p></div>
          <div className="card-face card-back">
            <h3 id="card-back-word">{currentWord?.word}</h3>
            <p id="card-back-meaning">{currentWord?.meaning}</p>
            <hr />
            <p className="example-text">{currentWord?.example}</p>
            <p className="example-text-ja">{currentWord?.exampleJa}</p>
          </div>
        </motion.div>
      </div>
      <div className="card-navigation">
        <div className="card-counter">{currentIndex + 1} / {shuffledWords.length}</div>
      </div>
    </>
  );
}

export default LearningFlashcard;