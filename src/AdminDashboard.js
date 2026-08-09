import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebaseConfig';
import { collection, getDocs, doc, query, orderBy, getDoc } from 'firebase/firestore';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import ProgressLamp from './ProgressLamp';
import PrintableQuiz from './PrintableQuiz';
import PrintableStory from './PrintableStory';
import { FaChartLine } from 'react-icons/fa';
import './AdminDashboard.css';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

// 段階グラフコンポーネント
const ProgressStageChart = ({ student, vocabularyProgressPercentage = 0 }) => {
  const getLevelInfo = (level) => {
    const levelMap = {
      0: { label: '未測定', subLabel: '', color: '#6b7280', icon: '❓' },
      1: { label: '英検5級', subLabel: '中1レベル', color: '#ef4444', icon: '🔴' },
      2: { label: '英検4級', subLabel: '中2レベル', color: '#f97316', icon: '🟠' },
      3: { label: '英検3級', subLabel: '中3レベル', color: '#eab308', icon: '🟡' },
      4: { label: '英検準2級', subLabel: '高1レベル', color: '#22c55e', icon: '🟢' },
      5: { label: '英検2級', subLabel: '高2レベル', color: '#06b6d4', icon: '🔵' },
      6: { label: '英検準1級', subLabel: '高3レベル', color: '#8b5cf6', icon: '🟣' },
      7: { label: '英検1級', subLabel: '大学レベル', color: '#f59e0b', icon: '🟤' },
      8: { label: '大学上級', subLabel: '大学上級レベル', color: '#ec4899', icon: '🌸' },
      9: { label: '大学院', subLabel: '大学院レベル', color: '#6366f1', icon: '🎓' },
      10: { label: 'ネイティブ', subLabel: 'ネイティブレベル', color: '#10b981', icon: '👑' }
    };
    return levelMap[level] || levelMap[0];
  };

  const getGoalInfo = (goal) => {
    if (!goal || !goal.targets || goal.targets.length === 0) {
      return { label: '目標未設定', color: '#6b7280' };
    }
    
    const targetLabels = goal.targets.map(target => {
      const targetMap = {
        'hs1': '高校入試合格',
        'hs2': '難関高校合格',
        'hs3': '大学入試準備',
        'hs4': '難関大学合格',
        'hs5': '英語資格取得',
        'uni1': '大学基礎英語',
        'uni2': '大学応用英語',
        'uni3': '大学院準備',
        'career1': '就職活動',
        'career2': 'キャリアアップ',
        'eiken_pre1': '英検準1級取得',
        'uni_top': '難関大学合格'
      };
      return targetMap[target.goalId] || '目標設定';
    });
    
    return {
      label: targetLabels.join(', '),
      color: '#3b82f6'
    };
  };

  const currentLevel = student.level || 0;
  const goalInfo = getGoalInfo(student.goal);
  const currentInfo = getLevelInfo(currentLevel);

  // デバッグ用：生徒の目標データをログ出力
  console.log('👤 生徒データ:', {
    name: student.name,
    level: currentLevel,
    goal: student.goal,
    targets: student.goal?.targets || []
  });


  return (
    <div className="progress-stage-chart">
      <div className="chart-header">
        <h4>
          <FaChartLine /> 学習進捗・目標
        </h4>
      </div>
      
      <div className="stage-container">
        {/* 現在のレベル */}
        <div className="current-stage">
          <div className="stage-info">
            <div className="stage-label">現在のレベル</div>
            <div className="stage-value" style={{ color: currentInfo.color }}>
              {currentInfo.label}
            </div>
          </div>
        </div>

        {/* 目標 */}
        <div className="goal-stage">
          <div className="stage-info">
            <div className="stage-label">目標</div>
            <div className="stage-value" style={{ color: goalInfo.color }}>
              {goalInfo.label}
            </div>
          </div>
        </div>
      </div>

      {/* 階段グラフ */}
      <div className="staircase-chart">
        <div className="staircase-container">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((level, index) => {
            const info = getLevelInfo(level);
            const isReached = level <= currentLevel;
            const isCurrent = level === currentLevel;
            // 目標レベルの判定を修正
            let isTarget = false;
            if (student.goal && student.goal.targets && student.goal.targets.length > 0) {
              const goalLevels = { 
                'hs1': 4, 'hs2': 5, 'hs3': 6, 'hs4': 7, 'hs5': 6,
                'uni1': 5, 'uni2': 7, 'uni3': 8,
                'career1': 6, 'career2': 7,
                'eiken_pre1': 6, 'uni_top': 7
              };
              
              // 目標の最小レベルを取得
              const targetMinLevel = Math.min(...student.goal.targets.map(t => goalLevels[t.goalId] || 5));
              isTarget = level === targetMinLevel;
              
              console.log('🎯 目標レベル判定:', {
                level,
                targetMinLevel,
                isTarget,
                goals: student.goal.targets.map(t => ({ goalId: t.goalId, expectedLevel: goalLevels[t.goalId] })),
                allGoalLevels: student.goal.targets.map(t => goalLevels[t.goalId] || 5)
              });
            }
            
            // 階段の高さを計算（レベルに応じて段々高くなる）
            const stepHeight = 40 + (level * 8);
            const isLastStep = index === 9;
            
            return (
              <div key={level} className="staircase-step-container">
                {/* 階段の段 */}
                <div 
                  className={`staircase-step ${isReached ? 'reached' : ''} ${isCurrent ? 'current' : ''} ${isTarget ? 'target' : ''}`}
                  style={{ 
                    height: `${stepHeight}px`,
                    backgroundColor: isCurrent ? info.color : 
                                   isReached ? info.color : 
                                   isTarget ? 'rgba(59, 130, 246, 0.1)' : '#f3f4f6',
                    borderColor: isCurrent ? info.color : 
                                isTarget ? '#3b82f6' : '#e5e7eb'
                  }}
                >
                  <div className="step-content">
                    <span className="step-number">{level}</span>
                    <span className="step-label">{info.label}</span>
                    <span className="step-sublabel">{info.subLabel}</span>
                  </div>
                  
                  {/* 現在位置マーカー */}
                  {isCurrent && (
                    <div className="current-marker">
                      <div className="marker-dot"></div>
                      <div className="marker-text">現在</div>
                    </div>
                  )}
                  
                  {/* 目標マーカー */}
                  {isTarget && (
                    <div className="target-marker">
                      <div className="marker-dot target-dot"></div>
                      <div className="marker-text">目標</div>
                    </div>
                  )}
                </div>
                
                {/* 階段の接続部分（最後の段以外） */}
                {!isLastStep && (
                  <div 
                    className="step-connector"
                    style={{ 
                      backgroundColor: isReached ? info.color : '#e5e7eb',
                      height: '20px'
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        
        {/* 凡例 */}
        <div className="chart-legend">
          <div className="legend-section">
            <h5>階段グラフの表示</h5>
            <div className="legend-items">
              <div className="legend-item">
                <div className="legend-dot current"></div>
                <span>現在のレベル</span>
              </div>
              <div className="legend-item">
                <div className="legend-dot target"></div>
                <span>目標レベル</span>
              </div>
              <div className="legend-item">
                <div className="legend-dot reached"></div>
                <span>達成済み</span>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};

// --- Constants ---
const GRADE_GROUPS = [
  { label: '小学生' },
  { label: '中１' },
  { label: '中２' },
  { label: '中３' },
  { label: '高１' },
  { label: '高２' },
  { label: '高３' },
];

const GRADE_ORDER = GRADE_GROUPS.map(group => group.label);
const GRADE_SELECT_OPTIONS = ['小1','小2','小3','小4','小5','小6','中1','中2','中3','高1','高2','高3'];

// replace モードで無効化を実行する前に、管理者にタイプさせる確認文言
const REPLACE_CONFIRM_PHRASE = '無効化する';

const convertFullWidthDigits = (value = '') =>
  value.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

const toFullWidthNumber = (digit) => {
  const map = ['０','１','２','３','４','５','６','７','８','９'];
  return map[digit] || digit;
};

const formatGradeLabel = (prefix, digit) => `${prefix}${toFullWidthNumber(digit)}`;

const mapGradeToGroup = (grade) => {
  if (!grade) return null;

  let normalized = convertFullWidthDigits(String(grade))
    .replace(/\s+/g, '')
    .toUpperCase();

  // 小学生 (小1〜小6など)
  if (/^小[1-6]$/.test(normalized) || /^小学[1-6]年?生?$/.test(normalized) || normalized === '小学生') {
    return '小学生';
  }

  const juniorMatch = normalized.match(/^中([1-3])$/) || normalized.match(/^中学([1-3])年?生?$/);
  if (juniorMatch) {
    return formatGradeLabel('中', juniorMatch[1]);
  }

  const seniorMatch = normalized.match(/^高([1-3])$/) || normalized.match(/^高校([1-3])年?生?$/);
  if (seniorMatch) {
    return formatGradeLabel('高', seniorMatch[1]);
  }

  return null;
};

// --- Sub-components ---

// Loading Spinner
const Spinner = () => <div className="spinner-container"><div className="spinner"></div></div>;

// Grade Analytics Card Component
const GradeAnalyticsCard = ({ grade, data, onAnalyze }) => {
  if (!data || data.total === 0) {
    return (
      <div className="analytics-card">
        <h3>{grade}</h3>
        <p className="no-student-message">該当する生徒がいません。</p>
      </div>
    );
  }

  const { completed, total, students } = data;
  const chartData = {
    labels: ['ノルマ達成', '未達成'],
    datasets: [{
      data: [completed, total - completed],
      backgroundColor: ['#4ade80', '#e2e8f0'],
      borderColor: '#fff',
      borderWidth: 2,
    }],
  };
  const chartOptions = { responsive: true, plugins: { legend: { display: false } } };

  const topPerformers = [...students]
    .sort((a, b) => (b.progress?.percentage || 0) - (a.progress?.percentage || 0))
    .slice(0, 3);

  return (
    <div className="analytics-card">
      <h3>{grade}</h3>
      <div className="card-content-analytics">
        <div className="chart-and-performers">
          <div className="chart-container">
            <Pie data={chartData} options={chartOptions} />
            <div className="chart-label"><strong>{completed}</strong> / {total}人</div>
          </div>
          <div className="performers-container">
            <h4>成績優秀者 TOP3</h4>
            {topPerformers.length > 0 ? (
              <ol className="performers-list">
                {topPerformers.map((student, index) => (
                  <li key={student.id}>
                    <span className="performer-rank">{index + 1}</span>
                    <span className="performer-name">{student.name}</span>
                    <span className="performer-score">{student.progress?.percentage || 0}%</span>
                  </li>
                ))}
              </ol>
            ) : <p>データがありません。</p>}
          </div>
        </div>
        <div className="analytics-actions">
          <button className="analyse-btn" onClick={() => onAnalyze?.(grade)}>
            学年の詳細分析
          </button>
        </div>
      </div>
    </div>
  );
};


// --- Main AdminDashboard Component ---

function AdminDashboard() {
  // --- State Declarations ---
  const [view, setView] = useState('analytics'); // 'analytics', 'studentDetails', 'import'
  const [students, setStudents] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [gradeInsight, setGradeInsight] = useState(null);
  const [unassignedStudents, setUnassignedStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetails, setStudentDetails] = useState({ logs: [], reviewWords: [], stories: [] });
  const [csvFile, setCsvFile] = useState(null);
  const [importMode, setImportMode] = useState('upsert');
  const [importPreview, setImportPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importErrors, setImportErrors] = useState([]);
  const [importWarnings, setImportWarnings] = useState([]);
  const [replaceConfirmText, setReplaceConfirmText] = useState('');
  const [isPreviewingImport, setIsPreviewingImport] = useState(false);
  const [message, setMessage] = useState('');
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);
  const [createStudentError, setCreateStudentError] = useState('');
  const [createStudentSuccess, setCreateStudentSuccess] = useState('');
  const [createForm, setCreateForm] = useState({ studentId: '', name: '', grade: '小1' });
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);

  // Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Modal State
  const [isQuizModalOpen, setQuizModalOpen] = useState(false);
  const [isStoryModalOpen, setStoryModalOpen] = useState(false);
  const [selectedStory, setSelectedStory] = useState(null);

  // --- Data Fetching ---
  const fetchInitialData = useCallback(async () => {
      setIsLoading(true);
      try {
        const usersCollectionRef = collection(db, 'users');
        const q = query(usersCollectionRef, orderBy("name"));
        const usersSnapshot = await getDocs(q);
        const studentList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const todayStr = new Date().toISOString().slice(0, 10);
        const studentWithCompletion = await Promise.all(studentList.map(async (student) => {
          const completionDocRef = doc(db, 'users', student.id, 'dailyCompletion', todayStr);
          const completionDoc = await getDoc(completionDocRef);
          
          // 全体のノルマ達成状況を計算
          const completionCollectionRef = collection(db, 'users', student.id, 'dailyCompletion');
          const completionSnapshot = await getDocs(completionCollectionRef);
          const totalCompletionDays = completionSnapshot.size;
          
          // 過去30日間の達成状況を計算
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const recentCompletions = completionSnapshot.docs.filter(doc => {
            const dateStr = doc.id;
            const docDate = new Date(dateStr);
            return docDate >= thirtyDaysAgo;
          });
          
          const recentCompletionRate = recentCompletions.length > 0 ? 
            Math.round((recentCompletions.length / 30) * 100) : 0;
          
          // progress がないときは扱いやすいよう初期値を設定
          const progress = student.progress || {};
          return {
            ...student,
            completedToday: completionDoc.exists(),
            totalCompletionDays,
            recentCompletionRate,
            progress: {
              percentage: progress.percentage || 0,
              currentVocabulary: progress.currentVocabulary || 0,
              targetVocabulary: progress.targetVocabulary || 0,
            },
            testResultLevel: student.level || student.testResultLevel || 0,
          };
        }));

        // 詳細データを含む学生リストをステートに設定
        setStudents(studentWithCompletion);

        const groupedData = GRADE_GROUPS.reduce((acc, group) => {
          acc[group.label] = { total: 0, completed: 0, students: [] };
          return acc;
        }, {});
        const unassigned = [];

        studentWithCompletion.forEach(student => {
          const group = mapGradeToGroup(student.grade);
          if (!group) {
            unassigned.push(student);
            return;
          }
          if (!groupedData[group]) {
            groupedData[group] = { total: 0, completed: 0, students: [] };
          }
          groupedData[group].total++;
          if (student.completedToday) groupedData[group].completed++;
          groupedData[group].students.push(student);
        });

        setAnalyticsData(groupedData);
        setUnassignedStudents(unassigned);
      } catch (error) {
        console.error("Error fetching initial data: ", error);
        setMessage("データの読み込みに失敗しました。");
      } finally {
        setIsLoading(false);
      }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // --- Event Handlers ---

  const handleSelectStudent = async (student) => {
    setSelectedStudent(student);
    setView('studentDetails');
    setIsFetchingDetails(true);
    setStudentDetails({ logs: [], reviewWords: [], stories: [] });
    try {
      const logsColRef = collection(db, 'users', student.id, 'logs');
      const logsQuery = query(logsColRef, orderBy("timestamp", "desc"));
      const logsSnapshot = await getDocs(logsQuery);
      const logs = logsSnapshot.docs.map(d => ({...d.data(), id: d.id}));

      const reviewWordsColRef = collection(db, 'users', student.id, 'reviewWords');
      const reviewWordsSnapshot = await getDocs(reviewWordsColRef);
      const reviewWords = reviewWordsSnapshot.docs.map(d => ({...d.data(), id: d.id}));

      const storiesColRef = collection(db, 'users', student.id, 'stories');
      const storiesQuery = query(storiesColRef, orderBy("createdAt", "desc"));
      const storiesSnapshot = await getDocs(storiesQuery);
      const stories = storiesSnapshot.docs.map(d => ({...d.data(), id: d.id}));

      setStudentDetails({ logs, reviewWords, stories });
    } catch (error) {
      console.error("Error fetching student details:", error);
      setMessage("生徒詳細の読み込みに失敗しました。");
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const handleShowAnalytics = () => {
    setSelectedStudent(null);
    setView('analytics');
  }

  const handleShowImport = () => {
    setSelectedStudent(null);
    setView('import');
  }

  const resetImportState = () => {
    setImportPreview(null);
    setImportResult(null);
    setImportErrors([]);
    setImportWarnings([]);
    setReplaceConfirmText('');
    setMessage('');
  };

  const handleFileChange = (e) => {
    setCsvFile(e.target.files[0]);
    resetImportState();
  };

  const handleImportModeChange = (mode) => {
    setImportMode(mode);
    // モードが変わると差分が変わるので、確認結果を捨てて取り直させる
    resetImportState();
  };

  const fileToBase64 = async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const callImportFunction = async ({ dryRun, operationId }) => {
    const idToken = await auth.currentUser.getIdToken();
    const functionUrl = process.env.REACT_APP_IMPORT_USERS_URL || 'https://us-central1-tsukutan-58b3f.cloudfunctions.net/importUsers';
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        mode: importMode,
        dryRun,
        operationId,
        fileName: csvFile.name,
        fileData: await fileToBase64(csvFile),
      }),
    });

    const responseText = await response.text();
    let payload;
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      throw new Error(responseText || 'サーバーからの応答を解析できませんでした。');
    }
    return { ok: response.ok, status: response.status, payload };
  };

  const formatImportError = (error) => {
    if (typeof error === 'string') return error;
    const line = error.line ? `${error.line}行目: ` : '';
    const student = error.studentId ? `[ID ${error.studentId}] ` : '';
    return `${line}${student}${error.message}`;
  };

  // 第1段階: 書き込まずに差分だけ取得する
  const handlePreviewImport = async () => {
    if (!csvFile || isPreviewingImport || isImporting) return;

    setIsPreviewingImport(true);
    setImportPreview(null);
    setImportResult(null);
    setImportErrors([]);
    setImportWarnings([]);
    setMessage('CSVの内容を確認しています...');

    try {
      const { ok, status, payload } = await callImportFunction({ dryRun: true, operationId: null });
      setImportWarnings(payload.warnings || []);

      if (!ok) {
        setImportErrors(payload.errors || []);
        setMessage(payload.message || `エラー: ${payload.error || `HTTPエラー: ${status}`}`);
        return;
      }

      setImportPreview(payload);
      setMessage('内容を確認しました。まだ何も変更していません。');
    } catch (error) {
      console.error('Import preview error:', error);
      setMessage(`確認に失敗しました: ${error.message}`);
    } finally {
      setIsPreviewingImport(false);
    }
  };

  // 第2段階: 確認した operationId を指定して実行する
  const handleExecuteImport = async () => {
    if (!csvFile || !importPreview || isImporting || isPreviewingImport) return;

    setIsImporting(true);
    setMessage('取り込みを実行しています...');

    try {
      const { ok, status, payload } = await callImportFunction({
        dryRun: false,
        operationId: importPreview.operationId,
      });

      if (!ok) {
        setImportErrors(payload.errors || []);
        setMessage(`エラー: ${payload.error || `HTTPエラー: ${status}`}`);
        // 確認記録は使い切られている可能性があるので、確認からやり直させる
        setImportPreview(null);
        return;
      }

      setImportResult(payload.result);
      setImportErrors(payload.errors || []);
      setMessage(payload.message || '取り込みが完了しました。');
      setImportPreview(null);
      setReplaceConfirmText('');
      await fetchInitialData();
    } catch (error) {
      console.error('Import execute error:', error);
      setMessage(`実行に失敗しました: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleAnalyzeGrade = (grade) => {
    if (!analyticsData || !analyticsData[grade]) {
      setGradeInsight(null);
      setSelectedGrade(grade);
      return;
    }

    const data = analyticsData[grade];
    const total = data.total || 0;
    const completed = data.completed || 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    const topPerformers = [...data.students]
      .filter((student) => student.progress && typeof student.progress.percentage === 'number')
      .sort((a, b) => (b.progress.percentage || 0) - (a.progress.percentage || 0))
      .slice(0, 5);

    const strugglingStudents = [...data.students]
      .filter((student) => (student.progress?.percentage || 0) < 30)
      .sort((a, b) => (a.progress?.percentage || 0) - (b.progress?.percentage || 0))
      .slice(0, 5);

    const averageProgress = total > 0
      ? Math.round(
          data.students.reduce((acc, student) => acc + (student.progress?.percentage || 0), 0) / total
        )
      : 0;

    setSelectedGrade(grade);
    setGradeInsight({
      grade,
      total,
      completed,
      completionRate,
      averageProgress,
      topPerformers,
      strugglingStudents,
    });
  };

  const manageStudentsUrl = process.env.REACT_APP_MANAGE_STUDENTS_URL || 'https://us-central1-tsukutan-58b3f.cloudfunctions.net/manageStudents';

  const handleCreateStudentSubmit = async (e) => {
    e.preventDefault();
    setCreateStudentError('');
    setCreateStudentSuccess('');

    const trimmedId = createForm.studentId.trim();
    if (!/^\d{4}$/.test(trimmedId)) {
      setCreateStudentError('IDは4桁の数字で入力してください。');
      return;
    }
    if (!createForm.name.trim()) {
      setCreateStudentError('氏名を入力してください。');
      return;
    }

    try {
      setIsCreatingStudent(true);
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch(manageStudentsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          studentId: trimmedId,
          name: createForm.name.trim(),
          grade: createForm.grade,
        }),
      });

      const responseText = await response.text();
      const result = responseText ? JSON.parse(responseText) : {};

      if (!response.ok) {
        throw new Error(result.error || `HTTPエラー: ${response.status}`);
      }

      setCreateStudentSuccess('生徒を登録しました。初期パスワードは tsukuba + ID です。');
      setCreateForm({ studentId: '', name: '', grade: '小1' });
      await fetchInitialData();
      setCreateModalOpen(false);
    } catch (error) {
      console.error('Create student error:', error);
      setCreateStudentError(error.message);
    } finally {
      setIsCreatingStudent(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!selectedStudent || isDeletingStudent) return;

    const confirmed = window.confirm(`${selectedStudent.name} を完全に削除します。復元はできません。続行しますか？`);
    if (!confirmed) return;

    try {
      setIsDeletingStudent(true);
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch(`${manageStudentsUrl}/${selectedStudent.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const responseText = await response.text();
      const result = responseText ? JSON.parse(responseText) : {};

      if (!response.ok) {
        throw new Error(result.error || `HTTPエラー: ${response.status}`);
      }

      setMessage(`${selectedStudent.name} を削除しました。`);
      setSelectedStudent(null);
      setView('analytics');
      await fetchInitialData();
    } catch (error) {
      console.error('Delete student error:', error);
      setMessage(`削除に失敗しました: ${error.message}`);
    } finally {
      setIsDeletingStudent(false);
    }
  };

  const handleLogout = () => auth.signOut();

  // --- Render Logic ---

  const renderContent = () => {
    if (isLoading) return <Spinner />;

    switch(view) {
      case 'analytics':
        return (
          <div className="analytics-view">
            {!selectedGrade ? (
              <div className="analytics-grid">
                {GRADE_ORDER.map(grade => (
                  analyticsData && analyticsData[grade] &&
                  <GradeAnalyticsCard
                    key={grade}
                    grade={grade}
                    data={analyticsData[grade]}
                    onAnalyze={handleAnalyzeGrade}
                  />
                ))}
                {analyticsData && analyticsData['学年未設定'] && (
                   <GradeAnalyticsCard
                    key="学年未設定"
                    grade="学年未設定"
                    data={analyticsData['学年未設定']}
                    onAnalyze={handleAnalyzeGrade}
                  />
                )}
              </div>
            ) : (
              <div className="grade-insight-panel">
                <div className="insight-header">
                  <h3>{selectedGrade} の分析結果</h3>
                  <button 
                    className="back-to-analytics-btn" 
                    onClick={() => setSelectedGrade(null)}
                  >
                    ← 学年一覧に戻る
                  </button>
                </div>
                {gradeInsight ? (
                  <div className="grade-insight-content">
                    <div className="insight-metrics">
                      <div className="metric-card">
                        <h4>総人数</h4>
                        <p>{gradeInsight.total} 人</p>
                      </div>
                        <div className="metric-card">
                        <h4>ノルマ達成</h4>
                        <p>{gradeInsight.completed} 人 ({gradeInsight.completionRate}%)</p>
                      </div>
                      <div className="metric-card">
                        <h4>平均進捗率</h4>
                        <p>{gradeInsight.averageProgress}%</p>
                      </div>
                    </div>
                    <div className="insight-lists">
                      <div className="insight-list">
                        <h4>成績優秀者 TOP5</h4>
                        {gradeInsight.topPerformers.length > 0 ? (
                          <ol>
                            {gradeInsight.topPerformers.map(student => (
                              <li key={student.id}>
                                <span className="student-name">{student.name}</span>
                                <span className="student-score">{student.progress?.percentage || 0}%</span>
                              </li>
                            ))}
                          </ol>
                        ) : <p>該当者なし</p>}
                      </div>
                      <div className="insight-list">
                        <h4>要フォロー（進捗30%未満）</h4>
                        {gradeInsight.strugglingStudents.length > 0 ? (
                          <ol>
                            {gradeInsight.strugglingStudents.map(student => (
                              <li key={student.id}>
                                <span className="student-name">{student.name}</span>
                                <span className="student-score">{student.progress?.percentage || 0}%</span>
                              </li>
                            ))}
                          </ol>
                        ) : <p>該当者なし</p>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p>学年のカードで「学年の詳細分析」を押してください。</p>
                )}
              </div>
            )}
            {unassignedStudents.length > 0 && !selectedGrade && (
              <div className="grade-insight-panel warning-panel">
                <h3>学年が未設定または判別不能の生徒</h3>
                <p>
                  CSV の学年列が空欄または想定外の表記のため、自動分類できませんでした。
                  CSV を修正し再インポートしてください。
                </p>
                <ul>
                  {unassignedStudents.slice(0, 10).map(student => (
                    <li key={student.id}>
                      {student.name || '氏名未設定'}（ID: {student.studentId || '不明'} / 学年: {student.grade || '未設定'}）
                    </li>
                  ))}
                </ul>
                {unassignedStudents.length > 10 && (
                  <p>... 他 {unassignedStudents.length - 10} 名</p>
                )}
              </div>
            )}
          </div>
        );

      case 'import': {
        const summary = importPreview?.summary;
        const needsReplaceConfirm = importMode === 'replace' && (summary?.disableCandidates ?? 0) > 0;
        const replaceConfirmOk = !needsReplaceConfirm || replaceConfirmText.trim() === REPLACE_CONFIRM_PHRASE;

        return (
          <div className="admin-card">
            <h3>ユーザーインポート</h3>
            <p>1行目に <code>ID</code> / <code>氏名</code> / <code>学年</code> のヘッダーを付けたCSVをアップロードしてください。</p>
            <p className="import-note">
              内容を確認してから実行する2段階です。確認だけでは既存データは1件も変わりません。
            </p>

            <fieldset className="import-mode">
              <legend>取り込みモード</legend>
              <label>
                <input
                  type="radio"
                  name="import-mode"
                  value="upsert"
                  checked={importMode === 'upsert'}
                  onChange={() => handleImportModeChange('upsert')}
                />
                追加と更新のみ（CSVにいない生徒はそのまま）
              </label>
              <label>
                <input
                  type="radio"
                  name="import-mode"
                  value="replace"
                  checked={importMode === 'replace'}
                  onChange={() => handleImportModeChange('replace')}
                />
                CSVにいない生徒を無効化する（削除はしません）
              </label>
            </fieldset>

            <div className="import-controls">
              <input type="file" id="csv-upload" accept=".csv" onChange={handleFileChange} />
              <label htmlFor="csv-upload" className="file-upload-btn">{csvFile ? csvFile.name : 'ファイルを選択'}</label>
              <button
                onClick={handlePreviewImport}
                disabled={!csvFile || isPreviewingImport || isImporting}
                className="import-btn"
              >
                {isPreviewingImport ? '確認中...' : '内容を確認'}
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={!importPreview || isImporting || isPreviewingImport || !replaceConfirmOk}
                className="import-btn import-btn-execute"
              >
                {isImporting ? '実行中...' : '実行'}
              </button>
            </div>

            {message && (
              <p className={`message-box ${importErrors.length > 0 ? 'message-box-error' : 'message-box-success'}`}>{message}</p>
            )}

            {summary && (
              <div className="import-summary">
                <div className="import-summary-card"><span className="import-summary-count">{summary.create}</span><span>追加</span></div>
                <div className="import-summary-card"><span className="import-summary-count">{summary.update}</span><span>更新</span></div>
                <div className="import-summary-card"><span className="import-summary-count">{summary.unchanged}</span><span>変更なし</span></div>
                <div className="import-summary-card"><span className="import-summary-count">{summary.disableCandidates}</span><span>無効化候補</span></div>
              </div>
            )}

            {needsReplaceConfirm && (
              <div className="import-confirm">
                <p>
                  {summary.disableCandidates}人がCSVに含まれていません。実行するとログインできなくなります
                  （学習データは残ります）。続けるには <strong>{REPLACE_CONFIRM_PHRASE}</strong> と入力してください。
                </p>
                <input
                  type="text"
                  value={replaceConfirmText}
                  onChange={(e) => setReplaceConfirmText(e.target.value)}
                  placeholder={REPLACE_CONFIRM_PHRASE}
                />
              </div>
            )}

            {importPreview?.preview?.update?.length > 0 && (
              <div className="import-detail">
                <h4>更新される生徒</h4>
                <ul>
                  {importPreview.preview.update.map((row) => (
                    <li key={row.studentId}>
                      {row.line}行目 [{row.studentId}] {row.name}
                      {Object.entries(row.changes || {}).map(([field, change]) => (
                        <span key={field}> — {field}: {String(change.from ?? '未設定')} → {String(change.to)}</span>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {importPreview?.preview?.disableCandidates?.length > 0 && (
              <div className="import-detail">
                <h4>無効化される生徒</h4>
                <ul>
                  {importPreview.preview.disableCandidates.map((row) => (
                    <li key={row.studentId}>[{row.studentId}] {row.name}（{row.grade ?? '学年未設定'}）</li>
                  ))}
                </ul>
              </div>
            )}

            {importResult && (
              <div className="import-detail">
                <h4>実行結果</h4>
                <p>
                  追加 {importResult.created} / 更新 {importResult.updated} / 変更なし {importResult.unchanged}
                  {' '}/ 無効化 {importResult.disabled} / 失敗 {importResult.errors}
                </p>
              </div>
            )}

            {importWarnings.length > 0 && (
              <div className="import-detail">
                <h4>注意</h4>
                <ul>
                  {importWarnings.map((warning, index) => (
                    <li key={index}>{formatImportError(warning)}</li>
                  ))}
                </ul>
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="import-errors">
                <h4>エラー詳細</h4>
                <ul>
                  {importErrors.map((error, index) => (
                    <li key={index}>{formatImportError(error)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      }

      case 'studentDetails':
        if (!selectedStudent) return <p>生徒を選択してください。</p>;
        const progress = selectedStudent.progress || {};
        const { currentVocabulary = 0 } = progress;
        
        // 目標達成に必要な単語数を計算
        const getTargetVocabularyForGoal = (student) => {
          if (!student.goal || !student.goal.targets || student.goal.targets.length === 0) {
            return 5000; // デフォルト目標
          }
          
          const goalLevels = {
            'hs1': 4000, 'hs2': 5000, 'hs3': 6000, 'hs4': 7000, 'hs5': 6000,
            'uni1': 5000, 'uni2': 7000, 'uni3': 8000,
            'career1': 6000, 'career2': 7000,
            'eiken_pre1': 6000, 'uni_top': 7000
          };
          
          // 目標の最大単語数を取得
          const maxTargetVocabulary = Math.max(...student.goal.targets.map(t => goalLevels[t.goalId] || 5000));
          return maxTargetVocabulary;
        };
        
        const targetVocabulary = getTargetVocabularyForGoal(selectedStudent);
        
        // 単語数ベースの進捗率を計算
        const vocabularyProgressPercentage = targetVocabulary > 0 ? Math.min((currentVocabulary / targetVocabulary) * 100, 100) : 0;
        
        // デバッグ情報をコンソールに出力
        console.log('📊 学習目標計算:', {
          studentName: selectedStudent.name,
          currentVocabulary,
          targetVocabulary,
          vocabularyProgressPercentage: Math.round(vocabularyProgressPercentage),
          goals: selectedStudent.goal?.targets || [],
          calculation: `${currentVocabulary} / ${targetVocabulary} (目標達成に必要な単語数)`
        });
        return (
          <div className="admin-card">
            {isFetchingDetails ? <Spinner /> : (
              <>
                {/* 生徒情報ヘッダー */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1.5rem',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '12px',
                  marginBottom: '1.5rem',
                  border: '1px solid #e9ecef'
                }}>
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#495057', fontSize: '1.375rem', fontWeight: '600' }}>
                      {selectedStudent.name}
                    </h4>
                    <div style={{ color: '#6c757d', fontSize: '0.9rem' }}>
                      ID: {selectedStudent.studentId} | 学年: {selectedStudent.grade || '未設定'}
                    </div>
                  </div>
                  
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: '700', 
                      color: '#28a745',
                      marginBottom: '0.25rem'
                    }}>
                      {currentVocabulary} / {targetVocabulary}
                    </div>
                    <div style={{ 
                      fontSize: '0.875rem', 
                      color: '#6c757d',
                      fontWeight: '500'
                    }}>
                      学習目標 (単語数)
                    </div>
                  </div>
                </div>
                
                {/* ノルマ達成状況 */}
                <div style={{
                  padding: '1.5rem',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  marginBottom: '1.5rem',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1rem'
                  }}>
                    <h5 style={{ 
                      margin: '0', 
                      fontSize: '1.375rem', 
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      ノルマ達成状況
                    </h5>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      {selectedStudent.recentCompletionRate >= 80 ? (
                        <>
                          <div style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            backgroundColor: '#10b981'
                          }}></div>
                          <span style={{ 
                            fontSize: '0.875rem', 
                            fontWeight: '600',
                            color: '#10b981' 
                          }}>
                            優秀
                          </span>
                        </>
                      ) : selectedStudent.recentCompletionRate >= 50 ? (
                        <>
                          <div style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            backgroundColor: '#f59e0b'
                          }}></div>
                          <span style={{ 
                            fontSize: '0.875rem', 
                            fontWeight: '600',
                            color: '#f59e0b' 
                          }}>
                            良好
                          </span>
                        </>
                      ) : (
                        <>
                          <div style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '50%',
                            backgroundColor: '#ef4444'
                          }}></div>
                          <span style={{ 
                            fontSize: '0.875rem', 
                            fontWeight: '600',
                            color: '#ef4444' 
                          }}>
                            要改善
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem'
                  }}>
                    <div style={{
                      padding: '0.75rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0'
                    }}>
                      <div style={{
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        color: '#64748b',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        marginBottom: '0.25rem'
                      }}>
                        過去30日間達成率
                      </div>
                      <div style={{
                        fontSize: '1.5rem',
                        fontWeight: '700',
                        color: '#1e293b'
                      }}>
                        {selectedStudent.recentCompletionRate || 0}%
                      </div>
                    </div>
                    
                    {selectedStudent.totalCompletionDays > 0 && (
                      <div style={{
                        padding: '0.75rem',
                        backgroundColor: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0'
                      }}>
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          color: '#64748b',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginBottom: '0.25rem'
                        }}>
                          総達成日数
                        </div>
                        <div style={{
                          fontSize: '1.5rem',
                          fontWeight: '700',
                          color: '#1e293b'
                        }}>
                          {selectedStudent.totalCompletionDays}日
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    backgroundColor: selectedStudent.recentCompletionRate >= 80 ? '#f0fdf4' : 
                                   selectedStudent.recentCompletionRate >= 50 ? '#fffbeb' : '#fef2f2',
                    borderRadius: '8px',
                    border: `1px solid ${selectedStudent.recentCompletionRate >= 80 ? '#bbf7d0' : 
                                        selectedStudent.recentCompletionRate >= 50 ? '#fed7aa' : '#fecaca'}`
                  }}>
                    <div style={{
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: selectedStudent.recentCompletionRate >= 80 ? '#166534' : 
                             selectedStudent.recentCompletionRate >= 50 ? '#92400e' : '#991b1b'
                    }}>
                      {selectedStudent.recentCompletionRate >= 80 ? (
                        '素晴らしい継続力！目標に向かって順調に学習が進んでいます。'
                      ) : selectedStudent.recentCompletionRate >= 50 ? (
                        '良好なペースです。もう少し継続できれば目標達成が見えてきます。'
                      ) : (
                        '学習習慣の見直しをおすすめします。小さな目標から始めてみましょう。'
                      )}
                    </div>
                  </div>
                </div>

                {/* 段階グラフ */}
                <ProgressStageChart student={selectedStudent} vocabularyProgressPercentage={vocabularyProgressPercentage} />
                <div className="student-details-grid">
                  <div className="detail-card">
                    <div className="card-header">
                      <h4>復習リスト ({studentDetails.reviewWords.length}単語)</h4>
                      <button onClick={() => setQuizModalOpen(true)} disabled={studentDetails.reviewWords.length === 0} className="create-quiz-btn">テスト作成</button>
                    </div>
                    <ul>{studentDetails.reviewWords.map(word => <li key={word.id}>{word.word}: {word.meaning}</li>)}</ul>
                  </div>
                  <div className="detail-card">
                    <div className="card-header">
                      <h4>作成した長文 ({studentDetails.stories.length}作品)</h4>
                    </div>
                    <div className="story-list">
                      {studentDetails.stories.length > 0 ? (
                        studentDetails.stories.map(story => {
                          const formatDate = (timestamp) => {
                            if (!timestamp) return '日付不明';
                            const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
                            return date.toLocaleDateString('ja-JP', {
                              month: 'short',
                              day: 'numeric'
                            });
                          };
                          
                          return (
                            <div key={story.id} className="story-item">
                              <div className="story-info">
                                <span className="story-title">{story.title || 'タイトルなし'}</span>
                                <span className="story-date">{formatDate(story.createdAt)}</span>
                              </div>
                              <button 
                                onClick={() => {
                                  setSelectedStory(story);
                                  setStoryModalOpen(true);
                                }}
                                className="view-story-btn"
                              >
                                表示・印刷
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <p>まだ長文が作成されていません。</p>
                      )}
                    </div>
                  </div>
                  <div className="detail-card">
                    <h4>学習時間サマリー</h4>
                    <div className="study-time-summary">
                      {(() => {
                        // 学習ログを日付ごとにグループ化して集計
                        const dailyStats = {};
                        let totalStudyTime = 0;
                        let totalWords = 0;
                        let studyDays = 0;

                        studentDetails.logs.forEach(log => {
                          const logDate = new Date(log.timestamp.seconds * 1000);
                          const dateKey = logDate.toLocaleDateString('ja-JP');
                          
                          if (!dailyStats[dateKey]) {
                            dailyStats[dateKey] = {
                              date: logDate,
                              totalTime: 0,
                              totalWords: 0,
                              sessions: 0,
                              textbooks: new Set()
                            };
                          }

                          // セッションログ（学習時間あり）の場合
                          if (log.durationInSeconds !== undefined) {
                            dailyStats[dateKey].totalTime += log.durationInSeconds;
                            dailyStats[dateKey].totalWords += (log.index + 1) || 0;
                            dailyStats[dateKey].sessions += 1;
                            if (log.textbookId) {
                              dailyStats[dateKey].textbooks.add(log.textbookId);
                            }
                          }
                        });

                        // 統計を計算
                        Object.values(dailyStats).forEach(day => {
                          if (day.totalTime > 0) {
                            totalStudyTime += day.totalTime;
                            totalWords += day.totalWords;
                            studyDays += 1;
                          }
                        });

                        const totalMinutes = Math.floor(totalStudyTime / 60);
                        const totalSeconds = totalStudyTime % 60;
                        const avgMinutes = studyDays > 0 ? Math.floor((totalStudyTime / studyDays) / 60) : 0;
                        const avgSeconds = studyDays > 0 ? Math.floor((totalStudyTime / studyDays) % 60) : 0;

                        return (
                          <div className="study-stats">
                            <div className="stat-row">
                              <span className="stat-label">総学習時間:</span>
                              <span className="stat-value">{totalMinutes > 0 ? `${totalMinutes}分 ` : ''}{totalSeconds}秒</span>
                            </div>
                            <div className="stat-row">
                              <span className="stat-label">学習日数:</span>
                              <span className="stat-value">{studyDays}日</span>
                            </div>
                            <div className="stat-row">
                              <span className="stat-label">平均学習時間:</span>
                              <span className="stat-value">{avgMinutes > 0 ? `${avgMinutes}分 ` : ''}{avgSeconds}秒</span>
                            </div>
                            <div className="stat-row">
                              <span className="stat-label">学習単語数:</span>
                              <span className="stat-value">{totalWords}単語</span>
                            </div>
                            {Object.keys(dailyStats).length > 0 && (
                              <div className="recent-sessions">
                                <h5>最近の学習記録</h5>
                                <div className="session-list">
                                  {Object.entries(dailyStats)
                                    .sort(([,a], [,b]) => b.date - a.date)
                                    .slice(0, 5)
                                    .map(([dateKey, stats]) => {
                                      const minutes = Math.floor(stats.totalTime / 60);
                                      const seconds = stats.totalTime % 60;
                                      const timeText = `${minutes > 0 ? `${minutes}分 ` : ''}${seconds}秒`;
                                      const textbookList = Array.from(stats.textbooks).join(', ');
                                      
                                      return (
                                        <div key={dateKey} className="session-item">
                                          <div className="session-date">{dateKey}</div>
                                          <div className="session-details">
                                            <span>{timeText} ({stats.totalWords}単語)</span>
                                            {textbookList && <span className="textbook-info">{textbookList}</span>}
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="delete-student-section">
                  <button className="delete-student-btn" onClick={handleDeleteStudent} disabled={isDeletingStudent}>
                    {isDeletingStudent ? '削除中...' : 'この生徒を完全に削除する'}
                  </button>
                </div>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="dashboard-container admin-container">
      <header className="dashboard-header">
        <h2>管理者ダッシュボード</h2>
        <div className="user-info">
          {auth.currentUser && <span>{auth.currentUser.email}</span>}
          <button onClick={handleLogout} className="logout-btn">ログアウト</button>
        </div>
      </header>
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="sidebar-header">
             <h4>生徒一覧</h4>
            <div>
               <button onClick={handleShowAnalytics} className="sidebar-nav-btn">分析</button>
                <button onClick={handleShowImport} className="sidebar-nav-btn">インポート</button>
                <button onClick={() => { setCreateStudentError(''); setCreateStudentSuccess(''); setCreateModalOpen(true); }} className="sidebar-nav-btn primary">生徒登録</button>
             </div>
          </div>
          {isLoading ? <Spinner /> : (
            <div className="student-list">
              {students.map(student => (
                <div key={student.id} className={`student-list-item ${selectedStudent?.id === student.id ? 'active' : ''}`} onClick={() => handleSelectStudent(student)}>
                  <div className="student-info">
                    <strong>{student.name}</strong>
                    <span>ID: {student.studentId}</span>
                  </div>
                  <ProgressLamp 
                    percentage={student.progress?.percentage} 
                    dailyCompletion={student.recentCompletionRate}
                    title={`${student.name}: ${student.recentCompletionRate}%`}
                  />
                </div>
              ))}
            </div>
          )}
        </aside>
        <main className="admin-content">
          {renderContent()}
        </main>
      </div>
      {isQuizModalOpen && selectedStudent && (
        <PrintableQuiz words={studentDetails.reviewWords} studentName={selectedStudent.name} onCancel={() => setQuizModalOpen(false)} />
      )}
      {isStoryModalOpen && selectedStory && selectedStudent && (
        <PrintableStory story={selectedStory} studentName={selectedStudent.name} onCancel={() => setStoryModalOpen(false)} />
      )}
      {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>生徒の簡易登録</h3>
            <form onSubmit={handleCreateStudentSubmit} className="create-student-form">
              <label>
                4桁ID
                <input
                  type="text"
                  value={createForm.studentId}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, studentId: e.target.value }))}
                  maxLength={4}
                  pattern="\d{4}"
                  required
                />
              </label>
              <label>
                氏名
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                学年
                <select
                  value={createForm.grade}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, grade: e.target.value }))}
                >
                  {GRADE_SELECT_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              {createStudentError && <p className="form-error">{createStudentError}</p>}
              {createStudentSuccess && <p className="form-success">{createStudentSuccess}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="modal-cancel">キャンセル</button>
                <button type="submit" className="modal-submit" disabled={isCreatingStudent}>
                  {isCreatingStudent ? '登録中...' : '登録する'}
                </button>
              </div>
              <p className="form-note">初期パスワードは tsukuba + ID です。</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;