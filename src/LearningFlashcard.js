import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

// ▼▼▼ 修正点 ▼▼▼
// initialIndexとsessionInfoをpropsで受け取る
function LearningFlashcard({ words, onBack, initialIndex = 0, sessionInfo }) {
  // initialIndexを使って、前回終了したカードから開始できるようにする
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  // ▲▲▲ 修正点 ▲▲▲

  const [isFlipped, setIsFlipped] = useState(false);
  const [incorrectWords, setIncorrectWords] = useState([]);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  const backgroundColor = useTransform(x, [-100, 0, 100], ["#fecaca", "#ffffff", "#d9f99d"]);

  // ▼▼▼ 修正点 ▼▼▼
  // この学習ページを離れる（アンマウントされる）時に、現在の進捗を保存する
  useEffect(() => {
    return () => {
      // セッション情報と現在のカード番号をlocalStorageに保存
      if (words.length > 0 && sessionInfo) {
        const sessionData = {
          ...sessionInfo,
          index: currentIndex,
          wordCount: words.length
        };
        localStorage.setItem('lastLearningSession', JSON.stringify(sessionData));
      }
    };
  }, [currentIndex, words.length, sessionInfo]);
  // ▲▲▲ 修正点 ▲▲▲


  const goToNextCard = () => {
    setIsFlipped(false);
    x.set(0);
    if (words.length > 0) {
      setCurrentIndex((prevIndex) => (prevIndex + 1));
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
    if (info.offset.x < -100) { // 左にスワイプ（不正解）
      const currentWord = words[currentIndex];
      // 重複しないように不正解リストに追加
      if (!incorrectWords.some(w => w.id === currentWord.id)) {
        setIncorrectWords(prev => [...prev, currentWord]);
      }
      goToNextCard();
    } else if (info.offset.x > 100) { // 右にスワイプ（正解）
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
    // 終了時は前回セッション情報をクリア
    localStorage.removeItem('lastLearningSession');
    onBack(incorrectWords);
  };
  
  // 最後のカードまで到達したら自動的に終了
  if (currentIndex >= words.length) {
    handleBack();
    return null;
  }

  const currentWord = words[currentIndex];

  return (
    <>
      <div className="learning-header">
        <button onClick={handleBack} className="back-btn">← 範囲選択に戻る</button>
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
        <button onClick={goToPrevCard} disabled={currentIndex === 0}>＜ 前へ</button>
        <div className="card-counter">{currentIndex + 1} / {words.length}</div>
        <button onClick={goToNextCard}>次へ ＞</button>
      </div>
    </>
  );
}

export default LearningFlashcard;
