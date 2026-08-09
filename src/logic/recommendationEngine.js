import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// 学習推奨システム
export const generateSmartRecommendations = async (userId) => {
  try {
    // ユーザーの学習データを取得（インデックス問題を回避）
    const logsRef = collection(db, 'users', userId, 'logs');
    
    // インデックス問題を回避するため、全データを取得してクライアント側でフィルタリング
    const logsSnapshot = await getDocs(logsRef);
    const allLogs = logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // クライアント側でplacement_testのみをフィルタリング
    const logs = allLogs
      .filter(log => log.sessionType === 'placement_test')
      .sort((a, b) => {
        const timestampA = a.timestamp?.toDate?.() || new Date(a.timestamp);
        const timestampB = b.timestamp?.toDate?.() || new Date(b.timestamp);
        return timestampB - timestampA; // 降順ソート
      })
      .slice(0, 10); // 最新10件に制限
    
    if (logs.length === 0) {
      return {
        hasData: false,
        recommendations: [{
          type: 'initial',
          priority: 'high',
          title: '初回テストの実施',
          description: 'まずは単語力チェックテストを受けて、現在のレベルを把握しましょう。',
          action: 'start_test',
          estimatedTime: '15分'
        }]
      };
    }
    
    const latestLog = logs[0];
    const currentLevel = latestLog.finalLevel || 0;
    
    // 複数の推奨システムを統合
    const recommendations = [
      ...generateLevelBasedRecommendations(currentLevel),
      ...generatePerformanceBasedRecommendations(logs),
      ...generateScheduleRecommendations(logs),
      ...generateFocusWordRecommendations(logs),
      ...generateNextTestRecommendations(logs)
    ];
    
    // 優先度順にソート
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    recommendations.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    
    return {
      hasData: true,
      currentLevel,
      recommendations: recommendations.slice(0, 5) // 上位5つを返す
    };
  } catch (error) {
    console.error('Failed to generate recommendations:', error);
    return {
      hasData: false,
      error: '推奨の生成に失敗しました'
    };
  }
};

// レベルベースの推奨
const generateLevelBasedRecommendations = (currentLevel) => {
  const recommendations = [];
  
  if (currentLevel <= 2) {
    recommendations.push({
      type: 'basic_foundation',
      priority: 'high',
      title: '基礎単語の徹底学習',
      description: '中学レベルの基礎単語をしっかりと覚えましょう。毎日少しずつでも継続することが大切です。',
      action: 'study_basic_words',
      estimatedTime: '20分/日',
      targetLevel: '3'
    });
  } else if (currentLevel <= 5) {
    recommendations.push({
      type: 'intermediate_building',
      priority: 'medium',
      title: '中級単語への挑戦',
      description: '高校レベルの単語に挑戦しましょう。復習も忘れずに行ってください。',
      action: 'study_intermediate_words',
      estimatedTime: '25分/日',
      targetLevel: '6'
    });
  } else if (currentLevel <= 8) {
    recommendations.push({
      type: 'advanced_mastery',
      priority: 'medium',
      title: '上級単語のマスター',
      description: '大学レベルの単語をマスターしましょう。実用的な文章での使用も心がけてください。',
      action: 'study_advanced_words',
      estimatedTime: '30分/日',
      targetLevel: '9'
    });
  } else {
    recommendations.push({
      type: 'native_level',
      priority: 'low',
      title: 'ネイティブレベルへの挑戦',
      description: 'ネイティブレベルの単語に挑戦しましょう。専門的な分野の単語も学習してください。',
      action: 'study_native_words',
      estimatedTime: '35分/日',
      targetLevel: '10'
    });
  }
  
  return recommendations;
};

// パフォーマンスベースの推奨
const generatePerformanceBasedRecommendations = (logs) => {
  const recommendations = [];
  
  // 最新のテストデータを分析
  const latestLog = logs[0];
  const responseTimes = latestLog.responseTimes || [];
  
  if (responseTimes.length > 0) {
    const avgResponseTime = responseTimes.reduce((sum, rt) => sum + rt.responseTime, 0) / responseTimes.length;
    const accuracy = (responseTimes.filter(rt => rt.isCorrect).length / responseTimes.length) * 100;
    
    // 回答時間が長い場合
    if (avgResponseTime > 6000) { // 6秒以上
      recommendations.push({
        type: 'speed_improvement',
        priority: 'medium',
        title: '回答速度の向上',
        description: '回答時間が長めです。単語の理解を深めて、より素早く答えられるように練習しましょう。',
        action: 'practice_speed',
        estimatedTime: '15分/日',
        targetMetric: '5秒以下'
      });
    }
    
    // 精度が低い場合
    if (accuracy < 70) {
      recommendations.push({
        type: 'accuracy_improvement',
        priority: 'high',
        title: '正答率の向上',
        description: '正答率が低めです。苦手な単語を重点的に復習しましょう。',
        action: 'review_weak_words',
        estimatedTime: '20分/日',
        targetMetric: '80%以上'
      });
    }
  }
  
  // レベル変動の分析
  if (logs.length >= 2) {
    const levelChange = logs[0].finalLevel - logs[1].finalLevel;
    
    if (levelChange < 0) {
      recommendations.push({
        type: 'level_recovery',
        priority: 'high',
        title: 'レベル回復のための復習',
        description: 'レベルが下がりました。基礎に戻って復習を行いましょう。',
        action: 'intensive_review',
        estimatedTime: '30分/日',
        targetLevel: '前回レベルまで回復'
      });
    }
  }
  
  return recommendations;
};

// スケジュールベースの推奨
const generateScheduleRecommendations = (logs) => {
  const recommendations = [];
  
  // 学習頻度の分析
  const recentLogs = logs.slice(0, 5);
  const timeIntervals = [];
  
  for (let i = 1; i < recentLogs.length; i++) {
    const current = recentLogs[i-1].timestamp?.toDate?.() || new Date(recentLogs[i-1].timestamp);
    const previous = recentLogs[i].timestamp?.toDate?.() || new Date(recentLogs[i].timestamp);
    const interval = Math.abs(current - previous) / (1000 * 60 * 60 * 24); // 日数
    timeIntervals.push(interval);
  }
  
  if (timeIntervals.length > 0) {
    const averageInterval = timeIntervals.reduce((sum, interval) => sum + interval, 0) / timeIntervals.length;
    
    if (averageInterval > 7) {
      recommendations.push({
        type: 'schedule_consistency',
        priority: 'high',
        title: '学習スケジュールの安定化',
        description: '学習間隔が空きすぎています。週に2-3回はテストを受けて学習を継続しましょう。',
        action: 'schedule_regular_study',
        estimatedTime: '週3回',
        targetInterval: '2-3日間隔'
      });
    } else if (averageInterval < 1) {
      recommendations.push({
        type: 'schedule_balance',
        priority: 'medium',
        title: '学習バランスの調整',
        description: '学習頻度が高すぎる可能性があります。適度な間隔で学習しましょう。',
        action: 'adjust_schedule',
        estimatedTime: '週2-3回',
        targetInterval: '2-3日間隔'
      });
    }
  }
  
  return recommendations;
};

// 重点単語の推奨
const generateFocusWordRecommendations = (logs) => {
  const recommendations = [];
  
  // 苦手な単語レベルを特定
  const allResponseTimes = logs
    .filter(log => log.responseTimes && Array.isArray(log.responseTimes))
    .flatMap(log => log.responseTimes);
  
  if (allResponseTimes.length > 0) {
    const levelPerformance = {};
    
    allResponseTimes.forEach(rt => {
      const level = rt.level || 'unknown';
      if (!levelPerformance[level]) {
        levelPerformance[level] = { correct: 0, total: 0 };
      }
      levelPerformance[level].total++;
      if (rt.isCorrect) {
        levelPerformance[level].correct++;
      }
    });
    
    // 正答率が低いレベルを特定
    const weakLevels = Object.entries(levelPerformance)
      .map(([level, data]) => ({
        level: parseInt(level),
        accuracy: (data.correct / data.total) * 100,
        totalQuestions: data.total
      }))
      .filter(item => item.accuracy < 70 && item.totalQuestions >= 3)
      .sort((a, b) => a.accuracy - b.accuracy);
    
    if (weakLevels.length > 0) {
      const weakestLevel = weakLevels[0];
      recommendations.push({
        type: 'focus_level',
        priority: 'high',
        title: `レベル${weakestLevel.level}の重点学習`,
        description: `レベル${weakestLevel.level}の正答率が${Math.round(weakestLevel.accuracy)}%です。このレベルの復習を重点的に行いましょう。`,
        action: 'focus_level_study',
        estimatedTime: '25分/日',
        targetLevel: weakestLevel.level,
        targetMetric: '80%以上'
      });
    }
  }
  
  return recommendations;
};

// 次回テストの推奨
const generateNextTestRecommendations = (logs) => {
  const recommendations = [];
  
  const latestLog = logs[0];
  const lastTestDate = latestLog.timestamp?.toDate?.() || new Date(latestLog.timestamp);
  const daysSinceLastTest = Math.floor((Date.now() - lastTestDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysSinceLastTest >= 3) {
    recommendations.push({
      type: 'next_test',
      priority: 'medium',
      title: '次回テストの実施',
      description: `前回のテストから${daysSinceLastTest}日経過しています。学習の成果を確認するためにテストを受けてみましょう。`,
      action: 'take_test',
      estimatedTime: '15分',
      urgency: daysSinceLastTest > 7 ? 'high' : 'medium'
    });
  }
  
  return recommendations;
};

// 学習目標の設定支援
export const suggestLearningGoals = (userId, currentLevel) => {
  const goals = [];
  
  // 短期目標（1ヶ月）
  if (currentLevel < 10) {
    goals.push({
      period: 'short',
      targetLevel: Math.min(10, currentLevel + 1),
      timeframe: '1ヶ月',
      description: `${currentLevel}から${Math.min(10, currentLevel + 1)}へのレベルアップ`,
      difficulty: currentLevel < 5 ? 'easy' : currentLevel < 8 ? 'moderate' : 'challenging',
      estimatedHours: currentLevel < 5 ? 15 : currentLevel < 8 ? 25 : 35
    });
  }
  
  // 中期目標（3ヶ月）
  if (currentLevel < 8) {
    goals.push({
      period: 'medium',
      targetLevel: Math.min(10, currentLevel + 2),
      timeframe: '3ヶ月',
      description: `${currentLevel}から${Math.min(10, currentLevel + 2)}へのレベルアップ`,
      difficulty: currentLevel < 3 ? 'moderate' : 'challenging',
      estimatedHours: currentLevel < 3 ? 40 : 60
    });
  }
  
  // 長期目標（6ヶ月）
  if (currentLevel < 6) {
    goals.push({
      period: 'long',
      targetLevel: Math.min(10, currentLevel + 3),
      timeframe: '6ヶ月',
      description: `${currentLevel}から${Math.min(10, currentLevel + 3)}へのレベルアップ`,
      difficulty: 'challenging',
      estimatedHours: 80
    });
  }
  
  return goals;
};
