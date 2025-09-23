import React, { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

// LearningFlashcard.jsの構造を参考に、ReviewFlashcardを全面的に修正
function ReviewFlashcard({ words, onBack }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [wordsToKeep, setWordsToKeep] = useState(words);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // xの動き（横スワイプ）に基づいて回転を制御
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);

  // xとyの動き（スワイプ方向）に基づいて背景色を決定
  const backgroundColor = useTransform(
    [x, y],
    ([latestX, latestY]) => {
      const isVerticalDrag = Math.abs(latestY) > Math.abs(latestX);
      if (isVerticalDrag && latestY < -50) return "#facc15"; // 黄色 (完全に覚えた)
      if (!isVerticalDrag && latestX < -50) return "#ef4444"; // 赤 (まだ)
      if (!isVerticalDrag && latestX > 50) return "#4ade80"; // 緑 (覚えた)
      return "#ffffff"; // デフォルトは白
    }
  );

  const goToNextCard = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(prevIndex => prevIndex + 1);
      setIsFlipped(false);
      x.set(0);
      y.set(0);
    } else {
      handleBack();
    }
  };

  const handleDragEnd = (event, info) => {
    const swipeThreshold = 100;
    const currentWord = words[currentIndex];

    // 上スワイプ（完全に覚えた）の時だけ、復習リストから削除
    if (info.offset.y < -swipeThreshold) {
      setWordsToKeep(prevWords => prevWords.filter(w => w.id !== currentWord.id));
      goToNextCard();
    } 
    // 左右のスワイプでは、リストからは削除せず、ただ次のカードへ進む
    else if (Math.abs(info.offset.x) > swipeThreshold) {
      goToNextCard();
    }
  };

  const handleTap = () => {
    setIsFlipped(!isFlipped);
    if (!isFlipped && words.length > 0) {
      const utterance = new SpeechSynthesisUtterance(words[currentIndex].word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };
  
  const handleBack = () => {
    onBack(wordsToKeep);
  };
  
  if (!words || words.length === 0) {
    return (
      <div className="flashcard-container">
        <p>復習する単語はありません。</p>
        <button onClick={() => onBack([])} className="back-btn">戻る</button>
      </div>
    );
  }
  
  const currentWord = words[currentIndex];

  return (
    <>
      <div className="test-header">
        <h3>復習モード</h3>
        <p>右/左：次の単語へ / 上：完全に覚えた（リストから削除）</p>
      </div>
      <div id="flashcard-container">
        {/* ▼▼▼ この部分の構造をLearningFlashcardと完全に一致させました ▼▼▼ */}
        <motion.div
          key={currentIndex}
          id="flashcard"
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          style={{ x, y, rotate }} // yの動きもdragできるように
          onDragEnd={handleDragEnd}
          onTap={handleTap}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div className="card-face card-front" style={{ backgroundColor }}>
            <p id="card-front-text">{currentWord?.word}</p>
          </motion.div>
          <motion.div className="card-face card-back" style={{ backgroundColor }}>
            <h3 id="card-back-word">{currentWord?.word}</h3>
            <p id="card-back-meaning">{currentWord?.meaning}</p>
            <hr />
            <p className="example-text">{currentWord?.example}</p>
            <p className="example-text-ja">{currentWord?.exampleJa}</p>
          </motion.div>
        </motion.div>
        {/* ▲▲▲ 修正完了 ▲▲▲ */}
      </div>
      <div className="card-navigation">
        <button onClick={handleBack} className="back-btn small-btn">終了</button>
        <div className="card-counter">{currentIndex + 1} / {words.length}</div>
      </div>
    </>
  );
}

export default ReviewFlashcard;