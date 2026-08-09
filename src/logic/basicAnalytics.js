import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// 基本的な学習データ分析機能
export const analyzeUserPerformance = async (userId) => {
  try {
    // ユーザーの学習ログを取得（インデックス作成中は簡素化）
    const logsRef = collection(db, 'users', userId, 'logs');
    
    // インデックス問題を回避するため、orderByを使わずに取得してクライアント側でソート
    // キャッシュを無効化して最新データを取得
    const logsSnapshot = await getDocs(logsRef);
    const allLogs = logsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const timestampA = a.timestamp?.toDate?.() || new Date(a.timestamp);
        const timestampB = b.timestamp?.toDate?.() || new Date(b.timestamp);
        return timestampB - timestampA; // 降順ソート
      })
      .slice(0, 100); // より多くのデータを取得（100件に増加）
    
    // 実力テストデータを分離
    const placementTestLogs = allLogs.filter(log => log.sessionType === 'placement_test');
    
    // その他の学習セッションデータも取得
    const learningSessions = allLogs.filter(log => 
      log.sessionType === 'learning_session' || 
      log.sessionType === 'review_session' ||
      log.sessionType === 'free_study_session'
    );
    
    // 分析用のログ（実力テストを優先、なければ学習セッションも含む）
    const logs = placementTestLogs.length > 0 ? placementTestLogs : allLogs;
    
    console.log('📊 分析データ:', {
      全ログ数: allLogs.length,
      実力テスト数: placementTestLogs.length,
      学習セッション数: learningSessions.length,
      分析対象: logs.length,
      表示するテスト回数: placementTestLogs.length,
      全ログ詳細: allLogs.slice(0, 3).map(log => ({
        sessionType: log.sessionType,
        finalLevel: log.finalLevel,
        level: log.level,
        testResultLevel: log.testResultLevel,
        timestamp: log.timestamp,
        全フィールド: Object.keys(log)
      }))
    });
    
    // デバッグ: 全ログのsessionTypeを確認
    const sessionTypes = allLogs.map(log => log.sessionType);
    const sessionTypeCounts = sessionTypes.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    console.log('🔍 セッションタイプ別カウント:', sessionTypeCounts);
    
    // デバッグ: 全ログの詳細を確認（最初の10件）
    console.log('📋 全ログ詳細（最初の10件）:', allLogs.slice(0, 10).map(log => ({
      id: log.id,
      sessionType: log.sessionType,
      finalLevel: log.finalLevel,
      level: log.level,
      testResultLevel: log.testResultLevel,
      timestamp: log.timestamp,
      全フィールド: Object.keys(log)
    })));
    
    // デバッグ: 実力テスト以外のログも確認
    const nonPlacementLogs = allLogs.filter(log => log.sessionType !== 'placement_test');
    console.log('🔍 実力テスト以外のログ:', nonPlacementLogs.slice(0, 5).map(log => ({
      sessionType: log.sessionType,
      finalLevel: log.finalLevel,
      level: log.level,
      testResultLevel: log.testResultLevel
    })));
    
    // デバッグ: 実力テストの詳細を確認
    if (placementTestLogs.length > 0) {
      console.log('🎯 実力テストログ詳細:', placementTestLogs.map(log => ({
        id: log.id,
        sessionType: log.sessionType,
        finalLevel: log.finalLevel,
        level: log.level,
        testResultLevel: log.testResultLevel,
        timestamp: log.timestamp,
        全フィールド: Object.keys(log)
      })));
    } else {
      console.log('❌ 実力テストログが見つかりません');
    }
    
    // 実力テストがない場合は、ユーザーデータから情報を取得
    if (placementTestLogs.length === 0) {
      // ユーザーデータからレベル情報を取得
      const userDocRef = doc(db, 'users', userId);
      try {
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const userLevel = userData.level || 0;
          
          console.log('👤 ユーザーデータからレベル取得:', { userLevel, userData });
          
          // ユーザーレベルが設定されている場合は、仮想的なテストデータとして扱う
          if (userLevel > 0) {
            return {
              hasData: true,
              totalTests: 1, // 仮想的に1回のテストとして扱う
              currentLevel: userLevel,
              levelProgression: [{
                level: userLevel,
                date: new Date(),
                vocabulary: userData.progress?.currentVocabulary || 0
              }],
              averageResponseTime: 0,
              accuracyTrend: [],
              improvementRate: 0,
              weakAreas: [],
              optimalStudyTime: {
                optimalHour: 12,
                optimalDay: '月',
                totalSessions: 1,
                averageSessionInterval: 0
              },
              message: 'ユーザーデータからレベル情報を取得しました'
            };
          }
        }
      } catch (error) {
        console.error('ユーザーデータ取得エラー:', error);
      }
      
      return {
        hasData: false,
        totalTests: 0,
        message: 'まだ実力テストを受験していません'
      };
    }
    
    if (logs.length === 0) {
      return {
        hasData: false,
        totalTests: 0,
        message: 'まだテストデータがありません'
      };
    }
    
    // レベル情報の取得（複数のフィールドをチェック）
    const currentLevel = logs[0].finalLevel || logs[0].level || logs[0].testResultLevel || 0;
    
    console.log('📈 レベル情報:', {
      最新ログの全フィールド: Object.keys(logs[0]),
      finalLevel: logs[0].finalLevel,
      level: logs[0].level,
      testResultLevel: logs[0].testResultLevel,
      最終レベル: currentLevel,
      全ログのレベル情報: logs.map(log => ({
        finalLevel: log.finalLevel,
        level: log.level,
        testResultLevel: log.testResultLevel,
        sessionType: log.sessionType
      }))
    });
    
    // 基本統計の計算
    const analysis = {
      hasData: true,
      totalTests: placementTestLogs.length, // 実力テストの回数のみを表示
      currentLevel: currentLevel,
      levelProgression: logs.map(log => ({
        level: log.finalLevel || log.level || log.testResultLevel || 0,
        date: log.timestamp?.toDate?.() || new Date(log.timestamp),
        vocabulary: log.estimatedVocabulary || 0
      })),
      averageResponseTime: calculateAverageResponseTime(logs),
      accuracyTrend: calculateAccuracyTrend(logs),
      improvementRate: calculateImprovementRate(logs),
      weakAreas: identifyWeakAreas(logs),
      optimalStudyTime: analyzeStudyPatterns(logs),
      // 新機能: 学習セッション情報も追加
      learningSessions: learningSessions.length > 0 ? {
        total: learningSessions.length,
        types: analyzeLearningSessionTypes(learningSessions),
        frequency: calculateLearningFrequency(learningSessions)
      } : null
    };
    
    return analysis;
  } catch (error) {
    console.error('Failed to analyze user performance:', error);
    return {
      hasData: false,
      error: 'データの分析に失敗しました'
    };
  }
};

// 平均回答時間の計算
const calculateAverageResponseTime = (logs) => {
  const responseTimes = logs
    .filter(log => log.responseTimes && Array.isArray(log.responseTimes))
    .flatMap(log => log.responseTimes.map(rt => rt.responseTime));
  
  console.log('⏱️ 回答時間計算:', {
    ログ数: logs.length,
    responseTimesを持つログ: logs.filter(log => log.responseTimes && Array.isArray(log.responseTimes)).length,
    全回答時間データ: responseTimes,
    平均回答時間: responseTimes.length > 0 ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0
  });
  
  if (responseTimes.length === 0) return 0;
  
  return responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
};

// 精度の推移計算
const calculateAccuracyTrend = (logs) => {
  return logs.map(log => {
    const responseTimes = log.responseTimes || [];
    const correctAnswers = responseTimes.filter(rt => rt.isCorrect).length;
    const totalAnswers = responseTimes.length;
    
    return {
      accuracy: totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0,
      date: log.timestamp?.toDate?.() || new Date(log.timestamp),
      level: log.finalLevel
    };
  }).reverse(); // 古い順に並び替え
};

// 改善率の計算
const calculateImprovementRate = (logs) => {
  if (logs.length < 2) return 0;
  
  const firstTest = logs[logs.length - 1]; // 最初のテスト
  const latestTest = logs[0]; // 最新のテスト
  
  const firstLevel = firstTest.finalLevel || firstTest.level || firstTest.testResultLevel || 0;
  const latestLevel = latestTest.finalLevel || latestTest.level || latestTest.testResultLevel || 0;
  
  return latestLevel - firstLevel;
};

// 苦手分野の特定
const identifyWeakAreas = (logs) => {
  const allResponseTimes = logs
    .filter(log => log.responseTimes && Array.isArray(log.responseTimes))
    .flatMap(log => log.responseTimes);
  
  // レベル別の正答率を計算
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
  
  // 正答率が低いレベルを特定（より厳格に）
  const weakLevels = Object.entries(levelPerformance)
    .map(([level, data]) => ({
      level: parseInt(level),
      accuracy: (data.correct / data.total) * 100,
      totalQuestions: data.total
    }))
    .filter(item => item.accuracy < 75 && item.totalQuestions >= 2) // 75%未満、最低2問から判定
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3); // 最大3つの苦手分野まで表示
  
  console.log('🔍 苦手分野:', {
    回答時間データ数: allResponseTimes.length,
    レベル別パフォーマンス: levelPerformance,
    苦手分野結果: weakLevels
  });
  
  return weakLevels;
};

// 学習パターンの分析
const analyzeStudyPatterns = (logs) => {
  const testTimes = logs.map(log => {
    const date = log.timestamp?.toDate?.() || new Date(log.timestamp);
    return {
      hour: date.getHours(),
      dayOfWeek: date.getDay(),
      date: date
    };
  });
  
  // 最もテストを受けた時間帯を特定
  const hourCounts = {};
  const dayCounts = {};
  
  testTimes.forEach(time => {
    hourCounts[time.hour] = (hourCounts[time.hour] || 0) + 1;
    dayCounts[time.dayOfWeek] = (dayCounts[time.dayOfWeek] || 0) + 1;
  });
  
  const optimalHour = Object.keys(hourCounts).reduce((a, b) => 
    hourCounts[a] > hourCounts[b] ? a : b, '12');
  
  const optimalDay = Object.keys(dayCounts).reduce((a, b) => 
    dayCounts[a] > dayCounts[b] ? a : b, '1');
  
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  
  return {
    optimalHour: parseInt(optimalHour),
    optimalDay: dayNames[parseInt(optimalDay)],
    totalSessions: logs.length,
    averageSessionInterval: calculateAverageInterval(logs)
  };
};

// セッション間隔の計算
const calculateAverageInterval = (logs) => {
  if (logs.length < 2) return 0;
  
  const intervals = [];
  for (let i = 0; i < logs.length - 1; i++) {
    const current = logs[i].timestamp?.toDate?.() || new Date(logs[i].timestamp);
    const next = logs[i + 1].timestamp?.toDate?.() || new Date(logs[i + 1].timestamp);
    const interval = Math.abs(current - next) / (1000 * 60 * 60 * 24); // 日数
    intervals.push(interval);
  }
  
  return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
};

// 学習セッションタイプの分析
const analyzeLearningSessionTypes = (learningSessions) => {
  const types = {};
  learningSessions.forEach(session => {
    const type = session.sessionType || 'unknown';
    types[type] = (types[type] || 0) + 1;
  });
  
  return Object.entries(types).map(([type, count]) => ({
    type: type,
    count: count,
    percentage: Math.round((count / learningSessions.length) * 100)
  }));
};

// 学習頻度の計算
const calculateLearningFrequency = (learningSessions) => {
  if (learningSessions.length < 2) return 0;
  
  const dates = learningSessions.map(session => {
    const date = session.timestamp?.toDate?.() || new Date(session.timestamp);
    return date.toDateString();
  });
  
  const uniqueDays = new Set(dates).size;
  const totalDays = Math.ceil((Date.now() - new Date(learningSessions[learningSessions.length - 1].timestamp).getTime()) / (1000 * 60 * 60 * 24));
  
  return Math.round((uniqueDays / totalDays) * 100);
};

// 学習推奨の生成
export const generateLearningRecommendations = (analysis) => {
  const recommendations = [];
  
  if (!analysis.hasData) {
    return [{ type: 'info', message: 'まずはテストを受けて学習データを蓄積しましょう' }];
  }
  
  // レベル別の推奨
  if (analysis.currentLevel <= 3) {
    recommendations.push({
      type: 'basic',
      message: '基礎的な単語をしっかり覚えましょう。毎日少しずつでも継続することが大切です。',
      priority: 'high'
    });
  } else if (analysis.currentLevel <= 6) {
    recommendations.push({
      type: 'intermediate',
      message: '中級レベルの単語に挑戦しましょう。復習も忘れずに行ってください。',
      priority: 'medium'
    });
  } else {
    recommendations.push({
      type: 'advanced',
      message: '上級レベルの単語をマスターしましょう。実用的な文章での使用も心がけてください。',
      priority: 'low'
    });
  }
  
  // 苦手分野の推奨
  if (analysis.weakAreas && analysis.weakAreas.length > 0) {
    const weakestLevel = analysis.weakAreas[0];
    recommendations.push({
      type: 'weakness',
      message: `レベル${weakestLevel.level}の正答率が${Math.round(weakestLevel.accuracy)}%です。このレベルの復習を重点的に行いましょう。`,
      priority: 'high'
    });
  }
  
  // 回答時間の推奨
  if (analysis.averageResponseTime > 5000) {
    recommendations.push({
      type: 'speed',
      message: '回答時間が長めです。単語の理解を深めて、より素早く答えられるように練習しましょう。',
      priority: 'medium'
    });
  }
  
  // 学習頻度の推奨
  if (analysis.optimalStudyTime.averageSessionInterval > 7) {
    recommendations.push({
      type: 'frequency',
      message: '学習間隔が空きすぎています。週に2-3回はテストを受けて学習を継続しましょう。',
      priority: 'high'
    });
  }
  
  return recommendations;
};
