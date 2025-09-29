import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

import { updateUserWordProgress, removeWordFromReview } from './logic/reviewLogic';
import { getAuth } from 'firebase/auth';
import { FaUndo, FaArrowLeft } from 'react-icons/fa';

function ReviewFlashcard({ words, onBack, onSaveLog, sessionInfo }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionWords, setSessionWords] = useState([]);
  const [graduatedCount, setGraduatedCount] = useState(0);

  const auth = getAuth();
  const userId = auth.currentUser ? auth.currentUser.uid : null;
  const sessionStartTime = useRef(new Date());

  useEffect(() => {
    // Shuffle words for variety each session
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    setSessionWords(shuffled);
    setCurrentIndex(0);
    setGraduatedCount(0);
    sessionStartTime.current = new Date();
  }, [words]);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const cardColor = useTransform(
    [x, y],
    ([latestX, latestY]) => {
      if (latestY < -40) {
        return "#facc15"; // Yellow for swipe up
      }
      // Interpolate between red, white, and green for horizontal swipe
      const xRange = [-100, 0, 100];
      const colorRange = ["#ef4444", "#ffffff", "#4ade80"];
      
      const N = colorRange.length;
      const xAsNumber = typeof latestX === 'number' ? latestX : 0;

      if (xAsNumber <= xRange[0]) return colorRange[0];
      if (xAsNumber >= xRange[N - 1]) return colorRange[N - 1];

      let i = 0;
      while (xAsNumber > xRange[i+1]) i++;
      
      const range = xRange[i+1] - xRange[i];
      const proportion = (xAsNumber - xRange[i]) / range;

      const fromColor = colorRange[i];
      const toColor = colorRange[i+1];

      const r = Math.round(parseInt(fromColor.slice(1, 3), 16) * (1 - proportion) + parseInt(toColor.slice(1, 3), 16) * proportion);
      const g = Math.round(parseInt(fromColor.slice(3, 5), 16) * (1 - proportion) + parseInt(toColor.slice(3, 5), 16) * proportion);
      const b = Math.round(parseInt(fromColor.slice(5, 7), 16) * (1 - proportion) + parseInt(toColor.slice(5, 7), 16) * proportion);
      
      return `rgb(${r}, ${g}, ${b})`;
    }
  );

  const handleBackButtonClick = useCallback(() => {
    const sessionEndTime = new Date();
    const durationInSeconds = (sessionEndTime - sessionStartTime.current) / 1000;

    if (onSaveLog && durationInSeconds > 5 && (currentIndex > 0 || graduatedCount > 0)) {
      onSaveLog({
        ...sessionInfo,
        wordsReviewed: currentIndex + 1,
        wordsGraduated: graduatedCount,
        durationInSeconds: Math.round(durationInSeconds),
        timestamp: new Date(),
      });
    }
    
    onBack();
  }, [onBack, onSaveLog, sessionInfo, currentIndex, graduatedCount, sessionStartTime]);

  const handleDragEnd = useCallback((event, info) => {
    const threshold = 50;
    const swipeUpThreshold = -80;

    const currentWord = sessionWords[currentIndex];
    if (!userId || !currentWord) return;

    // Swipe Up (Graduate)
    if (info.offset.y < swipeUpThreshold) {
      removeWordFromReview(userId, currentWord.id);
      setGraduatedCount(prev => prev + 1);
      
      const newSessionWords = sessionWords.filter(w => w.id !== currentWord.id);
      setSessionWords(newSessionWords);
      
      if (currentIndex >= newSessionWords.length) {
        if (newSessionWords.length === 0) {
          handleBackButtonClick();
          return;
        }
        setCurrentIndex(newSessionWords.length - 1);
      }
    }
    // Left/Right Swipe (Correct/Incorrect)
    else if (Math.abs(info.offset.x) > threshold) {
      const isCorrect = info.offset.x > 0;
      updateUserWordProgress(userId, currentWord, isCorrect);
      
      if (currentIndex < sessionWords.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        handleBackButtonClick();
      }
    }
    
    x.set(0);
    y.set(0);
  }, [currentIndex, sessionWords, x, y, userId, handleBackButtonClick]);

  const handleTap = useCallback(() => {
    setIsFlipped(prev => !prev);
    if (!isFlipped && sessionWords.length > 0) {
      const utterance = new SpeechSynthesisUtterance(sessionWords[currentIndex].word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }, [isFlipped, currentIndex, sessionWords]);

  const handlePrev = useCallback(() => {
    if (currentIndex === 0) return;
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setIsFlipped(false);
    x.set(0);
    y.set(0);
  }, [currentIndex, x, y]);

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div className="test-header">
        <h3>復習モード</h3>
      </div>
      <div id="flashcard-container">
        <motion.div
          key={currentIndex}
          id="flashcard"
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          style={{ x, y, rotate, backgroundColor: cardColor }}
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
      <div className="footer-container">
        <div className="flashcard-footer">
          <button onClick={handlePrev} className="prev-action" disabled={currentIndex === 0}>
            <FaUndo /> 前の単語
          </button>
          <button onClick={handleBackButtonClick} className="back-action">
            <FaArrowLeft /> ダッシュボードに戻る
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReviewFlashcard;