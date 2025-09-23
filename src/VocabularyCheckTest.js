import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

// 5ステージ・各20問の厳密な適応型テストロジック
function VocabularyCheckTest({ allWords, onTestComplete }) {
  const [stage, setStage] = useState(1);
  const [currentLevel, setCurrentLevel] = useState(4); // Stage 1: 中学卒業レベル(4)から開始
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  const cardColor = useTransform(x, [-100, 0, 100], ["#ef4444", "#ffffff", "#4ade80"]);

  useEffect(() => {
    const setupStage = (level) => {
      const QUESTIONS_PER_STAGE = 20; // 1ステージあたりの問題数を20に変更
      console.log(`Setting up stage ${stage} with level ${level}`);
      let filteredWords = allWords.filter(word => word.level === level);

      // もしそのレベルの単語が20個未満なら、近いレベルから補完する
      if (filteredWords.length < QUESTIONS_PER_STAGE) {
        const needed = QUESTIONS_PER_STAGE - filteredWords.length;
        const nearbyWords = allWords.filter(
          word => word.level === level - 1 || word.level === level + 1
        );
        filteredWords.push(...shuffleArray(nearbyWords).slice(0, needed));
      }
      
      const shuffled = shuffleArray(filteredWords);
      setCurrentQuestions(shuffled.slice(0, QUESTIONS_PER_STAGE));
      setQuestionIndex(0);
      setScore(0);
      setIsFlipped(false);
      x.set(0);
    };
    
    if (allWords.length > 0) {
      setupStage(currentLevel);
    }
  }, [allWords, stage, currentLevel, x]);

  const handleDragEnd = (event, info) => {
    if (Math.abs(info.offset.x) < 50) return;
    
    const isCorrect = info.offset.x > 100;
    const newScore = score + (isCorrect ? 1 : 0);

    if (questionIndex < currentQuestions.length - 1) {
      setScore(newScore);
      setQuestionIndex(prev => prev + 1);
      setIsFlipped(false);
      x.set(0);
    } else {
      evaluateStage(newScore);
    }
  };

  // ▼▼▼ 修正点：5ステージ制のレベル判定ロジック ▼▼▼
  const evaluateStage = (finalScore) => {
    console.log(`Stage ${stage} finished. Level: ${currentLevel}, Score: ${finalScore}`);
    
    let nextLevel = currentLevel;

    // 正答率に応じて次のレベルを決定
    if (finalScore >= 16) { // 80%以上正解
      nextLevel = Math.min(10, currentLevel + 1); // 1レベル上げる（上限10）
    } else if (finalScore <= 8) { // 40%以下
      nextLevel = Math.max(1, currentLevel - 1); // 1レベル下げる（下限1）
    }
    // 41%~79%の場合はレベル維持

    // 最終ステージでなければ、次のステージへ
    if (stage < 5) {
      setCurrentLevel(nextLevel);
      setStage(stage + 1);
    } else {
      // Stage 5 の結果で最終判定
      onTestComplete(nextLevel);
    }
  };
  // ▲▲▲ 修正完了 ▲▲▲

  const handleTap = () => {
    setIsFlipped(!isFlipped);
    if (!isFlipped && currentQuestions.length > 0) {
      const utterance = new SpeechSynthesisUtterance(currentQuestions[questionIndex].word);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  if (currentQuestions.length === 0) return <div className="loading-container"><p>テスト問題を準備中...</p></div>;

  const currentWord = currentQuestions[questionIndex];

  return (
    <>
      <div className="test-header">
        <h3>単語力チェックテスト (ステージ {stage} / 5)</h3>
        <p>カードをタップでめくり、右にスワイプで「わかる」、左で「わからない」</p>
      </div>
      <div id="flashcard-container">
        <motion.div
          key={`${stage}-${questionIndex}`}
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
        <div className="card-counter">{questionIndex + 1} / {currentQuestions.length}</div>
      </div>
    </>
  );
}

export default VocabularyCheckTest;