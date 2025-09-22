import React, { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

function ReviewFlashcard({ words, onBack, onUpdateReviewWords }) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotateX = useTransform(y, [-150, 0, 150], [30, 0, -30]);
  const rotateY = useTransform(x, [-150, 0, 150], [-30, 0, 30]);

  // ▼▼▼ 修正点 ▼▼▼
  // 左右・上のスワイプ方向を正しく判定し、色を返すようにロジックを修正
  const backgroundColor = useTransform(
    [x, y],
    ([latestX, latestY]) => {
      const isVerticalDrag = Math.abs(latestY) > Math.abs(latestX);

      if (isVerticalDrag) {
        // 上方向へのスワイプ（難しい）
        if (latestY < -50) {
          return "#facc15"; // 黄色
        }
      } else {
        // 横方向へのスワイプ
        if (latestX < -50) {
          return "#ef4444"; // 左：赤（不正解）
        } else if (latestX > 50) {
          return "#4ade80"; // 右：緑（正解）
        }
      }

      // デフォルトの色
      return "#ffffff"; // 白色
    }
  );
  // ▲▲▲ 修正点 ▲▲▲

  const handleTap = () => {
    setIsFlipped(!isFlipped);
    if (!isFlipped && words.length > 0) {
      const utterance = new SpeechSynthesisUtterance(words[questionIndex].word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSwipe = (result) => {
    const currentWord = words[questionIndex];
    if (result === 'correct') {
      onUpdateReviewWords(currentWord);
    }
    
    if (questionIndex < words.length - 1) {
      setQuestionIndex(prev => prev + 1);
      setIsFlipped(false);
      x.set(0);
      y.set(0);
    } else {
      onBack();
    }
  };

  const handleDragEnd = (event, info) => {
    const { offset, velocity } = info;
    const isVerticalDrag = Math.abs(velocity.y) > Math.abs(velocity.x);

    if (isVerticalDrag) {
      // 上方向へのスワイプ
      if (offset.y < -100) {
        handleSwipe('difficult');
        return;
      }
    } else {
      // 横方向へのスワイプ
      if (offset.x > 100) {
        handleSwipe('correct'); // 右：正解
      } else if (offset.x < -100) {
        handleSwipe('incorrect'); // 左：不正解
      }
    }
  };

  if (!words || words.length === 0) {
    return (
      <div className="flashcard-container">
        <p>復習する単語はありません。</p>
        <button onClick={onBack} className="back-btn">戻る</button>
      </div>
    );
  }

  const currentWord = words[questionIndex];

  return (
    <>
      <div className="test-header">
        <h3>復習モード</h3>
        <p>右にスワイプで「覚えた」、左で「まだ」、上で「難しい」</p>
      </div>
      <div className="flashcard-container">
        <motion.div
          key={questionIndex}
          className="flashcard"
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          style={{ x, y, rotateX, rotateY, backgroundColor }}
          onDragEnd={handleDragEnd}
          onTap={handleTap}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="card-face card-front">
            <p className="card-front-text">{currentWord?.word}</p>
          </div>
          <div className="card-face card-back">
            <h3 className="card-back-word">{currentWord?.word}</h3>
            <p className="card-back-meaning">{currentWord?.meaning}</p>
            <hr />
            <p className="example-text">{currentWord?.example}</p>
            <p className="example-text-ja">{currentWord?.exampleJa}</p>
          </div>
        </motion.div>
      </div>
      <div className="card-navigation">
        <button onClick={onBack} className="back-btn small-btn">終了</button>
        <div className="card-counter">{questionIndex + 1} / {words.length}</div>
      </div>
    </>
  );
}

export default ReviewFlashcard;