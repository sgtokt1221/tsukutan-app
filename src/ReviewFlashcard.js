import React, { useState, useEffect, useCallback } from 'react';
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


function ReviewFlashcard({ words, onBack }) {
  // 既存のState（完全に維持）
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [remainingWords, setRemainingWords] = useState([]);
  const [shuffledWords, setShuffledWords] = useState([]);

  // ▼▼▼ 【追加】新機能：ユーザーIDを取得 ▼▼▼
  const auth = getAuth();
  const userId = auth.currentUser ? auth.currentUser.uid : null;

  // 既存のuseEffect（完全に維持）
  useEffect(() => {
    const wordsToReview = shuffleArray(words);
    setShuffledWords(wordsToReview);
    setRemainingWords(wordsToReview); // Initially, all words are remaining
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
      // 復習の場合でも、同じロジックで次回復習日を更新
      updateUserWordProgress(userId, currentWord, isCorrect);
    }

    // --- ここから下は既存のロジックを完全に維持 ---
    // 正解した単語をこのセッションの残りから除外する
    if (isCorrect) {
      setRemainingWords(prev => prev.filter(word => word.id !== currentWord.id));
    }

    // 次のカードへ進むか、セッションを終了するか
    if (currentIndex < shuffledWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      x.set(0);
    } else {
      // このセッションで間違えた単語（=remainingWordsに残っている単語）をonBackで返す
      // 正解した場合は、その単語が除外された新しいremainingWordsを返す
      const finalRemaining = isCorrect 
        ? remainingWords.filter(word => word.id !== currentWord.id)
        : remainingWords;
      onBack(finalRemaining);
    }
  }, [currentIndex, shuffledWords, onBack, x, userId, remainingWords]);

  // 既存のhandleTap関数（完全に維持）
  const handleTap = useCallback(() => {
    setIsFlipped(prev => !prev);
    if (!isFlipped && shuffledWords.length > 0) {
      const utterance = new SpeechSynthesisUtterance(shuffledWords[currentIndex].word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }, [isFlipped, currentIndex, shuffledWords]);

  // 既存のレンダリングロジック（完全に維持）
  if (shuffledWords.length === 0) {
    return (
        <div className="loading-container">
            <p>復習する単語がありません。</p>
            <button onClick={() => onBack([])}>ダッシュボードに戻る</button>
        </div>
    );
  }

  const currentWord = shuffledWords[currentIndex];

  return (
    <>
      <div className="test-header">
        <button onClick={() => onBack(remainingWords)} className="back-btn">← 終了</button>
        <h3>復習モード</h3>
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
        <div className="card-counter">{currentIndex + 1} / {shuffledWords.length}</div>
      </div>
    </>
  );
}

export default ReviewFlashcard;