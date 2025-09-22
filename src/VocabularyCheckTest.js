import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

const shuffleArray = (array) => {
  return [...array].sort(() => Math.random() - 0.5);
};

function VocabularyCheckTest({ allWords, onTestComplete }) {
  const [stage, setStage] = useState(1);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  const cardColor = useTransform(x, [-100, 0, 100], ["#ef4444", "#ffffff", "#4ade80"]);

  useEffect(() => {
    const setupStage = (targetLevel) => {
      const filteredWords = allWords.filter(word => word.level === targetLevel);
      const shuffled = shuffleArray(filteredWords);
      setCurrentQuestions(shuffled.slice(0, 10));
      setQuestionIndex(0);
      setScore(0);
      setIsFlipped(false);
      x.set(0);
    };
    
    if (allWords.length > 0) {
      if (stage === 1) setupStage(3); // ステージ1: 中学卒業レベル (英検3級)
      if (stage === 2) setupStage(5); // ステージ2: 高校標準レベル (英検2級)
      if (stage === 3) setupStage(7); // ステージ3: 大学中級レベル (英検準1級)
    }
  }, [allWords, stage, x]);

  const handleDragEnd = (event, info) => {
    if (Math.abs(info.offset.x) < 50) return;
    
    const isCorrect = info.offset.x > 100;
    const newScore = score + (isCorrect ? 1 : 0);

    if (questionIndex < 9) {
      setScore(newScore);
      setQuestionIndex(prev => prev + 1);
      setIsFlipped(false);
      x.set(0);
    } else {
      evaluateStage(newScore);
    }
  };

  const evaluateStage = (finalScore) => {
    if (stage === 1) { // 中学卒業レベル(3)の結果
      if (finalScore >= 8) { setStage(2); }         // -> 高校標準(5)のテストへ
      else if (finalScore <= 2) { onTestComplete(1); } // -> 中学基礎(1)と判定
      else if (finalScore <= 5) { onTestComplete(2); } // -> 中学標準(2)と判定
      else { onTestComplete(3); }                      // -> 中学卒業(3)と判定
    } else if (stage === 2) { // 高校標準レベル(5)の結果
      if (finalScore >= 8) { setStage(3); }         // -> 大学中級(7)のテストへ
      else if (finalScore <= 4) { onTestComplete(4); } // -> 高校基礎(4)と判定
      else { onTestComplete(5); }                      // -> 高校標準(5)と判定
    } else if (stage === 3) { // 大学中級レベル(7)の結果
      if (finalScore >= 8) { onTestComplete(8); } // -> 大学上級(8)と判定
      else if (finalScore <= 4) { onTestComplete(6); } // -> 高校応用(6)と判定
      else { onTestComplete(7); }                      // -> 大学中級(7)と判定
    }
  };

  const handleTap = () => {
    setIsFlipped(!isFlipped);
    if (!isFlipped && currentQuestions.length > 0) {
      const utterance = new SpeechSynthesisUtterance(currentQuestions[questionIndex].word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  if (currentQuestions.length === 0) return <p>テスト問題を準備中...</p>;

  const currentWord = currentQuestions[questionIndex];

  return (
    <>
      <div className="test-header">
        <h3>単語力チェックテスト (ステージ {stage})</h3>
        <p>カードをタップでめくり、右にスワイプで「わかる」、左で「わからない」</p>
      </div>
      <div id="flashcard-container">
        <motion.div
          key={questionIndex}
          id="flashcard"
          drag="x"
          dragConstraints={{ left: 0, right: 0, top:0, bottom:0 }}
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
        <div className="card-counter">{questionIndex + 1} / 10</div>
      </div>
    </>
  );
}

export default VocabularyCheckTest;