import React, { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

function LearningFlashcard({ words, onBack }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  
  const goToNextCard = () => {
    setIsFlipped(false);
    x.set(0);
    if (words.length > 0) {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length);
    }
  };
  
  const goToPrevCard = () => {
    setIsFlipped(false);
    x.set(0);
    if (words.length > 0) {
      setCurrentIndex((prevIndex) => (prevIndex - 1 + words.length) % words.length);
    }
  };

  const handleDragEnd = (event, info) => {
    if (info.offset.x > 100 || info.offset.x < -100) {
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

  if (!words || words.length === 0) {
    return (
      <div>
        <p>学習する単語がありません。</p>
        <button onClick={onBack} className="back-btn">← 範囲選択に戻る</button>
      </div>
    );
  }
  
  const currentWord = words[currentIndex];

  return (
    <>
      <div className="learning-header">
        <button onClick={onBack} className="back-btn">← 範囲選択に戻る</button>
      </div>
      <div id="flashcard-container">
        <motion.div
          key={currentIndex}
          id="flashcard"
          drag="x"
          dragConstraints={{ left: 0, right: 0, top:0, bottom:0 }}
          style={{ x, rotate }}
          onDragEnd={handleDragEnd}
          onTap={handleTap}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <motion.div className="card-face card-front" style={{ backgroundColor: useTransform(x, [-100, 0, 100], ["#fecaca", "#ffffff", "#d9f99d"]) }}>
            <p id="card-front-text">{currentWord?.word}</p>
          </motion.div>
          <motion.div className="card-face card-back" style={{ backgroundColor: useTransform(x, [-100, 0, 100], ["#fecaca", "#ffffff", "#d9f99d"]) }}>
            <h3 id="card-back-word">{currentWord?.word}</h3>
            <p id="card-back-meaning">{currentWord?.meaning}</p>
            <hr />
            <p className="example-text">{currentWord?.example}</p>
            <p className="example-text-ja">{currentWord?.exampleJa}</p>
          </motion.div>
        </motion.div>
      </div>
      <div className="card-navigation">
        <button onClick={goToPrevCard}>＜ 前へ</button>
        <div className="card-counter">{currentIndex + 1} / {words.length}</div>
        <button onClick={goToNextCard}>次へ ＞</button>
      </div>
    </>
  );
}

// この行がエラーを解決します！
export default LearningFlashcard;