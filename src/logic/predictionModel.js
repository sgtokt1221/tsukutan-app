import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// シンプルな予測モデル機能
export const predictPerformance = async (userId) => {
  try {
    // ユーザーの学習ログを取得（インデックス作成中は簡素化）
    const logsRef = collection(db, 'users', userId, 'logs');
    
    // インデックス問題を回避するため、orderByを使わずに取得してクライアント側でソート
    const logsSnapshot = await getDocs(logsRef);
    const allLogs = logsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const timestampA = a.timestamp?.toDate?.() || new Date(a.timestamp);
        const timestampB = b.timestamp?.toDate?.() || new Date(b.timestamp);
        return timestampB - timestampA; // 降順ソート
      })
      .slice(0, 30); // 最新30件に制限
    
    // クライアント側でplacement_testのみをフィルタリング
    const logs = allLogs.filter(log => log.sessionType === 'placement_test');
    
    if (logs.length < 2) {
      return {
        hasData: false,
        message: '予測に十分なデータがありません（最低2回のテストが必要）'
      };
    }
    
    // データを時系列で並び替え（古い順）
    const sortedLogs = logs.reverse();
    
    // 予測計算
    const predictions = {
      hasData: true,
      nextWeekLevel: predictNextWeekLevel(sortedLogs),
      learningCurve: calculateLearningCurve(sortedLogs),
      confidence: calculatePredictionConfidence(sortedLogs),
      recommendations: generatePredictiveRecommendations(sortedLogs)
    };
    
    return predictions;
  } catch (error) {
    console.error('Failed to predict performance:', error);
    return {
      hasData: false,
      error: '予測の計算に失敗しました'
    };
  }
};

// 次の週のレベル予測
const predictNextWeekLevel = (logs) => {
  if (logs.length < 2) return logs[0]?.finalLevel || logs[0]?.level || logs[0]?.testResultLevel || 0;
  
  // 線形回帰による予測
  const levels = logs.map(log => log.finalLevel || log.level || log.testResultLevel || 0);
  const dates = logs.map(log => {
    const date = log.timestamp?.toDate?.() || new Date(log.timestamp);
    return date.getTime();
  });
  
  // 最小二乗法で傾きを計算
  const n = levels.length;
  const sumX = dates.reduce((sum, date) => sum + date, 0);
  const sumY = levels.reduce((sum, level) => sum + level, 0);
  const sumXY = dates.reduce((sum, date, index) => sum + (date * levels[index]), 0);
  const sumXX = dates.reduce((sum, date) => sum + (date * date), 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // 1週間後の予測
  const oneWeekLater = Date.now() + (7 * 24 * 60 * 60 * 1000);
  const predictedLevel = slope * oneWeekLater + intercept;
  
  return Math.max(1, Math.min(10, Math.round(predictedLevel * 10) / 10));
};

// 学習曲線の計算
const calculateLearningCurve = (logs) => {
  const curve = logs.map((log, index) => {
    const date = log.timestamp?.toDate?.() || new Date(log.timestamp);
    const level = log.finalLevel || 0;
    const vocabulary = log.estimatedVocabulary || 0;
    
    // 回答時間データがある場合は精度も計算
    let accuracy = 0;
    if (log.responseTimes && Array.isArray(log.responseTimes)) {
      const correctAnswers = log.responseTimes.filter(rt => rt.isCorrect).length;
      accuracy = log.responseTimes.length > 0 ? (correctAnswers / log.responseTimes.length) * 100 : 0;
    }
    
    return {
      date: date,
      level: level,
      vocabulary: vocabulary,
      accuracy: accuracy,
      sessionNumber: index + 1
    };
  });
  
  return curve;
};

// 予測の信頼度計算
const calculatePredictionConfidence = (logs) => {
  if (logs.length < 3) return 0.3; // データが少ない場合は低い信頼度
  
  // レベル変動の安定性を計算
  const levels = logs.map(log => log.finalLevel || log.level || log.testResultLevel || 0);
  const levelChanges = [];
  
  for (let i = 1; i < levels.length; i++) {
    levelChanges.push(Math.abs(levels[i] - levels[i-1]));
  }
  
  const averageChange = levelChanges.reduce((sum, change) => sum + change, 0) / levelChanges.length;
  const variance = levelChanges.reduce((sum, change) => sum + Math.pow(change - averageChange, 2), 0) / levelChanges.length;
  const stability = Math.max(0, 1 - (variance / 10)); // 変動が少ないほど高い信頼度
  
  // データ量による信頼度調整
  const dataConfidence = Math.min(1, logs.length / 10); // 10回以上で最大信頼度
  
  return Math.round((stability * dataConfidence) * 100) / 100;
};

// 予測に基づく推奨事項生成
const generatePredictiveRecommendations = (logs) => {
  const recommendations = [];
  
  if (logs.length < 2) {
    return [{ type: 'info', message: 'より正確な予測のため、継続的にテストを受けてください' }];
  }
  
  const latestLog = logs[logs.length - 1];
  const previousLog = logs[logs.length - 2];
  const latestLevel = latestLog.finalLevel || latestLog.level || latestLog.testResultLevel || 0;
  const previousLevel = previousLog.finalLevel || previousLog.level || previousLog.testResultLevel || 0;
  const levelChange = latestLevel - previousLevel;
  
  // レベル変化に基づく推奨
  if (levelChange > 0) {
    recommendations.push({
      type: 'improvement',
      message: `レベルが${levelChange}上昇しました！この調子で学習を続けましょう。`,
      priority: 'medium'
    });
  } else if (levelChange < 0) {
    recommendations.push({
      type: 'decline',
      message: `レベルが${Math.abs(levelChange)}下がりました。復習を重点的に行いましょう。`,
      priority: 'high'
    });
  } else {
    recommendations.push({
      type: 'stable',
      message: 'レベルが安定しています。新しい単語に挑戦してみましょう。',
      priority: 'low'
    });
  }
  
  // 学習頻度の分析
  const recentLogs = logs.slice(-5); // 最近の5回
  const timeIntervals = [];
  
  for (let i = 1; i < recentLogs.length; i++) {
    const current = recentLogs[i].timestamp?.toDate?.() || new Date(recentLogs[i].timestamp);
    const previous = recentLogs[i-1].timestamp?.toDate?.() || new Date(recentLogs[i-1].timestamp);
    const interval = Math.abs(current - previous) / (1000 * 60 * 60 * 24); // 日数
    timeIntervals.push(interval);
  }
  
  if (timeIntervals.length > 0) {
    const averageInterval = timeIntervals.reduce((sum, interval) => sum + interval, 0) / timeIntervals.length;
    
    if (averageInterval > 7) {
      recommendations.push({
        type: 'frequency',
        message: '学習間隔が空きすぎています。週に2-3回はテストを受けて学習を継続しましょう。',
        priority: 'high'
      });
    } else if (averageInterval < 2) {
      recommendations.push({
        type: 'overload',
        message: '学習頻度が高すぎる可能性があります。適度な間隔で学習しましょう。',
        priority: 'medium'
      });
    }
  }
  
  // 回答時間の分析
  const responseTimes = logs
    .filter(log => log.responseTimes && Array.isArray(log.responseTimes))
    .flatMap(log => log.responseTimes.map(rt => rt.responseTime));
  
  if (responseTimes.length > 0) {
    const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    
    if (avgResponseTime > 8000) { // 8秒以上
      recommendations.push({
        type: 'speed',
        message: '回答時間が長めです。単語の理解を深めて、より素早く答えられるように練習しましょう。',
        priority: 'medium'
      });
    }
  }
  
  return recommendations;
};

// 学習目標の設定
export const setLearningGoal = (userId, targetLevel, targetDate) => {
  // 現在のレベルと目標レベルから必要な学習量を計算
  const currentLevel = 5; // 仮の値、実際はユーザーデータから取得
  const levelDifference = targetLevel - currentLevel;
  
  // 1レベル上昇に必要な時間を推定（経験値）
  const hoursPerLevel = 20; // 1レベル上昇に約20時間の学習が必要と仮定
  const totalHoursNeeded = levelDifference * hoursPerLevel;
  
  // 目標日までの日数
  const daysUntilTarget = Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24));
  
  // 1日あたりの学習時間
  const dailyHours = totalHoursNeeded / daysUntilTarget;
  
  return {
    targetLevel,
    targetDate,
    currentLevel,
    totalHoursNeeded,
    dailyHours: Math.round(dailyHours * 10) / 10,
    feasibility: dailyHours > 3 ? 'challenging' : dailyHours > 1.5 ? 'moderate' : 'achievable'
  };
};
