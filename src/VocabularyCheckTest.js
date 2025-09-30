import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { db, auth } from './firebaseConfig';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateUserWordProgress } from './logic/reviewLogic';
import { logStudySession } from './logic/studyLogger';
import { updateProgressPercentage } from './logic/progressLogic'; // ★インポート
import { FaUndo, FaArrowLeft } from 'react-icons/fa';

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
  'highschool-english': '高校英語'
};

export default function VocabularyCheckTest({ allWords: passedWords, onTestComplete }) {
  const [allWords, setAllWords] = useState(passedWords || []);
  const [stage, setStage] = useState(1);
  const [currentLevel, setCurrentLevel] = useState(4);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isBeginnerMode, setIsBeginnerMode] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [consecutiveSuccesses, setConsecutiveSuccesses] = useState(0);
  const navigate = useNavigate();

  // Framer Motion の設定
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  // ▼▼▼【修正点1】スワイプ時の背景色アニメーションを再設定▼▼▼
  const cardColor = useTransform(x, [-100, 0, 100], ["#fee2e2", "#ffffff", "#dcfce7"]);

  useEffect(() => {
    // passedWords があればそれを使う、なければフェッチする（フォールバック）
    if (!passedWords || passedWords.length === 0) {
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
          const validWords = uniqueWords.filter(
            word => word && word.word && (word.meaning || word.japanese)
          );
          setAllWords(validWords);
        } catch (error) {
          console.error("全単語の読み込みに失敗しました:", error);
        }
      };
      fetchAllWords();
    }
  }, [passedWords]);

  useEffect(() => {
    const setupStage = (level) => {
      // ステージ1は5問、それ以外は10問
      const QUESTIONS_PER_STAGE = stage === 1 ? 5 : 10;
      
      // 英検レベルに基づいてフィルタリング
      let filteredWords = allWords.filter(word => {
        // eikenLevelsフィールドがある場合はそれを使用
        if (word.eikenLevels && Array.isArray(word.eikenLevels)) {
          return word.eikenLevels.includes(level);
        }
        // eikenLevelsがない場合は従来のlevelフィールドを使用
        return Number(word.level) === Number(level);
      });
      
      if (filteredWords.length < QUESTIONS_PER_STAGE) {
        const needed = QUESTIONS_PER_STAGE - filteredWords.length;
        const nearbyWords = allWords.filter(word => {
          // eikenLevelsフィールドがある場合は隣接する英検レベルを探す
          if (word.eikenLevels && Array.isArray(word.eikenLevels)) {
            return word.eikenLevels.includes(level - 1) || word.eikenLevels.includes(level + 1);
          }
          // eikenLevelsがない場合は従来のlevelフィールドを使用
          return Math.abs(word.level - level) === 1;
        });
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

  const handleShowAnswer = () => {
    if (!isFlipped) {
      setIsFlipped(true);
    }
  };

  const handleDragEnd = (event, info) => {
    if (Math.abs(info.offset.x) < 30) return;
    
    const currentWord = currentQuestions[questionIndex];
    const user = auth.currentUser;
    
    if (!isFlipped) {
      // 最初のスワイプ：カードを裏返す
      setIsFlipped(true);
      x.set(0);
    } else {
      // 2回目のスワイプ：次の単語に進む
      const isCorrect = info.offset.x > 0;
      
      // For incorrect answers, add the word to the user's review list.
      if (!isCorrect && user && currentWord) {
        updateUserWordProgress(user.uid, currentWord, false);
      }

      const newScore = score + (isCorrect ? 1 : 0);
      if (questionIndex < currentQuestions.length - 1) {
        setScore(newScore);
        setQuestionIndex(prev => prev + 1);
        setIsFlipped(false);
        x.set(0);
      } else {
        evaluateStage(newScore);
      }
    }
  };

  const evaluateStage = (finalScore) => {
    let nextLevel = currentLevel;
    
    // ステージ1（5問）の特別処理
    if (stage === 1) {
      if (finalScore >= 4) {
        // 4問以上正解：通常のステージ2に進む
        nextLevel = currentLevel;
        setStage(2);
        setCurrentLevel(nextLevel);
        return;
      } else {
        // 3問以下：初学者モードに移行
        setIsBeginnerMode(true);
        setCurrentLevel(4); // 英検4級レベルから開始
        setStage(2);
        return;
      }
    }
    
    // 通常のステージ評価（10問）
    const totalQuestions = currentQuestions.length;
    
    // より厳密な判定基準を適用（段階的に厳しくなる）
    let passThreshold, failThreshold;
    if (currentLevel >= 9) {
      // 最上位層（レベル9-10）：85%以上で合格、15%以下で不合格
      passThreshold = Math.ceil(totalQuestions * 0.85);
      failThreshold = Math.floor(totalQuestions * 0.15);
    } else if (currentLevel >= 7) {
      // 上位層（レベル7-8）：80%以上で合格、20%以下で不合格
      passThreshold = Math.ceil(totalQuestions * 0.8);
      failThreshold = Math.floor(totalQuestions * 0.2);
    } else if (currentLevel >= 5) {
      // 中位層（レベル5-6）：75%以上で合格、25%以下で不合格
      passThreshold = Math.ceil(totalQuestions * 0.75);
      failThreshold = Math.floor(totalQuestions * 0.25);
    } else {
      // 下位層（レベル1-4）：70%以上で合格、30%以下で不合格
      passThreshold = Math.ceil(totalQuestions * 0.7);
      failThreshold = Math.floor(totalQuestions * 0.3);
    }
    
    // 初学者モードの特別処理
    if (isBeginnerMode) {
      if (finalScore >= passThreshold) {
        // 合格：レベルアップ
        nextLevel = Math.min(10, currentLevel + 1);
      } else if (finalScore <= failThreshold) {
        // 不合格：レベルダウン
        if (currentLevel === 4) {
          // 4級で失敗した場合、5級に戻る
          nextLevel = 5;
        } else if (currentLevel === 5) {
          // 5級で失敗した場合、テスト終了（レベル1に設定）
          finishTestAndSave(1);
          return;
        } else {
          nextLevel = Math.max(1, currentLevel - 1);
        }
      }
      
      // 初学者モードの早期終了条件
      if (currentLevel === 5 && finalScore >= passThreshold) {
        // 5級で合格した場合、テスト終了（レベル5に設定）
        finishTestAndSave(5);
        return;
      }
    } else {
      // 通常モード
      if (finalScore >= passThreshold) {
        setConsecutiveFailures(0); // 成功時は連続失敗をリセット
        
        // 上位層（レベル7以上）では連続成功が必要
        if (currentLevel >= 7) {
          setConsecutiveSuccesses(prev => prev + 1);
          // レベル7-8: 2回連続成功でレベルアップ
          // レベル9-10: 3回連続成功でレベルアップ
          const requiredSuccesses = currentLevel >= 9 ? 3 : 2;
          if (consecutiveSuccesses + 1 >= requiredSuccesses) {
            nextLevel = Math.min(10, currentLevel + 1);
            setConsecutiveSuccesses(0); // レベルアップ時は連続成功をリセット
          } else {
            nextLevel = currentLevel; // レベル維持
          }
        } else {
          // 下位層・中位層は1回の成功でレベルアップ
          nextLevel = Math.min(10, currentLevel + 1);
          setConsecutiveSuccesses(0);
        }
      } else if (finalScore <= failThreshold) {
        nextLevel = Math.max(1, currentLevel - 1);
        setConsecutiveFailures(prev => prev + 1); // 失敗時は連続失敗をカウント
        setConsecutiveSuccesses(0); // 失敗時は連続成功をリセット
      } else {
        setConsecutiveFailures(0); // 維持時は連続失敗をリセット
        setConsecutiveSuccesses(0); // 維持時は連続成功をリセット
      }
    }
    
    // 上位層での連続失敗による早期終了
    if (!isBeginnerMode && currentLevel >= 7 && consecutiveFailures >= 2) {
      // 上位層で2回連続失敗した場合、テスト終了
      finishTestAndSave(Math.max(1, currentLevel - 2));
      return;
    }
    
    // 通常の早期終了条件（初学者モード以外）
    if (!isBeginnerMode && finalScore <= failThreshold && currentLevel <= 2) {
      // レベル2以下で不合格の場合、テスト終了
      finishTestAndSave(currentLevel);
      return;
    }
    
    if (stage < 10) {
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

        // Log the placement test result as a single session event
        logStudySession(user.uid, {
          sessionType: 'placement_test',
          finalLevel: finalUserLevel,
          estimatedVocabulary: estimatedVocabulary,
          timestamp: new Date(),
        });

        // ★進捗率を更新
        await updateProgressPercentage(user.uid);
        
        if (onTestComplete) {
          onTestComplete(finalUserLevel);
        } else {
          alert(`テスト完了！\nあなたの単語レベル: ${finalUserLevel}\n推定語彙数: 約${estimatedVocabulary}語`);
          navigate('/');
        }

      } catch (error) {
        console.error("テスト結果の保存に失敗しました: ", error);
        alert("テスト結果の保存に失敗しました。");
      }
    }
  };

  const handleTap = () => {
    setIsFlipped(!isFlipped);
    if (!isFlipped && currentQuestions.length > 0) {
      const word = currentQuestions[questionIndex].word;
      const utterance = new SpeechSynthesisUtterance(word);
      
      // 強制的に英語音声を設定
      utterance.lang = 'en-US';
      
      // デバイスを検出
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        // モバイルデバイス: 英語音声を強制設定
        utterance.rate = 0.9; // 少しゆっくりめ
        utterance.pitch = 1.0; // 自然なピッチ
        utterance.volume = 0.8; // 適度な音量
        
        // 利用可能な英語音声を取得
        const availableVoices = window.speechSynthesis.getVoices();
        const englishVoices = availableVoices.filter(voice => 
          voice.lang === 'en-US' || voice.lang.startsWith('en-')
        );
        
        if (englishVoices.length > 0) {
          // 英語音声を優先的に選択
          const selectedVoice = englishVoices.find(voice => voice.name.includes('English')) ||
                               englishVoices.find(voice => voice.name.includes('US')) ||
                               englishVoices[0];
          utterance.voice = selectedVoice;
        }
      } else {
        // デスクトップ: 英語音声を優先選択
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        // 利用可能な英語音声を取得
        const availableVoices = window.speechSynthesis.getVoices();
        const englishVoices = availableVoices.filter(voice => 
          voice.lang === 'en-US' || voice.lang.startsWith('en-')
        );
        
        if (englishVoices.length > 0) {
          const selectedVoice = 
            englishVoices.find(voice => voice.name.includes('Google')) ||
            englishVoices.find(voice => voice.name === 'Alex') ||
            englishVoices.find(voice => voice.name.includes('Microsoft')) ||
            englishVoices.find(voice => voice.name.includes('English')) ||
            englishVoices.find(voice => voice.name.includes('US')) ||
            englishVoices[0];
          
          utterance.voice = selectedVoice;
        }
      }
      
      console.log('Test speaking with voice:', utterance.voice?.name || 'default', 'lang:', utterance.lang);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handlePrevQuestion = () => {
    if (questionIndex === 0) return;
    setQuestionIndex(prev => Math.max(0, prev - 1));
    setIsFlipped(false);
    x.set(0);
  };

  if (loading || currentQuestions.length === 0) {
    return <div className="loading-container"><p>テスト問題を準備中...</p></div>;
  }

  const currentWord = currentQuestions[questionIndex];

  return (
    <>
      <div className="test-header">
        <h3>単語力チェックテスト (ステージ {stage} / 10)</h3>
        {isBeginnerMode && (
          <div>
            <p style={{ color: '#f59e0b', fontWeight: 'bold' }}>
              初学者モード: 英検{currentLevel === 5 ? '5級' : currentLevel === 4 ? '4級' : `${currentLevel}級`}レベル
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
              {currentLevel === 5 ? '5級で合格すればテスト終了' : '4級で失敗すれば5級に、5級で失敗すればテスト終了'}
            </p>
          </div>
        )}
        {!isBeginnerMode && currentLevel >= 7 && consecutiveSuccesses > 0 && (
          <div>
            <p style={{ color: '#10b981', fontWeight: 'bold' }}>
              連続成功: {consecutiveSuccesses}回 (レベルアップまで{currentLevel >= 9 ? 3 : 2}回必要)
            </p>
          </div>
        )}
        {!isBeginnerMode && currentLevel <= 2 && (
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
            レベル2以下で不合格の場合、テストが終了します
          </p>
        )}
        {!isBeginnerMode && currentLevel >= 7 && (
          <p style={{ color: '#dc2626', fontSize: '0.9rem' }}>
            上位層モード: 70%以上で合格、30%以下で不合格。2回連続失敗でテスト終了
          </p>
        )}
        {!isBeginnerMode && currentLevel >= 5 && currentLevel < 7 && (
          <p style={{ color: '#f59e0b', fontSize: '0.9rem' }}>
            中位層モード: 65%以上で合格、35%以下で不合格
          </p>
        )}
        <p>{!isFlipped ? 'カードをタップして答えを確認' : 'わかる→右へスワイプ / わからない→左へスワイプ'}</p>
      </div>

      <div id="flashcard-container" style={{ 
        height: '50vh', 
        position: 'relative',
        minHeight: '250px',
        maxHeight: '400px',
        margin: '0 auto',
        maxWidth: '90vw'
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${stage}-${questionIndex}-${isFlipped ? 'back' : 'front'}`}
            id="flashcard"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            style={{ 
              x, 
              rotate, 
              backgroundColor: isFlipped ? '#f0f9ff' : cardColor,
              border: isFlipped ? '2px solid #3b82f6' : 'none',
              width: '100%',
              height: '100%',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              cursor: 'pointer'
            }}
            onDragEnd={handleDragEnd}
            onTap={handleShowAnswer}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3 }}
          >
            {!isFlipped ? (
              /* カード表面 */
              <div className="card-face card-front" style={{ 
                backgroundColor: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px'
              }}>
                <p id="card-front-text" style={{ 
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  margin: 0,
                  color: '#1f2937'
                }}>{currentWord?.word}</p>
              </div>
            ) : (
              /* カード裏面 */
              <div className="card-face card-back" style={{ 
                backgroundColor: 'transparent',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}>
                <h3 id="card-back-word" style={{ 
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  margin: '0 0 15px 0',
                  color: '#1f2937'
                }}>{currentWord?.word}</h3>
                <p id="card-back-meaning" style={{ 
                  fontSize: '1.2rem',
                  textAlign: 'center',
                  margin: '0 0 15px 0',
                  color: '#374151'
                }}>{currentWord?.meaning || currentWord?.japanese}</p>
                {(currentWord?.example || currentWord?.exampleJa) && (
                  <hr style={{ margin: '15px 0', border: '1px solid #e5e7eb' }} />
                )}
                <p className="example-text" style={{ 
                  fontSize: '1rem',
                  textAlign: 'center',
                  margin: '0 0 10px 0',
                  color: '#6b7280',
                  fontStyle: 'italic'
                }}>{currentWord?.example}</p>
                <p className="example-text-ja" style={{ 
                  fontSize: '1rem',
                  textAlign: 'center',
                  margin: 0,
                  color: '#6b7280'
                }}>{currentWord?.exampleJa}</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="card-navigation">
        <div className="card-counter">{questionIndex + 1} / {currentQuestions.length}</div>
      </div>

      
      <div className="footer-container">
        <div className="flashcard-footer">
          <button onClick={handlePrevQuestion} className="prev-action" disabled={questionIndex === 0}>
            <FaUndo /> 前の問題
          </button>
          <button onClick={() => {
            console.log('VocabularyCheckTest: 前の画面に戻るボタンがクリックされました');
            
            // 直接ダッシュボードに遷移（basenameを考慮）
            console.log('VocabularyCheckTest: 直接ダッシュボードに遷移します');
            window.location.replace('/tsukutan-app/student-dashboard');
          }} className="back-action">
            <FaArrowLeft /> 前の画面に戻る
          </button>
        </div>
      </div>
      
      <div className="swipe-instructions">
        {!isFlipped ? (
          <span>スワイプして答えを確認</span>
        ) : (
          <>
            <span>← わからない</span>
            <span>わかる →</span>
          </>
        )}
      </div>
    </>
  );
}