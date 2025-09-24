import React, { useState, useEffect, useCallback } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { db, auth } from './firebaseConfig';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

// 既存のshuffleArray関数はそのまま使用
const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

function VocabularyCheckTest() {
  const [allWords, setAllWords] = useState([]); // Firestoreから読み込んだ全単語
  const [stage, setStage] = useState(1);
  const [currentLevel, setCurrentLevel] = useState(4);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // framer-motionのロジックはそのまま
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  const cardColor = useTransform(x, [-100, 0, 100], ["#ef4444", "#ffffff", "#4ade80"]);

  // ▼▼▼ 修正点：Firestoreから全単語を読み込む ▼▼▼
  useEffect(() => {
    const fetchAllWords = async () => {
      setLoading(true);
      try {
        const wordsCollection = collection(db, 'words');
        const wordsSnapshot = await getDocs(wordsCollection);
        const wordsList = wordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllWords(wordsList);
      } catch (error) {
        console.error("Error fetching all words:", error);
      }
      setLoading(false);
    };
    fetchAllWords();
  }, []);
  // ▲▲▲ 修正完了 ▲▲▲

  // ステージ設定ロジックはあなたのものをベースに
  useEffect(() => {
    const setupStage = (level) => {
      const QUESTIONS_PER_STAGE = 20;
      let filteredWords = allWords.filter(word => word.level === level);

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
      setLoading(false);
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
      // ステージの最後の問題なら評価へ
      evaluateStage(newScore);
    }
  };

  const evaluateStage = (finalScore) => {
    let nextLevel = currentLevel;
    if (finalScore >= 16) { nextLevel = Math.min(10, currentLevel + 1); }
    else if (finalScore <= 8) { nextLevel = Math.max(1, currentLevel - 1); }

    if (stage < 5) {
      setCurrentLevel(nextLevel);
      setStage(stage + 1);
    } else {
      // ▼▼▼ 修正点：最終ステージ完了後、結果をFirestoreに保存 ▼▼▼
      finishTestAndSave(nextLevel);
    }
  };

  const finishTestAndSave = async (finalUserLevel) => {
    // 最終レベルから推定語彙数を計算（各レベルの単語数を足し上げる）
    let estimatedVocabulary = 0;
    for (let i = 1; i <= finalUserLevel; i++) {
        estimatedVocabulary += allWords.filter(w => w.level === i).length;
    }
    
    const user = auth.currentUser;
    if (user) {
      const userDocRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userDocRef, {
          'progress.currentVocabulary': estimatedVocabulary,
          'progress.lastCheckedAt': serverTimestamp(),
        });
      } catch (error) {
        console.error("Error updating user progress: ", error);
        alert("テスト結果の保存に失敗しました。");
      }
    }
    // TODO: 結果表示ページへの遷移
    alert(`あなたの現在の単語レベルは ${finalUserLevel}、推定語彙数は約 ${estimatedVocabulary} 語です！`);
    navigate('/student-dashboard'); // とりあえずダッシュボードに戻る
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

  if (loading || currentQuestions.length === 0) return <div className="loading-container"><p>テスト問題を準備中...</p></div>;

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