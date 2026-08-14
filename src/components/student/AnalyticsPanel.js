import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { FaChartLine } from 'react-icons/fa';
import { analyzeUserPerformance, generateLearningRecommendations } from '../../logic/basicAnalytics';
import { predictPerformance } from '../../logic/predictionModel';
import { generateSmartRecommendations } from '../../logic/recommendationEngine';
import { clampLevel, getLevel } from '../../config';
import TrendChart from './TrendChart';
import RetentionBar from './RetentionBar';
import RankCard from '../assessment/RankCard';
import { RANK_IDS, rankForScore, scoreFromLegacyLevel } from '../../logic/rankLogic';
import { retentionBreakdown } from '../../logic/retentionBreakdown';
import logger from '../../logic/logger';

/**
 * 「きろく」タブの詳細分析。
 *
 * 以前は StudentDashboard の中で定義されていた。内側で定義された
 * コンポーネントは親が再描画されるたびに別物として作り直されるため、
 * state が毎回消えて分析データを取り直していた。切り出して解消する。
 *
 * 親から要るのはタブ移動だけなので、それだけ props で受け取る。
 */
/** レベルの呼び名。src/config/levels.json を正本にする。 */
const eikenLabel = (level) => getLevel(level)?.eiken || `レベル${level}`;

export default function AnalyticsPanel({ onNavigateTab, onSelectTextbook, onStartLearning }) {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [predictions, setPredictions] = useState(null);
  const [smartRecommendations, setSmartRecommendations] = useState([]);
  const [retention, setRetention] = useState(null);

    useEffect(() => {
      const loadAnalytics = async () => {
        setLoading(true);
        try {
          const user = auth.currentUser;
          if (user) {
            logger.debug('🔍 詳細分析開始:', user.uid);
            
            // まずユーザーデータを最新状態で取得
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            let currentUserLevel = 0;
            if (userDoc.exists()) {
              const userData = userDoc.data();
              logger.debug('👤 最新ユーザーデータ:', userData);
              currentUserLevel = userData.level || 0;
              logger.debug('📊 ユーザーデータから取得したレベル:', currentUserLevel);
            }
            
            // 定着の内訳。復習単語の状態から出す。
            const reviewSnapshot = await getDocs(collection(db, 'users', user.uid, 'reviewWords'));
            setRetention(retentionBreakdown(reviewSnapshot.docs.map((d) => d.data())));

            // 基本的な分析データを取得
            const analysis = await analyzeUserPerformance(user.uid);
            logger.debug('📊 分析結果:', analysis);
            
            // ユーザーデータのレベルを優先して使用
            const correctedAnalysis = {
              ...analysis,
              currentLevel: currentUserLevel || analysis.currentLevel
            };
            
            logger.debug('📊 詳細分析 - 修正後の現在のレベル:', correctedAnalysis.currentLevel);
            logger.debug('📊 詳細分析 - テスト回数:', correctedAnalysis.totalTests);
            logger.debug('📊 詳細分析 - 平均回答時間:', correctedAnalysis.averageResponseTime);
            setAnalyticsData(correctedAnalysis);
            
            if (correctedAnalysis.hasData) {
              const recs = generateLearningRecommendations(correctedAnalysis);
              logger.debug('💡 推奨事項:', recs);
              setRecommendations(recs);
              
              // 予測データを取得
              const pred = await predictPerformance(user.uid);
              logger.debug('🔮 予測結果:', pred);
              setPredictions(pred);
              
              // スマート推奨を取得
              const smartRecs = await generateSmartRecommendations(user.uid);
              logger.debug('🎯 スマート推奨:', smartRecs);
              setSmartRecommendations(smartRecs.recommendations || []);
            } else {
              logger.debug('❌ 分析データなし:', correctedAnalysis);
            }
          } else {
            logger.debug('❌ ユーザーがログインしていません');
          }
        } catch (error) {
          console.error('Failed to load analytics:', error);
        } finally {
          setLoading(false);
        }
      };
      
      loadAnalytics();
    }, []); // 初回のみ実行

    // 初回読み込み時のみデータを取得
    // 定期更新や外部状態への依存を削除して他の機能への影響を防ぐ

    // グラフ用の点列。日付が壊れている記録は落とす。
  const accuracyPoints = (analyticsData?.accuracyTrend || [])
    .filter((entry) => entry && Number.isFinite(entry.accuracy) && entry.date)
    .map((entry) => ({ date: entry.date, value: entry.accuracy }));

  // 生徒に見せるのはランク。レベルは内部の段階なので画面には出さない。
  const rankPoints = (analyticsData?.levelProgression || [])
    .filter((entry) => entry && Number.isFinite(entry.level) && entry.date)
    .map((entry) => {
      const rank = rankForScore(scoreFromLegacyLevel(entry.level));
      return rank ? { date: entry.date, value: RANK_IDS.indexOf(rank.id) } : null;
    })
    .filter(Boolean)
    .reverse(); // levelProgression は新しい順で来る

  const rankIdAt = (index) => RANK_IDS[index] || '';
  const firstRankId = rankPoints.length ? rankIdAt(rankPoints[0].value) : null;
  const latestRankId = rankPoints.length ? rankIdAt(rankPoints[rankPoints.length - 1].value) : null;

  if (loading) {
      return (
        <div className="analytics-tab-content">
          <div className="section-card">
            <h2 className="section-title">詳細分析</h2>
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>分析データを読み込み中...</p>
            </div>
          </div>
        </div>
      );
    }

    // デバッグ: 現在の状態を確認
    logger.debug('🔍 詳細分析レンダリング時の状態:', {
      analyticsData,
      hasData: analyticsData?.hasData,
      currentLevel: analyticsData?.currentLevel,
      totalTests: analyticsData?.totalTests,
      loading
    });

    if (!analyticsData || !analyticsData.hasData) {
      return (
        <div className="analytics-tab-content">
          <div className="section-card">
            <h2 className="section-title">詳細分析</h2>
            <div className="empty-state">
              <div className="empty-icon" aria-hidden="true"><FaChartLine /></div>
              <p>まだテストデータがありません。</p>
              <p>まずは単語力チェックテストを受けてください。</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="analytics-tab-content">
        <div className="section-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 className="section-title">詳細分析</h2>
              <p className="section-description">あなたの学習データを詳しく分析しています。</p>
            </div>
          </div>
          
          {/* ランクと換算の根拠。ホームでは紋章だけにしているので、
              数値・英検/TOEIC換算・注記はここでまとめて出す。 */}
          <div className="analytics-section">
            <div className="section-header">
              <h3>いまのランク</h3>
              <div className="section-divider"></div>
            </div>
            <RankCard score={scoreFromLegacyLevel(analyticsData.currentLevel)} />
          </div>

          {/* 基本統計 */}
          <div className="analytics-section">
            <div className="section-header">
              <h3>基本統計</h3>
              <div className="section-divider"></div>
            </div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-header">
                  <span className="stat-label">テスト回数</span>
                  <div className="stat-icon test-icon">TEST</div>
                </div>
                <div className="stat-value">{analyticsData.totalTests}</div>
                <div className="stat-unit">回</div>
              </div>
              {firstRankId && latestRankId && (
                <div className="stat-card">
                  <div className="stat-header">
                    <span className="stat-label">はじめから今まで</span>
                    <div className="stat-icon growth-icon">↑</div>
                  </div>
                  <div className="stat-value">
                    {firstRankId === latestRankId
                      ? latestRankId
                      : `${firstRankId} → ${latestRankId}`}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 定着の内訳。復習単語の「次にいつ出すか」から、あとどれくらいかを見せる。
              1語ごとの記録は前から持っていたのに、どこにも出していなかった。 */}
          {retention && retention.total > 0 && (
            <div className="analytics-section">
              <div className="section-header">
                <h3>定着の内訳</h3>
                <div className="section-divider"></div>
              </div>
              <p className="section-description">
                次に出るまでの間隔が長い語ほど、身についています。
              </p>
              <RetentionBar breakdown={retention} />
            </div>
          )}

          {/* 推移。accuracyTrend / levelProgression は前から計算していたのに
              どこにも出していなかった。数字だけの画面になっていた原因。 */}
          {(accuracyPoints.length > 1 || rankPoints.length > 1) && (
            <div className="analytics-section">
              <div className="section-header">
                <h3>これまでの推移</h3>
                <div className="section-divider"></div>
              </div>
              <div className="trend-grid">
                {accuracyPoints.length > 1 && (
                  <div className="trend-card">
                    <div className="trend-card__head">
                      <span className="trend-card__label">正答率</span>
                      <span className="trend-card__now">{Math.round(accuracyPoints[accuracyPoints.length - 1].value)}%</span>
                    </div>
                    <TrendChart points={accuracyPoints} label="正答率" unit="%" min={0} max={100} />
                  </div>
                )}
                {rankPoints.length > 1 && (
                  <div className="trend-card">
                    <div className="trend-card__head">
                      <span className="trend-card__label">ランク</span>
                      <span className="trend-card__now">{latestRankId}</span>
                    </div>
                    <TrendChart
                      points={rankPoints}
                      label="ランク"
                      min={0}
                      max={RANK_IDS.length - 1}
                      formatValue={rankIdAt}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 学習パターン */}
          <div className="analytics-section">
            <div className="section-header">
              <h3>学習パターン</h3>
              <div className="section-divider"></div>
            </div>
            <div className="study-patterns">
              <div className="pattern-card">
                <div className="pattern-label">最適な学習時間</div>
                <div className="pattern-value">{analyticsData.optimalStudyTime?.optimalHour || 12}時</div>
              </div>
              <div className="pattern-card">
                <div className="pattern-label">最適な学習曜日</div>
                <div className="pattern-value">{analyticsData.optimalStudyTime?.optimalDay || '月'}曜日</div>
              </div>
              <div className="pattern-card">
                <div className="pattern-label">平均学習間隔</div>
                <div className="pattern-value">{Math.round(analyticsData.optimalStudyTime?.averageSessionInterval || 0)}日</div>
              </div>
            </div>
          </div>

          {/* 学習セッション分析 */}
          {analyticsData.learningSessions && analyticsData.learningSessions.total > 0 && (
            <div className="analytics-section">
              <div className="section-header">
                <h3>学習セッション分析</h3>
                <div className="section-divider"></div>
              </div>
              <div className="learning-sessions-info">
                <div className="session-summary">
                  <div className="session-stat-card">
                    <div className="session-stat-label">総学習セッション数</div>
                    <div className="session-stat-value">{analyticsData.learningSessions.total}</div>
                    <div className="session-stat-unit">回</div>
                  </div>
                  <div className="session-stat-card">
                    <div className="session-stat-label">学習継続率</div>
                    <div className="session-stat-value">{analyticsData.learningSessions.frequency}</div>
                    <div className="session-stat-unit">%</div>
                  </div>
                </div>
                
                <div className="session-types">
                  <h4>学習タイプ別統計</h4>
                  <div className="type-list">
                    {analyticsData.learningSessions.types.map((type, index) => (
                      <div key={index} className="type-item">
                        <div className="type-info">
                          <span className="type-name">
                            {type.type === 'learning_session' && '新規学習'}
                            {type.type === 'review_session' && '復習学習'}
                            {type.type === 'free_study_session' && 'えらんで学習'}
                            {type.type === 'placement_test' && '実力テスト'}
                            {!['learning_session', 'review_session', 'free_study_session', 'placement_test'].includes(type.type) && type.type}
                          </span>
                          <span className="type-count">{type.count}回</span>
                        </div>
                        <div className="type-progress">
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${type.percentage}%` }}></div>
                          </div>
                          <span className="type-percentage">{type.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 予測機能 */}
          {predictions && predictions.hasData && (
            <div className="analytics-section">
              <div className="section-header">
                <h3>学習予測</h3>
                <div className="section-divider"></div>
              </div>
              <div className="prediction-card">
                <div className="prediction-summary">
                  <div className="prediction-item">
                    <div className="prediction-label">1週間後の予測ランク</div>
                    <div className="prediction-value">
                      {rankForScore(scoreFromLegacyLevel(clampLevel(predictions.nextWeekLevel)))?.id || '—'}
                    </div>
                  </div>
                  <div className="prediction-item">
                    <div className="prediction-label">予測の信頼度</div>
                    <div className="prediction-value">{Math.round(predictions.confidence * 100)}%</div>
                  </div>
                </div>
                {predictions.recommendations && predictions.recommendations.length > 0 && (
                  <div className="prediction-recommendations">
                    <h4>予測に基づくアドバイス</h4>
                    <div className="recommendation-list">
                      {predictions.recommendations.map((rec, index) => (
                        <div key={index} className={`prediction-recommendation ${rec.priority}`}>
                          <div className="recommendation-content">
                            <span className="recommendation-message">{rec.message}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* スマート推奨 */}
          {smartRecommendations.length > 0 && (
            <div className="analytics-section">
              <div className="section-header">
                <h3>スマート推奨</h3>
                <div className="section-divider"></div>
              </div>
              <div className="smart-recommendations-list">
                {smartRecommendations.map((rec, index) => {
                  // レベルベースの推奨の場合はクリック可能にする
                  const isClickable = rec.type === 'focus_level' && rec.targetLevel;
                  const handleClick = isClickable ? async () => {
                    logger.debug('スマート推奨クリック:', { level: rec.targetLevel });
                    
                    // レベルに応じて適切な教材を選択
                    let targetTextbookId = '';
                    if (rec.targetLevel <= 3) {
                      targetTextbookId = 'osaka-koukou-nyuushi'; // 中学レベル
                    } else if (rec.targetLevel <= 7) {
                      targetTextbookId = 'highschool-english'; // 高校レベル
                    } else {
                      targetTextbookId = 'osaka-koukou-nyuushi'; // その他
                    }
                    
                    // 教材を選択してから学習を開始
                    await onSelectTextbook(targetTextbookId);
                    await onStartLearning('level', rec.targetLevel);
                  } : undefined;
                  
                  
                  // タイトルと説明文を英検級レベルで表示するように変換
                  const displayTitle = isClickable && rec.targetLevel 
                    ? rec.title.replace(/レベル \d+/, eikenLabel(rec.targetLevel))
                    : rec.title;
                  const displayDescription = isClickable && rec.targetLevel
                    ? rec.description.replace(/レベル \d+/, eikenLabel(rec.targetLevel))
                    : rec.description;
                  const displayTargetMetric = isClickable && rec.targetLevel
                    ? rec.targetMetric?.replace(/レベル \d+/, eikenLabel(rec.targetLevel))
                    : rec.targetMetric;
                  
                  return (
                    <div 
                      key={index} 
                      className={`smart-recommendation-item ${rec.priority} ${isClickable ? 'clickable' : ''}`}
                      onClick={handleClick}
                    >
                      <div className="smart-recommendation-header">
                        <h4 className="smart-recommendation-title">{displayTitle}</h4>
                        <span className={`smart-priority-badge ${rec.priority}`}>
                          {rec.priority === 'high' && '重要'}
                          {rec.priority === 'medium' && '推奨'}
                          {rec.priority === 'low' && '参考'}
                        </span>
                      </div>
                      <p className="smart-recommendation-description">{displayDescription}</p>
                      <div className="smart-recommendation-meta">
                        <span className="estimated-time">{rec.estimatedTime}</span>
                        {displayTargetMetric && <span className="target-metric">{displayTargetMetric}</span>}
                        {isClickable && <span className="click-hint">クリックして学習開始</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 従来の推奨事項 */}
          {recommendations.length > 0 && (
            <div className="analytics-section">
              <div className="section-header">
                <h3>学習推奨</h3>
                <div className="section-divider"></div>
              </div>
              <div className="recommendations-list">
                {recommendations.map((rec, index) => {
                  
                  // メッセージ内のレベル表記を英検級に変換
                  const displayMessage = rec.message
                    .replace(/レベル\s*(\d+)/g, (match, level) => eikenLabel(parseInt(level)))
                    .replace(/中学レベルの単語/g, '英検3級レベルの単語')
                    .replace(/高校レベルの単語/g, '英検準2級〜2級レベルの単語')
                    .replace(/大学レベルの単語/g, '英検準1級〜1級レベルの単語');
                  
                  return (
                    <div key={index} className={`recommendation-item ${rec.priority}`}>
                      <div className="recommendation-header">
                        <span className="recommendation-type">
                          {rec.type === 'basic' && '基礎学習'}
                          {rec.type === 'intermediate' && '中級学習'}
                          {rec.type === 'advanced' && '上級学習'}
                          {rec.type === 'weakness' && '苦手克服'}
                          {rec.type === 'speed' && '速度向上'}
                          {rec.type === 'frequency' && '学習頻度'}
                        </span>
                        <span className={`priority-badge ${rec.priority}`}>
                          {rec.priority === 'high' && '重要'}
                          {rec.priority === 'medium' && '推奨'}
                          {rec.priority === 'low' && '参考'}
                        </span>
                      </div>
                      <p className="recommendation-message">{displayMessage}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
}
