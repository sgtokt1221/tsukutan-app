import React, { useState, useEffect, useCallback } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import { updateUserWordProgress, removeWordFromReview } from './logic/reviewLogic';
import { getAuth } from 'firebase/auth';

function ReviewFlashcard({ words, onBack }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionWords, setSessionWords] = useState([]);

  const auth = getAuth();
  const userId = auth.currentUser ? auth.currentUser.uid : null;

  useEffect(() => {
    setSessionWords(words);
  }, [words]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const cardColor = useTransform(
    x,
    [-100, 0, 100],
    ["#ef4444", "#ffffff", "#4ade80"],
  );
  const masterColor = useTransform(
    y,
    [-100, 0],
    ["#facc15", "#ffffff"]
  );

  const handleDragEnd = useCallback((event, info) => {
    const threshold = 50;
    const swipeUpThreshold = -80;

    // 上スワイプ（卒業）
    if (info.offset.y < swipeUpThreshold) {
      const currentWord = sessionWords[currentIndex];
      if (userId && currentWord) {
        removeWordFromReview(userId, currentWord.id);
        // UIから即時削除
        const newSessionWords = sessionWords.filter(w => w.id !== currentWord.id);
        setSessionWords(newSessionWords);
        // インデックスがリストの範囲外になるのを防ぐ
        if (currentIndex >= newSessionWords.length && newSessionWords.length > 0) {
          setCurrentIndex(newSessionWords.length - 1);
        }
      }
      return;
    }

    // 左右スワイプ（正解・不正解）
    if (Math.abs(info.offset.x) > threshold) {
      const isCorrect = info.offset.x > 0;
      const currentWord = sessionWords[currentIndex];
      if (userId && currentWord) {
        updateUserWordProgress(userId, currentWord, isCorrect);
      }
    }
    
    // 次のカードへ
    if (currentIndex < sessionWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      onBack();
    }
    
    // カードの位置をリセット
    x.set(0);
    y.set(0);

  }, [currentIndex, sessionWords, onBack, x, y, userId]);

  const handleTap = useCallback(() => {
    setIsFlipped(prev => !prev);
    if (!isFlipped && sessionWords.length > 0) {
      const utterance = new SpeechSynthesisUtterance(sessionWords[currentIndex].word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }, [isFlipped, currentIndex, sessionWords]);

  if (!sessionWords || sessionWords.length === 0) {
    return (
        <div className="loading-container">
            <p>復習する単語がありません。</p>
            <button onClick={onBack}>ダッシュボードに戻る</button>
        </div>
    );
  }

  const currentWord = sessionWords[currentIndex];

  return (
    <>
      <div className="test-header">
        <button onClick={onBack} className="back-btn">← 終了</button>
        <h3>復習モード</h3>
      </div>
      <div id="flashcard-container">
        <motion.div
          key={currentIndex}
          id="flashcard"
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          style={{ x, y, rotate, backgroundColor: masterColor }}
          onDragEnd={handleDragEnd}
          onTap={handleTap}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="card-face card-front">
            <p id="card-front-text">{currentWord?.word}</p>
          </div>
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
        <div className="card-counter">{currentIndex + 1} / {sessionWords.length}</div>
      </div>
    </>
  );
}

export default ReviewFlashcard;