import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { db, auth } from './firebaseConfig';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateUserWordProgress } from './logic/reviewLogic';
import { logStudySession } from './logic/studyLogger';
import { initialize, speak } from './logic/speechUtils';
import { updateProgressPercentage } from './logic/progressLogic'; // ★インポート
import { FaUndo, FaArrowLeft } from 'react-icons/fa';
import wordsData from './wordsData.json';

// 配列をシャッフルするヘルパー関数
const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};


// 定数定義
const QUESTIONS_PER_STAGE = 10; // ステージ1以外は10問
const QUESTIONS_STAGE_1 = 5; // ステージ1は5問

export default function VocabularyCheckTest({ allWords: passedWords, onTestComplete }) {
  const [allWords, setAllWords] = useState(passedWords || []);
  const [stage, setStage] = useState(1);
  const [currentLevel, setCurrentLevel] = useState(3);
  const [currentQuestions, setCurrentQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isBeginnerMode, setIsBeginnerMode] = useState(false);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const [consecutiveSuccesses, setConsecutiveSuccesses] = useState(0);
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [responseTimes, setResponseTimes] = useState([]);
  const [adaptiveLevel, setAdaptiveLevel] = useState(3); // 適応的レベル調整
  const [performanceHistory, setPerformanceHistory] = useState([]); // パフォーマンス履歴
  const [consecutiveConsistentResults, setConsecutiveConsistentResults] = useState(0); // 連続一貫結果
  const navigate = useNavigate();

  // Framer Motion の設定
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-25, 0, 25]);
  const cardColor = useTransform(x, [-100, 0, 100], ["#fecaca", "#ffffff", "#d9f99d"]);

  useEffect(() => {
    // passedWords があればそれを使う、なければwordsData.jsonを使用
    if (!passedWords || passedWords.length === 0) {
      setLoading(true);
      try {
        // wordsData.jsonから単語を取得
        const validWords = wordsData.filter(
          word => word && word.word && (word.meaning || word.japanese)
        );
        setAllWords(validWords);
        console.log('実力テスト用単語データ読み込み完了:', validWords.length, '語');
      } catch (error) {
        console.error("全単語の読み込みに失敗しました:", error);
      }
      setLoading(false);
    }
    
    // テスト開始時間を記録（現在は使用していない）
  }, [passedWords]);

  // 適応的難易度調整のロジック
  const calculateAdaptiveLevel = (performanceHistory, baseLevel) => {
    if (performanceHistory.length < 3) return baseLevel;
    
    const recentPerformance = performanceHistory.slice(-5); // 直近5問のパフォーマンス
    const accuracy = recentPerformance.filter(p => p.isCorrect).length / recentPerformance.length;
    const avgResponseTime = recentPerformance.reduce((sum, p) => sum + p.responseTime, 0) / recentPerformance.length;
    
    // 適応的調整ロジック
    let adjustment = 0;
    
    // 正確性に基づく調整（厳しめに設定）
    if (accuracy >= 0.9) {
      adjustment += 1; // 正解率90%以上で難易度アップ
    } else if (accuracy <= 0.6) {
      adjustment -= 1; // 正解率60%以下で難易度ダウン
    }
    
    // 回答時間に基づく調整（2秒以下で正解なら難易度アップ、8秒以上なら難易度ダウン）
    if (avgResponseTime <= 2000 && accuracy >= 0.8) {
      adjustment += 0.5;
    } else if (avgResponseTime >= 8000) {
      adjustment -= 0.5;
    }
    
    const newLevel = Math.max(1, Math.min(7, baseLevel + adjustment));
    return Math.round(newLevel);
  };

  // 単語の難易度スコアを計算
  const calculateWordDifficulty = (word) => {
    let difficulty = 0;
    
    // 単語の長さに基づく難易度
    difficulty += word.word.length * 0.1;
    
    // 意味の複雑さ（複数の意味がある場合）
    if (word.meaning && word.meaning.includes(';')) {
      difficulty += 0.5;
    }
    
    // 英検レベルに基づく難易度
    if (word.eikenLevels && Array.isArray(word.eikenLevels)) {
      const maxEikenLevel = Math.max(...word.eikenLevels.map(l => typeof l === 'string' ? 0 : l));
      difficulty += maxEikenLevel * 0.3;
    } else {
      difficulty += (word.level || 1) * 0.3;
    }
    
    return difficulty;
  };

  useEffect(() => {
    const setupStage = (level) => {
      // ステージ1は5問、それ以外は10問
      const currentQuestionsPerStage = stage === 1 ? QUESTIONS_STAGE_1 : QUESTIONS_PER_STAGE;
      
      // 適応的レベル調整を適用
      const effectiveLevel = adaptiveLevel;
      
      // 英検レベルに基づいてフィルタリング（範囲を広げてより多くの選択肢を確保）
      let filteredWords = allWords.filter(word => {
        // eikenLevelsフィールドがある場合はそれを使用
        if (word.eikenLevels && Array.isArray(word.eikenLevels)) {
          return word.eikenLevels.some(eikenLevel => 
            Math.abs(eikenLevel - effectiveLevel) <= 1
          );
        }
        // eikenLevelsがない場合は従来のlevelフィールドを使用
        return Math.abs(word.level - effectiveLevel) <= 1;
      });
      
      // 難易度スコアでソート（適応的調整に基づいて）
      filteredWords = filteredWords.sort((a, b) => {
        const diffA = Math.abs(calculateWordDifficulty(a) - effectiveLevel);
        const diffB = Math.abs(calculateWordDifficulty(b) - effectiveLevel);
        return diffA - diffB;
      });
      
      console.log(`実力テスト 適応レベル${effectiveLevel}の出題候補:`, {
        総単語数: allWords.length,
        フィルタ後単語数: filteredWords.length,
        適応レベル: effectiveLevel,
        サンプル単語: filteredWords.slice(0, 3).map(w => ({ 
          word: w.word, 
          level: w.level, 
          eikenLevels: w.eikenLevels,
          difficulty: calculateWordDifficulty(w)
        }))
      });
      
      if (filteredWords.length < currentQuestionsPerStage) {
        const needed = currentQuestionsPerStage - filteredWords.length;
        const nearbyWords = allWords.filter(word => {
          // eikenLevelsフィールドがある場合は隣接する英検レベルを探す
          if (word.eikenLevels && Array.isArray(word.eikenLevels)) {
            return word.eikenLevels.some(eikenLevel => 
              Math.abs(eikenLevel - effectiveLevel) <= 2
            );
          }
          // eikenLevelsがない場合は従来のlevelフィールドを使用
          return Math.abs(word.level - effectiveLevel) <= 2;
        });
        filteredWords.push(...shuffleArray(nearbyWords).slice(0, needed));
      }
      
      setCurrentQuestions(shuffleArray(filteredWords).slice(0, currentQuestionsPerStage));
      setQuestionIndex(0);
      setScore(0);
      setIsFlipped(false);
      setQuestionStartTime(Date.now());
      setResponseTimes([]);
      x.set(0);
    };
    if (allWords.length > 0) {
      setLoading(false);
      setupStage(adaptiveLevel);
    }
  }, [allWords, stage, adaptiveLevel, x]);

  // 音声合成の初期化
  useEffect(() => {
    initialize().catch(error => console.error("Speech initialization failed:", error));
  }, []);


  const handleDoubleClick = () => {
    setIsFlipped(prev => !prev);
    if (!isFlipped && currentQuestions.length > 0) {
      const wordToSpeak = currentQuestions[questionIndex].word;
      speak(wordToSpeak);
    }
  };

  const handleDragEnd = (event, info) => {
    if (Math.abs(info.offset.x) < 50) return;
    
    const currentWord = currentQuestions[questionIndex];
    const user = auth.currentUser;
    const isCorrect = info.offset.x > 0;
    
    // 回答時間を記録
    const responseTime = questionStartTime ? Date.now() - questionStartTime : 0;
    const performanceData = {
      wordId: currentWord?.id || currentWord?.word,
      responseTime: responseTime,
      isCorrect: isCorrect,
      level: adaptiveLevel,
      stage: stage,
      wordDifficulty: calculateWordDifficulty(currentWord),
      timestamp: Date.now()
    };
    
    const newResponseTimes = [...responseTimes, performanceData];
    setResponseTimes(newResponseTimes);
    
    // パフォーマンス履歴を更新（ステージ情報を含める）
    const stagePerformanceData = {
      ...performanceData,
      stage: stage,
      level: currentLevel,
      score: score + (isCorrect ? 1 : 0)
    };
    const newPerformanceHistory = [...performanceHistory, stagePerformanceData];
    setPerformanceHistory(newPerformanceHistory);
    
    // リアルタイム適応的調整（5問ごとに実行）
    if (newPerformanceHistory.length % 5 === 0) {
      const newAdaptiveLevel = calculateAdaptiveLevel(newPerformanceHistory, adaptiveLevel);
      if (newAdaptiveLevel !== adaptiveLevel) {
        console.log(`適応的調整: レベル${adaptiveLevel} → レベル${newAdaptiveLevel}`);
        setAdaptiveLevel(newAdaptiveLevel);
      }
    }
    
    // For incorrect answers, add the word to the user's review list.
    if (!isCorrect && user && currentWord) {
      updateUserWordProgress(user.uid, currentWord, false);
    }

    const newScore = score + (isCorrect ? 1 : 0);
    if (questionIndex < currentQuestions.length - 1) {
      setScore(newScore);
      setQuestionIndex(prev => prev + 1);
      setIsFlipped(false);
      setQuestionStartTime(Date.now()); // 次の問題の開始時間を設定
      x.set(0);
      y.set(0);
    } else {
      evaluateStage(newScore);
    }
  };

  // 新機能: 適応的難易度調整
  const adjustDifficultyBasedOnPerformance = (level, score, responseTimes, totalQuestions) => {
    const accuracy = score / totalQuestions;
    const avgResponseTime = responseTimes.length > 0 ? 
      responseTimes.reduce((sum, rt) => sum + rt.responseTime, 0) / responseTimes.length : 0;
    
    // 精度と回答時間に基づく調整
    let adjustment = 0;
    
    if (accuracy > 0.8 && avgResponseTime < 3000) {
      // 高精度かつ高速回答：難易度を上げる
      adjustment = 0.5;
    } else if (accuracy > 0.9 && avgResponseTime < 2000) {
      // 非常に高精度かつ非常に高速：大きく上げる
      adjustment = 1.0;
    } else if (accuracy < 0.4 && avgResponseTime > 5000) {
      // 低精度かつ低速回答：難易度を下げる
      adjustment = -0.5;
    } else if (accuracy < 0.3 && avgResponseTime > 8000) {
      // 非常に低精度かつ非常に低速：大きく下げる
      adjustment = -1.0;
    }
    
    return Math.max(1, Math.min(10, level + adjustment));
  };

  // 総合評価スコアを計算
  const calculateComprehensiveScore = (score, responseTimes, totalQuestions, level) => {
    const accuracy = score / totalQuestions;
    const avgResponseTime = responseTimes.length > 0 ? 
      responseTimes.reduce((sum, rt) => sum + rt.responseTime, 0) / responseTimes.length : 0;
    
    // 回答時間スコア（3秒以下で満点、10秒以上で0点）
    const timeScore = Math.max(0, Math.min(1, (10000 - avgResponseTime) / 7000));
    
    // 一貫性スコア（回答時間のばらつきが少ないほど高スコア）
    const responseTimeVariance = responseTimes.length > 1 ? 
      responseTimes.reduce((sum, rt) => sum + Math.pow(rt.responseTime - avgResponseTime, 2), 0) / responseTimes.length : 0;
    const consistencyScore = Math.max(0, 1 - (responseTimeVariance / 10000000));
    
    // 難易度適応スコア（適応レベルと実際のレベルが近いほど高スコア）
    const levelAdaptationScore = 1 - Math.abs(adaptiveLevel - level) / 7;
    
    // 総合スコア（重み付き平均）
    const comprehensiveScore = (
      accuracy * 0.4 +           // 正確性 40%
      timeScore * 0.3 +          // 速度 30%
      consistencyScore * 0.2 +   // 一貫性 20%
      levelAdaptationScore * 0.1 // 適応性 10%
    );
    
    return {
      comprehensiveScore,
      accuracy,
      timeScore,
      consistencyScore,
      levelAdaptationScore,
      avgResponseTime
    };
  };

  // 早期終了判定関数
  const shouldEarlyTerminate = (currentScore, currentStage, currentLevel, performanceHistory) => {
    
    // 初学者モードの特別な早期終了条件
    if (isBeginnerMode) {
      return shouldBeginnerEarlyTerminate(currentScore, currentStage, currentLevel, performanceHistory);
    }
    
    if (currentStage < 3) return false; // 通常モードでは最小3ステージは実行
    
    // 総質問数を正確に計算（ステージ1は5問、それ以外は10問）
    const totalQuestions = currentStage === 1 ? QUESTIONS_STAGE_1 : 
                          QUESTIONS_STAGE_1 + (currentStage - 1) * QUESTIONS_PER_STAGE;
    const accuracy = currentScore / totalQuestions;
    
    // 最近のパフォーマンス履歴を分析
    const recentHistory = performanceHistory.slice(-3); // 最近3ステージ
    if (recentHistory.length < 2) return false;
    
    // 一貫性チェック: 最近のステージで一貫した結果があるか
    const consistentResults = recentHistory.filter(perf => {
      const stageQuestions = perf.stage === 1 ? QUESTIONS_STAGE_1 : QUESTIONS_PER_STAGE;
      const stageAccuracy = perf.score / stageQuestions;
      return Math.abs(stageAccuracy - accuracy) < 0.2; // 20%以内の変動
    });
    
    // 信頼度チェック: 十分なデータがあるか
    const hasEnoughData = totalQuestions >= 15; // 最低15問
    
    // 明確なレベル判定ができるか
    const clearLevelIndication = (
      (accuracy >= 0.8 && currentLevel >= 6) || // 高レベルで高精度
      (accuracy <= 0.4 && currentLevel <= 3) || // 低レベルで低精度
      (accuracy >= 0.6 && accuracy <= 0.7) // 中程度の精度
    );
    
    // 連続一貫結果のカウント
    if (consistentResults.length >= 2) {
      setConsecutiveConsistentResults(prev => prev + 1);
    } else {
      setConsecutiveConsistentResults(0);
    }
    
    // 早期終了条件
    const shouldTerminate = (
      hasEnoughData && 
      clearLevelIndication && 
      consecutiveConsistentResults >= 2 && // 連続2回一貫
      (stage >= 4 || (accuracy >= 0.9 || accuracy <= 0.3)) // 明確な結果
    );
    
    console.log('🔍 早期終了判定:', {
      currentScore,
      currentStage,
      currentLevel,
      accuracy: accuracy.toFixed(2),
      hasEnoughData,
      clearLevelIndication,
      consecutiveConsistentResults,
      shouldTerminate,
      recentHistory: recentHistory.length
    });
    
    return shouldTerminate;
  };

  // 初学者モード専用の早期終了判定関数
  const shouldBeginnerEarlyTerminate = (currentScore, currentStage, currentLevel, performanceHistory) => {
    // 初学者モードでは最小2ステージ（約15問）で早期終了可能
    if (currentStage < 2) return false;
    
    // 総質問数を正確に計算（ステージ1は5問、それ以外は10問）
    const totalQuestions = currentStage === 1 ? QUESTIONS_STAGE_1 : 
                          QUESTIONS_STAGE_1 + (currentStage - 1) * QUESTIONS_PER_STAGE;
    const accuracy = currentScore / totalQuestions;
    
    console.log('🎓 初学者モード早期終了判定:', {
      currentScore,
      currentStage,
      currentLevel,
      accuracy: accuracy.toFixed(2),
      totalQuestions
    });
    
    // 初学者モードの早期終了条件
    const beginnerConditions = {
      // 明確に低いレベル（英検5級以下）
      veryLowLevel: currentLevel <= 5 && accuracy <= 0.3 && totalQuestions >= 15,
      
      // 明確に適切なレベル（英検4級程度）
      appropriateLevel: currentLevel === 4 && accuracy >= 0.6 && accuracy <= 0.8 && totalQuestions >= 15,
      
      // 高精度で安定している
      stableHighAccuracy: accuracy >= 0.8 && currentStage >= 3,
      
      // 低精度で安定している（初学者の特徴）
      stableLowAccuracy: accuracy <= 0.4 && currentStage >= 2 && totalQuestions >= 15,
      
      // 英検5級で合格レベル
      grade5Pass: currentLevel === 5 && accuracy >= 0.6 && totalQuestions >= 15
    };
    
    const shouldTerminate = (
      beginnerConditions.veryLowLevel ||
      beginnerConditions.appropriateLevel ||
      beginnerConditions.stableHighAccuracy ||
      beginnerConditions.stableLowAccuracy ||
      beginnerConditions.grade5Pass
    );
    
    console.log('🎓 初学者モード判定結果:', {
      conditions: beginnerConditions,
      shouldTerminate
    });
    
    return shouldTerminate;
  };

  const evaluateStage = (finalScore) => {
    let nextLevel = currentLevel;
    
    // 早期終了判定
    if (shouldEarlyTerminate(finalScore, stage, currentLevel, performanceHistory)) {
      console.log('🚀 早期終了判定: テストを終了します');
      
      // 初学者モードの場合は適切なレベルを設定
      let finalLevel = currentLevel;
      if (isBeginnerMode) {
        const totalQuestions = stage === 1 ? QUESTIONS_STAGE_1 : 
                              QUESTIONS_STAGE_1 + (stage - 1) * QUESTIONS_PER_STAGE;
        const accuracy = finalScore / totalQuestions;
        
        if (accuracy >= 0.8) {
          // 高精度の場合は現在のレベルを維持
          finalLevel = currentLevel;
        } else if (accuracy >= 0.6) {
          // 中程度の精度の場合は現在のレベルまたは1つ下
          finalLevel = Math.max(1, currentLevel);
        } else {
          // 低精度の場合は1-2つ下のレベル
          finalLevel = Math.max(1, currentLevel - 1);
        }
        
        console.log('🎓 初学者モード最終レベル判定:', {
          accuracy: accuracy.toFixed(2),
          originalLevel: currentLevel,
          finalLevel
        });
      }
      
      finishTestAndSave(finalLevel);
      return;
    }
    
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
    
    // 総合評価スコアを計算
    const evaluation = calculateComprehensiveScore(finalScore, responseTimes, totalQuestions, adaptiveLevel);
    
    // 適応的閾値調整（パフォーマンス履歴に基づく）
    let passThreshold, failThreshold;
    const basePassRate = 0.7;
    const baseFailRate = 0.3;
    
    // 適応的調整：過去のパフォーマンスに基づいて閾値を調整
    if (performanceHistory.length >= 10) {
      const recentAccuracy = performanceHistory.slice(-10)
        .filter(p => p.isCorrect).length / 10;
      
      if (recentAccuracy > 0.8) {
        // 高パフォーマンス：閾値を上げる
        passThreshold = Math.ceil(totalQuestions * (basePassRate + 0.1));
        failThreshold = Math.floor(totalQuestions * (baseFailRate - 0.05));
      } else if (recentAccuracy < 0.5) {
        // 低パフォーマンス：閾値を下げる
        passThreshold = Math.ceil(totalQuestions * (basePassRate - 0.1));
        failThreshold = Math.floor(totalQuestions * (baseFailRate + 0.05));
      } else {
        // 標準パフォーマンス
        passThreshold = Math.ceil(totalQuestions * basePassRate);
        failThreshold = Math.floor(totalQuestions * baseFailRate);
      }
    } else {
      // 初期段階：標準閾値
      passThreshold = Math.ceil(totalQuestions * basePassRate);
      failThreshold = Math.floor(totalQuestions * baseFailRate);
    }
    
    console.log(`ステージ評価:`, {
      スコア: finalScore,
      総合評価: evaluation.comprehensiveScore,
      正確性: evaluation.accuracy,
      速度スコア: evaluation.timeScore,
      一貫性スコア: evaluation.consistencyScore,
      適応スコア: evaluation.levelAdaptationScore,
      平均回答時間: evaluation.avgResponseTime,
      合格閾値: passThreshold,
      不合格閾値: failThreshold
    });
    
    // 初学者モードの特別処理
    if (isBeginnerMode) {
      if (finalScore >= passThreshold) {
        // 合格：レベルアップ（最大レベル7：英検準1級）
        nextLevel = Math.min(7, currentLevel + 1);
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
        
        // 新機能: 適応的調整を適用
        const adaptiveLevel = adjustDifficultyBasedOnPerformance(currentLevel, finalScore, responseTimes, totalQuestions);
        
        // 上位層（レベル6以上）では連続成功が必要
        if (currentLevel >= 6) {
          setConsecutiveSuccesses(prev => prev + 1);
          // レベル6-7: 2回連続成功でレベルアップ
          const requiredSuccesses = 2;
          if (consecutiveSuccesses + 1 >= requiredSuccesses) {
            // 適応的調整を考慮したレベルアップ（最大レベル7：英検準1級）
            nextLevel = Math.min(7, Math.max(adaptiveLevel, currentLevel + 1));
            setConsecutiveSuccesses(0); // レベルアップ時は連続成功をリセット
          } else {
            nextLevel = Math.max(currentLevel, adaptiveLevel); // レベル維持または適応的調整
          }
        } else {
          // 下位層・中位層は適応的調整を適用（最大レベル7：英検準1級）
          nextLevel = Math.min(7, Math.max(adaptiveLevel, currentLevel + 1));
          setConsecutiveSuccesses(0);
        }
      } else if (finalScore <= failThreshold) {
        // 新機能: 適応的調整を適用（失敗時）
        const adaptiveLevel = adjustDifficultyBasedOnPerformance(currentLevel, finalScore, responseTimes, totalQuestions);
        nextLevel = Math.max(1, Math.min(adaptiveLevel, currentLevel - 1));
        setConsecutiveFailures(prev => prev + 1); // 失敗時は連続失敗をカウント
        setConsecutiveSuccesses(0); // 失敗時は連続成功をリセット
      } else {
        // 新機能: 維持時も適応的調整を適用
        const adaptiveLevel = adjustDifficultyBasedOnPerformance(currentLevel, finalScore, responseTimes, totalQuestions);
        nextLevel = adaptiveLevel;
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
        const userUpdateData = {
          level: finalUserLevel,
          'progress.currentVocabulary': estimatedVocabulary,
          'progress.lastCheckedAt': serverTimestamp(),
        };
        
        console.log('👤 ユーザーデータ更新:', userUpdateData);
        await updateDoc(userDocRef, userUpdateData, { merge: true });

        // 総合評価を計算
        const finalEvaluation = calculateComprehensiveScore(
          responseTimes.filter(rt => rt.isCorrect).length,
          responseTimes,
          responseTimes.length,
          finalUserLevel
        );

        // Log the placement test result as a single session event
        const logData = {
          sessionType: 'placement_test',
          finalLevel: finalUserLevel,
          estimatedVocabulary: estimatedVocabulary,
          responseTimes: responseTimes, // 回答時間データを追加
          averageResponseTime: responseTimes.length > 0 ? 
            responseTimes.reduce((sum, rt) => sum + rt.responseTime, 0) / responseTimes.length : 0,
          timestamp: new Date(),
          // 詳細分析データを追加
          comprehensiveScore: finalEvaluation.comprehensiveScore,
          accuracy: finalEvaluation.accuracy,
          timeScore: finalEvaluation.timeScore,
          consistencyScore: finalEvaluation.consistencyScore,
          levelAdaptationScore: finalEvaluation.levelAdaptationScore,
          avgResponseTime: finalEvaluation.avgResponseTime,
          adaptiveLevel: adaptiveLevel,
          performanceHistory: performanceHistory
        };
        
        console.log('💾 テスト結果保存:', logData);
        await logStudySession(user.uid, logData);

        // ★進捗率を更新
        await updateProgressPercentage(user.uid);
        
        if (onTestComplete) {
          onTestComplete(finalUserLevel, responseTimes);
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


  const handlePrevQuestion = () => {
    if (questionIndex === 0) return;
    setQuestionIndex(prev => Math.max(0, prev - 1));
    setIsFlipped(false);
    setQuestionStartTime(Date.now()); // 前の問題に戻る際も時間をリセット
    x.set(0);
    y.set(0);
  };

  if (loading || currentQuestions.length === 0) {
    return <div className="loading-container"><p>テスト問題を準備中...</p></div>;
  }

  const currentWord = currentQuestions[questionIndex];

  return (
    <>
      <div className="test-header">
        <h3>単語力チェックテスト (ステージ {stage} / 10)</h3>
        <div style={{ marginBottom: '10px' }}>
          <p style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: '0.9rem' }}>
            適応レベル: {adaptiveLevel} | 現在レベル: {currentLevel}
            {adaptiveLevel !== currentLevel && (
              <span style={{ color: '#10b981', marginLeft: '10px' }}>
                (適応調整中)
              </span>
            )}
          </p>
          {stage >= 3 && (
            <p style={{ color: '#8b5cf6', fontSize: '0.8rem' }}>
              早期終了機能: 一貫した結果が続けば自動終了
              {consecutiveConsistentResults > 0 && (
                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                  (一貫性: {consecutiveConsistentResults}回)
                </span>
              )}
            </p>
          )}
        </div>
        {isBeginnerMode && (
          <div>
            <p style={{ color: '#f59e0b', fontWeight: 'bold' }}>
              初学者モード: 英検{currentLevel === 5 ? '5級' : currentLevel === 4 ? '4級' : `${currentLevel}級`}レベル
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
              {currentLevel === 5 ? '5級で合格すればテスト終了' : '4級で失敗すれば5級に、5級で失敗すればテスト終了'}
            </p>
            {stage >= 2 && (
              <p style={{ color: '#10b981', fontSize: '0.8rem' }}>
                🎓 初学者早期終了: 明確なレベル判定ができれば自動終了（最小15問）
              </p>
            )}
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
        <p>カードをダブルタップして答えを確認</p>
        <p>わかる→右へスワイプ / わからない→左へスワイプ</p>
      </div>

      <div id="flashcard-container">
        <motion.div
          key={questionIndex}
          id="flashcard"
          drag="x"
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          style={{ x, y, rotate, backgroundColor: cardColor }}
          onDragEnd={handleDragEnd}
          onDoubleClick={handleDoubleClick}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="card-face card-front" style={{ backgroundColor: 'transparent' }}>
            <p id="card-front-text">{currentWord?.word}</p>
          </div>
          <div className="card-face card-back" style={{ backgroundColor: 'transparent' }}>
            <h3 id="card-back-word">{currentWord?.word}</h3>
            <p id="card-back-meaning">{currentWord?.meaning || currentWord?.japanese}</p>
            {(currentWord?.example || currentWord?.exampleJa) && <hr />}
            <p className="example-text">{currentWord?.example}</p>
            <p className="example-text-ja">{currentWord?.exampleJa}</p>
          </div>
        </motion.div>
      </div>

      {/* プログレスバー */}
      <div style={{ 
        margin: '20px auto', 
        maxWidth: '90vw',
        padding: '0 20px'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '10px'
        }}>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>
            {questionIndex + 1} / {currentQuestions.length}
          </span>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>
            ステージ {stage} / 10
          </span>
        </div>
        <div style={{
          width: '100%',
          height: '6px',
          backgroundColor: '#e5e7eb',
          borderRadius: '3px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${((questionIndex + 1) / currentQuestions.length) * 100}%`,
            height: '100%',
            backgroundColor: '#3b82f6',
            transition: 'width 0.3s ease'
          }} />
        </div>
        
        {/* 新機能: 詳細進捗情報 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginTop: '8px',
          fontSize: '0.8rem',
          color: '#6b7280'
        }}>
          <span>
            推定精度: {responseTimes.length > 0 ? 
              Math.round((responseTimes.filter(rt => rt.isCorrect).length / responseTimes.length) * 100) : 0}%
          </span>
          <span>
            平均回答時間: {responseTimes.length > 0 ? 
              Math.round(responseTimes.reduce((sum, rt) => sum + rt.responseTime, 0) / responseTimes.length / 1000) : 0}秒
          </span>
          <span>
            残り時間: 約{Math.max(0, Math.round((currentQuestions.length - questionIndex - 1) * 
              (responseTimes.length > 0 ? responseTimes.reduce((sum, rt) => sum + rt.responseTime, 0) / responseTimes.length / 1000 : 5)))}分
          </span>
        </div>
      </div>

      {/* ナビゲーションボタン */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '0 20px',
        marginTop: '20px',
        gap: '15px'
      }}>
        <button 
          onClick={handlePrevQuestion} 
          disabled={questionIndex === 0}
          style={{
            flex: 1,
            padding: '12px 16px',
            backgroundColor: questionIndex === 0 ? '#f3f4f6' : '#6b7280',
            color: questionIndex === 0 ? '#9ca3af' : 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: '500',
            cursor: questionIndex === 0 ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
          onMouseOver={(e) => {
            if (questionIndex > 0) {
              e.target.style.backgroundColor = '#4b5563';
            }
          }}
          onMouseOut={(e) => {
            if (questionIndex > 0) {
              e.target.style.backgroundColor = '#6b7280';
            }
          }}
        >
          <FaUndo /> 前の問題
        </button>
        
        <button 
          onClick={async () => {
            console.log('VocabularyCheckTest: 前の画面に戻るボタンがクリックされました');
            // テストを中断する前に、現在の進捗を保存
            if (stage > 1 || questionIndex > 0) {
              console.log('📊 テスト中断: 現在の進捗を保存します');
              await finishTestAndSave(currentLevel);
            }
            window.location.replace('/student-dashboard');
          }}
          style={{
            flex: 1,
            padding: '12px 16px',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.9rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = '#b91c1c';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = '#dc2626';
          }}
        >
          <FaArrowLeft /> 前の画面に戻る
        </button>
      </div>
      
      {/* スワイプ説明 */}
      <div style={{ 
        textAlign: 'center', 
        marginTop: '20px',
        padding: '0 20px'
      }}>
        <p style={{ 
          color: '#6b7280', 
          fontSize: '0.9rem',
          margin: 0
        }}>
          カードをダブルタップして答えを確認
        </p>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          gap: '20px',
          marginTop: '10px'
        }}>
          <span style={{ 
            color: '#dc2626', 
            fontSize: '0.9rem',
            fontWeight: '500'
          }}>
            ← わからない
          </span>
          <span style={{ 
            color: '#059669', 
            fontSize: '0.9rem',
            fontWeight: '500'
          }}>
            わかる →
          </span>
        </div>
      </div>
    </>
  );
}