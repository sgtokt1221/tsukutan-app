import { getLevel, getLevelEquivalent, MAX_WORD_LEVEL } from './config';
import { FaBook, FaBullseye, FaHome } from 'react-icons/fa';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
// import { useNavigate } from 'react-router-dom';
import { analyzeUserPerformance, generateLearningRecommendations } from './logic/basicAnalytics';
import { auth } from './firebaseConfig';
import logger from './logic/logger';

// レベル定義

const getLevelColor = (level) => {
  if (level <= 3) return "#34d399"; // 緑
  if (level <= 5) return "#fbbf24"; // 黄
  if (level <= 6) return "#f97316"; // オレンジ
  return "#ef4444"; // 赤
};

function TestResult({ level, onRestart, responseTimes = [] }) {
  const [meterWidth, setMeterWidth] = useState(0);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);

  useEffect(() => {
    // アニメーションのため、少し遅れて幅を計算
    const timer = setTimeout(() => {
      setMeterWidth((level / MAX_WORD_LEVEL) * 100);
    }, 500); // 0.5秒後にアニメーション開始
    return () => clearTimeout(timer);
  }, [level]);

  // 新機能: 学習分析の実行
  useEffect(() => {
    const loadAnalysis = async () => {
      setLoadingAnalysis(true);
      try {
        // ユーザーIDを取得
        const user = auth.currentUser;
        if (user) {
          const analysisResult = await analyzeUserPerformance(user.uid);
          
          if (analysisResult.hasData) {
            const recs = generateLearningRecommendations(analysisResult);
            setRecommendations(recs);
          }
        }
      } catch (error) {
        console.error('Failed to load analysis:', error);
      } finally {
        setLoadingAnalysis(false);
      }
    };
    
    loadAnalysis();
  }, []);

  const info = getLevel(level);
  const label = info?.label || 'レベル判定中';
  const equivalent = info ? getLevelEquivalent(level) : '';

  return (
    <div className="test-result-container stylish-result">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="result-hero"
      >
        <div className="result-header">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="level-badge-large"
            style={{ backgroundColor: getLevelColor(level) }}
          >
            <span className="level-number">{level}</span>
          </motion.div>
          <h2 className="result-title">診断結果</h2>
        </div>
        
        <div className="result-content">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="result-main-card"
          >
            <div className="result-greeting">
              <h3>お疲れ様でした！</h3>
              <p className="result-subtitle">あなたの現在の単語レベルは...</p>
            </div>
            
            <div className="level-display">
              <h1 className="level-label">{label}</h1>
              <p className="level-equivalent">{equivalent}</p>
            </div>
            
            <div className="progress-section">
              <div className="progress-header">
                <span className="progress-label">レベル進捗</span>
                <span className="progress-percentage">{Math.round(meterWidth)}%</span>
              </div>
              <div className="meter-background">
                <motion.div
                  className="meter-foreground"
                  style={{ backgroundColor: getLevelColor(level) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${meterWidth}%` }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
              </div>
              <p className="level-description">Lv. {level} / 10</p>
            </div>
            
            <div className="result-stats">
              <div className="stat-item">
                <div className="stat-icon" aria-hidden="true"><FaBook /></div>
                <div className="stat-content">
                  <span className="stat-label">推定語彙数</span>
                  <span className="stat-value">{(info?.wordsRequired ?? 0).toLocaleString()}語</span>
                </div>
              </div>
              <div className="stat-item">
                <div className="stat-icon" aria-hidden="true"><FaBullseye /></div>
                <div className="stat-content">
                  <span className="stat-label">目標達成度</span>
                  <span className="stat-value">{Math.round(meterWidth)}%</span>
                </div>
              </div>
              {responseTimes.length > 0 && (
                <div className="stat-item">
                  <div className="stat-icon">⏱️</div>
                  <div className="stat-content">
                    <span className="stat-label">平均回答時間</span>
                    <span className="stat-value">
                      {Math.round(responseTimes.reduce((sum, rt) => sum + rt.responseTime, 0) / responseTimes.length / 1000)}秒
                    </span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
          
          {/* 新機能: 個別フィードバックセクション */}
          {!loadingAnalysis && recommendations.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="feedback-section"
            >
              <h3 className="feedback-title">学習アドバイス</h3>
              <div className="recommendations-list">
                {recommendations.map((rec, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + (index * 0.1), duration: 0.4 }}
                    className={`recommendation-item ${rec.priority}`}
                  >
                    <div className="recommendation-header">
                      <span className="recommendation-type">
                        {rec.type === 'basic' && '基礎学習'}
                        {rec.type === 'intermediate' && '中級学習'}
                        {rec.type === 'advanced' && '上級学習'}
                        {rec.type === 'weakness' && '苦手克服'}
                        {rec.type === 'speed' && '速度向上'}
                        {rec.type === 'frequency' && '学習頻度'}
                        {rec.type === 'info' && 'ℹ️ 情報'}
                      </span>
                      <span className={`priority-badge ${rec.priority}`}>
                        {rec.priority === 'high' && '重要'}
                        {rec.priority === 'medium' && '推奨'}
                        {rec.priority === 'low' && '参考'}
                      </span>
                    </div>
                    <p className="recommendation-message">{rec.message}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="result-actions"
          >
            <button className="restart-btn" onClick={() => {
              logger.debug('TestResult: 前の画面に戻るボタンがクリックされました');
              window.location.replace('/student-dashboard');
            }}>
              <span className="btn-icon" aria-hidden="true"><FaHome /></span>
              <span className="btn-text">ダッシュボードに戻る</span>
            </button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

export default TestResult;
