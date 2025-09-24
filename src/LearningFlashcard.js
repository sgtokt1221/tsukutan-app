import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { getAuth } from 'firebase/auth';

// 忘却曲線に基づき、単語の習熟度を更新するロジック（仮のインポート）
// ※logic/reviewLogic.js が実際に存在し、この関数がエクスポートされている必要があります
// import { updateUserWordProgress } from './logic/reviewLogic';

// スタブ関数：reviewLogicが未実装の場合の代替
const updateUserWordProgress = (userId, word, isCorrect) => {
  console.log(`学習記録: User ${userId}, Word ${word.word}, Correct: ${isCorrect}`);
};

// 配列をシャッフルするヘルパー関数
const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export default function LearningFlashcard({ words, onBack, initialIndex = 0, sessionInfo, onSaveLog }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFlipped, setIsFlipped] = useState(false);
  const [incorrectWords, setIncorrectWords] = useState([]);
  const [shuffledWords, setShuffledWords] = useState([]);
  
  const auth = getAuth();
  const userId = auth.currentUser ? auth.currentUser.uid : null;
  const sessionStartTime = useRef(new Date());

  useEffect(() => {
    setShuffledWords(shuffleArray(words));
    sessionStartTime.current = new Date();
  }, [words]);

  // Framer Motion の設定
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const cardColor = useTransform(x, [-100, 0, 100], ["#fee2e2", "#ffffff", "#dcfce7"]);
  
  const handleDragEnd = useCallback((event, info) => {
    if (Math.abs(info.offset.x) < 50) return;
    
    const isCorrect = info.offset.x > 0;
    const currentWord = shuffledWords[currentIndex];

    if (userId && currentWord) {
      updateUserWordProgress(userId, currentWord, isCorrect);
    }

    if (!isCorrect) {
      setIncorrectWords(prev => [...prev, currentWord]);
    }

    if (currentIndex < shuffledWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      x.set(0);
    } else {
      const finalIncorrectWords = isCorrect ? incorrectWords : [...incorrectWords, currentWord];
      onBack(finalIncorrectWords);
    }
  }, [currentIndex, shuffledWords, incorrectWords, onBack, x, userId]);

  const handleTap = useCallback(() => {
    setIsFlipped(prev => !prev);
    if (!isFlipped && shuffledWords.length > 0) {
      const utterance = new SpeechSynthesisUtterance(shuffledWords[currentIndex].word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }, [isFlipped, currentIndex, shuffledWords]);

  const handleBackButtonClick = () => {
    const sessionEndTime = new Date();
    const durationInSeconds = (sessionEndTime - sessionStartTime.current) / 1000;

    if (onSaveLog && durationInSeconds > 10 && currentIndex > 0) {
      const logData = {
        ...sessionInfo,
        index: currentIndex,
        timestamp: new Date()
      };
      onSaveLog(logData);
    }
    onBack(incorrectWords);
  };

  if (shuffledWords.length === 0) {
    return (
      <div className="card-style">
        <p>学習する単語がありません。</p>
        <button onClick={() => onBack([])} className="back-btn">戻る</button>
      </div>
    );
  }

  const currentWord = shuffledWords[currentIndex];

  return (
    // ▼▼▼【修正】元のコードのJSX構造を完全に復元▼▼▼
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div className="test-header">
        <button onClick={handleBackButtonClick} className="back-btn">← 終了</button>
        <h3>新規学習</h3>
      </div>
      
      <div id="flashcard-container">
        <motion.div
          key={currentIndex}
          id="flashcard"
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
          <div className="card-face card-back">
            <h3 id="card-back-word">{currentWord?.word}</h3>
            <p id="card-back-meaning">{currentWord?.japanese || currentWord?.meaning}</p>
            {(currentWord?.example || currentWord?.exampleJa) && <hr />}
            <p className="example-text">{currentWord?.example}</p>
            <p className="example-text-ja">{currentWord?.exampleJa}</p>
          </div>
        </motion.div>
      </div>
      
      <div className="card-navigation">
        <div className="card-counter">{currentIndex + 1} / {shuffledWords.length}</div>
      </div>
    </div>
  );
}