import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { db, auth } from './firebaseConfig';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

// 配列をシャッフルするヘルパー関数
const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

// どのテキストブックから単語を探すかを定義
const textbooks = {
  'osaka-koukou-nyuushi': '大阪府公立入試英単語',
  'target-1900': 'ターゲット1900'
};

export default function VocabularyCheckTest() {
  const [allWords, setAllWords] = useState([]);
  const [stage, setStage] = useState(1);
  const [currentLevel, setCurrentLevel] = useState(4);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Framer Motion の設定
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  // ▼▼▼【修正点1】スワイプ時の背景色アニメーションを再設定▼▼▼
  const cardColor = useTransform(x, [-100, 0, 100], ["#fee2e2", "#ffffff", "#dcfce7"]);

  useEffect(() => {
    const fetchAllWords = async () => {
      setLoading(true);
      try {
        let combinedWords = [];
        const promises = Object.keys(textbooks).map(id => 
          getDocs(collection(db, 'textbooks', id, 'words'))
        );
        const snapshots = await Promise.all(promises);
        snapshots.forEach(snapshot => {
          const wordsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          combinedWords = [...combinedWords, ...wordsData];
        });
        const uniqueWords = Array.from(new Map(combinedWords.map(item => [item.word, item])).values());
        // 意味のフィールド名が `meaning` または `japanese` の両方に対応
        const validWords = uniqueWords.filter(
          word => word && word.word && (word.meaning || word.japanese)
        );
        setAllWords(validWords);
      } catch (error) {
        console.error("全単語の読み込みに失敗しました:", error);
      }
    };
    fetchAllWords();
  }, []);

  useEffect(() => {
    const setupStage = (level) => {
      const QUESTIONS_PER_STAGE = 20;
      // データ型が文字列でも数値でも比較できるよう '==' を使用
      let filteredWords = allWords.filter(word => word.level == level);
      
      if (filteredWords.length < QUESTIONS_PER_STAGE) {
        const needed = QUESTIONS_PER_STAGE - filteredWords.length;
        const nearbyWords = allWords.filter(word => Math.abs(word.level - level) === 1);
        filteredWords.push(...shuffleArray(nearbyWords).slice(0, needed));
      }
      setCurrentQuestions(shuffleArray(filteredWords).slice(0, QUESTIONS_PER_STAGE));
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
    const isCorrect = info.offset.x > 0; // 右スワイプを「わかる」
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

  const evaluateStage = (finalScore) => {
    let nextLevel = currentLevel;
    if (finalScore >= 16) nextLevel = Math.min(10, currentLevel + 1);
    else if (finalScore <= 8) nextLevel = Math.max(1, currentLevel - 1);
    if (stage < 5) {
      setCurrentLevel(nextLevel);
      setStage(stage + 1);
    } else {
      finishTestAndSave(nextLevel);
    }
  };
  
  const finishTestAndSave = async (finalUserLevel) => {
    let estimatedVocabulary = allWords.filter(w => w.level <= finalUserLevel).length;
    const user = auth.currentUser;
    if (user) {
      const userDocRef = doc(db, 'users', user.uid);
      try {
        await updateDoc(userDocRef, {
          level: finalUserLevel,
          'progress.currentVocabulary': estimatedVocabulary,
          'progress.lastCheckedAt': serverTimestamp(),
        }, { merge: true });
        alert(`テスト完了！\nあなたの単語レベル: ${finalUserLevel}\n推定語彙数: 約${estimatedVocabulary}語`);
        navigate('/');
      } catch (error) {
        console.error("テスト結果の保存に失敗しました: ", error);
        alert("テスト結果の保存に失敗しました。");
      }
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

  if (loading || currentQuestions.length === 0) {
    return <div className="loading-container"><p>テスト問題を準備中...</p></div>;
  }

  const currentWord = currentQuestions[questionIndex];

  return (
    <>
      <div className="test-header">
        <h3>単語力チェックテスト (ステージ {stage} / 5)</h3>
        <p>わかる→右へスワイプ / わからない→左へスワイプ</p>
      </div>

      <div id="flashcard-container">
        <motion.div
          key={`${stage}-${questionIndex}`}
          id="flashcard"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          style={{ x, rotate, backgroundColor: cardColor }}
          onDragEnd={handleDragEnd}
          onTap={handleTap}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* ▼▼▼【修正点1】カード表面の背景を透明にし、親の色が見えるようにする▼▼▼ */}
          <div className="card-face card-front" style={{ backgroundColor: 'transparent' }}>
            <p id="card-front-text">{currentWord?.word}</p>
          </div>
          
          {/* ▼▼▼【修正点2】カード裏面の表示形式を元の完全な状態に復元▼▼▼ */}
          <div className="card-face card-back">
            <h3 id="card-back-word">{currentWord?.word}</h3>
            {/* meaningとjapaneseの両方に対応 */}
            <p id="card-back-meaning">{currentWord?.meaning || currentWord?.japanese}</p>
            {/* exampleとexampleJaが存在する場合のみhrと例文を表示 */}
            {(currentWord?.example || currentWord?.exampleJa) && <hr />}
            <p className="example-text">{currentWord?.example}</p>
            <p className="example-text-ja">{currentWord?.exampleJa}</p>
          </div>
        </motion.div>
      </div>

      <div className="card-navigation">
        <div className="card-counter">{questionIndex + 1} / {currentQuestions.length}</div>
      </div>
      
      <div className="swipe-instructions">
        <span>← わからない</span>
        <span>タップで意味表示</span>
        <span>わかる →</span>
      </div>
    </>
  );
}