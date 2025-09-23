import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

function LearningFlashcard({ words, onBack, initialIndex = 0, sessionInfo }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFlipped, setIsFlipped] = useState(false);
  const [incorrectWords, setIncorrectWords] = useState([]);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  const backgroundColor = useTransform(x, [-100, 0, 100], ["#fecaca", "#ffffff", "#d9f99d"]);

  // ▼▼▼ 「続きから」機能のための修正 ▼▼▼
  // 学習画面を途中で閉じた（アンマウントされた）場合に、現在の進捗を自動保存する
  useEffect(() => {
    return () => {
      // セッションが最後まで終わっていない場合のみ保存
      if (currentIndex < words.length - 1 && sessionInfo) {
        const sessionData = {
          ...sessionInfo,
          index: currentIndex,
        };
        localStorage.setItem('lastLearningSession', JSON.stringify(sessionData));
        console.log('学習進捗を保存しました:', sessionData);
      }
    };
  }, [currentIndex, words, sessionInfo]);
  // ▲▲▲ 修正完了 ▲▲▲

  const goToNextCard = () => {
    setIsFlipped(false);
    x.set(0);
    if (words.length > 0) {
      if (currentIndex < words.length - 1) {
        setCurrentIndex(prevIndex => prevIndex + 1);
      } else {
        // 最後のカードなら正常終了
        handleBack();
      }
    }
  };
  
  const goToPrevCard = () => {
    setIsFlipped(false);
    x.set(0);
    if (words.length > 0) {
      if (currentIndex > 0) {
        setCurrentIndex(prevIndex => prevIndex - 1);
      }
    }
  };

  const handleDragEnd = (event, info) => {
    if (info.offset.x < -100) { // 左にスワイプ（不正解）
      const currentWord = words[currentIndex];
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

  // ▼▼▼ 「続きから」機能のための修正 ▼▼▼
  // 正常に終了した場合（戻るボタンを押した時）は、保存されたセッション情報を削除する
  const handleBack = () => {
    localStorage.removeItem('lastLearningSession');
    onBack(incorrectWords);
  };
  // ▲▲▲ 修正完了 ▲▲▲

  if (!words || words.length === 0) {
    return (
      <div>
        <p>学習する単語がありません。</p>
        <button onClick={handleBack} className="back-btn">← 範囲選択に戻る</button>
      </div>
    );
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

