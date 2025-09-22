import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

function ReviewFlashcard({ words, onBack, onUpdateReviewWords }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionWords, setSessionWords] = useState(words);

  const y = useMotionValue(0);
  const x = useMotionValue(0); // for horizontal movement if any
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  
  // Change background color based on vertical drag
  const backgroundColor = useTransform(y, [-150, 0, 150], ["#fef08a", "#ffffff", "#ffffff"]);

  useEffect(() => {
    setSessionWords(words);
  }, [words]);

  const goToNextCard = () => {
    setIsFlipped(false);
    y.set(0);
    x.set(0);
    if (sessionWords.length > 0) {
      setCurrentIndex((prevIndex) => (prevIndex + 1));
    }
  };
  
  const handleDragEnd = (event, info) => {
    if (info.offset.y < -100) { // 上にスワイプ
      const removedWord = sessionWords[currentIndex];
      
      // Update parent state
      onUpdateReviewWords(removedWord);
      
      // Update local state for the current session
      const newSessionWords = sessionWords.filter(w => w.id !== removedWord.id);
      setSessionWords(newSessionWords);

      // Reset card position but don't change index immediately
      y.set(0);
      x.set(0);

      // If we removed the last card in the list, we might need to handle the index
      if (currentIndex >= newSessionWords.length && newSessionWords.length > 0) {
        setCurrentIndex(newSessionWords.length - 1);
      }

    } else if (info.offset.x > 100 || info.offset.x < -100) {
        // Allow normal left/right swipe to go to next card without removing
        goToNextCard();
    } else {
      // Snap back if not dragged far enough
      y.set(0);
      x.set(0);
    }
  };
  
  const handleTap = () => {
    setIsFlipped(!isFlipped);
    if (!isFlipped && sessionWords.length > 0 && sessionWords[currentIndex]) {
      const utterance = new SpeechSynthesisUtterance(sessionWords[currentIndex].word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  if (!sessionWords || sessionWords.length === 0 || currentIndex >= sessionWords.length) {
    return (
      <div>
        <p>復習する単語はもうありません。</p>
        <button onClick={onBack} className="back-btn">← メインメニューに戻る</button>
      </div>
    );
  }
  
  const currentWord = sessionWords[currentIndex];

  return (
    <>
      <div className="learning-header">
        <button onClick={onBack} className="back-btn">← メインメニューに戻る</button>
      </div>
      <div id="flashcard-container">
        <motion.div
          key={currentWord.id}
          id="flashcard"
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          style={{ y, x, rotate }}
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
      </div>
      <div className="card-navigation">
        <div className="card-counter">{currentIndex + 1} / {sessionWords.length}</div>
      </div>
       <p className="review-instruction">上にスワイプしてリストから削除</p>
    </>
  );
}

export default ReviewFlashcard;
