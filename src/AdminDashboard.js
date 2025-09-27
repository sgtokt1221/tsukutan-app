import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebaseConfig';
import { collection, getDocs, doc, query, orderBy, getDoc } from 'firebase/firestore';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import ProgressLamp from './ProgressLamp';
import PrintableQuiz from './PrintableQuiz';
import './AdminDashboard.css';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend);

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
  const [studentDetails, setStudentDetails] = useState({ logs: [], reviewWords: [] });
  const [csvFile, setCsvFile] = useState(null);
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

  // --- Data Fetching ---
  const fetchInitialData = useCallback(async () => {
      setIsLoading(true);
      try {
        const usersCollectionRef = collection(db, 'users');
        const q = query(usersCollectionRef, orderBy("name"));
        const usersSnapshot = await getDocs(q);
        const studentList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setStudents(studentList);

        const todayStr = new Date().toISOString().slice(0, 10);
        const studentWithCompletion = await Promise.all(studentList.map(async (student) => {
          const completionDocRef = doc(db, 'users', student.id, 'dailyCompletion', todayStr);
          const completionDoc = await getDoc(completionDocRef);
          // progress がないときは扱いやすいよう初期値を設定
          const progress = student.progress || {};
          return {
            ...student,
            completedToday: completionDoc.exists(),
            progress: {
              percentage: progress.percentage || 0,
              currentVocabulary: progress.currentVocabulary || 0,
              targetVocabulary: progress.targetVocabulary || 0,
            },
          };
        }));

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
    setStudentDetails({ logs: [], reviewWords: [] });
    try {
      const logsColRef = collection(db, 'users', student.id, 'logs');
      const logsQuery = query(logsColRef, orderBy("timestamp", "desc"));
      const logsSnapshot = await getDocs(logsQuery);
      const logs = logsSnapshot.docs.map(d => ({...d.data(), id: d.id}));

      const reviewWordsColRef = collection(db, 'users', student.id, 'reviewWords');
      const reviewWordsSnapshot = await getDocs(reviewWordsColRef);
      const reviewWords = reviewWordsSnapshot.docs.map(d => ({...d.data(), id: d.id}));

      setStudentDetails({ logs, reviewWords });
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

  const handleFileChange = (e) => {
    setCsvFile(e.target.files[0]);
    setMessage('');
  };

  const [importErrors, setImportErrors] = useState([]);

  const handleImport = async () => {
    if (!csvFile) {
      setMessage('CSVファイルを選択してください。');
      return;
    }
    setIsImporting(true);
    setMessage('インポート処理を実行中...');
    setImportErrors([]); // Reset errors on new import

    try {
      const idToken = await auth.currentUser.getIdToken();
      const functionUrl = process.env.REACT_APP_IMPORT_USERS_URL || 'https://us-central1-tsukutan-58b3f.cloudfunctions.net/importUsers';

      const arrayBuffer = await csvFile.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = window.btoa(binary);

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fileName: csvFile.name,
          fileData: base64Data,
        }),
      });

      const responseText = await response.text();
      let result;
      try {
        result = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        throw new Error(responseText || 'サーバーからの応答を解析できませんでした。');
      }

      if (!response.ok) {
        // Use the detailed errors from the backend response if available
        const errorMessage = result.error || `HTTPエラー: ${response.status}`;
        setMessage(`エラー: ${errorMessage}`);
        if (result.errors && result.errors.length > 0) {
          setImportErrors(result.errors);
        }
      } else {
        setMessage(`インポート完了: ${result.message || ''} (作成: ${result.created}, 更新: ${result.updated}, 失敗: ${result.failed})`);
        if (result.errors && result.errors.length > 0) {
          setImportErrors(result.errors);
        }
      }
    } catch (error) {
      console.error('Import process error:', error);
      setMessage(`予期せぬエラーが発生しました: ${error.message}`);
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
            {selectedGrade && (
              <div className="grade-insight-panel">
                <h3>{selectedGrade} の分析結果</h3>
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
            {unassignedStudents.length > 0 && (
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

      case 'import':
        return (
          <div className="admin-card">
            <h3>ユーザーインポート</h3>
            <p>A列に4桁のID、B列にユーザー名、C列に学年を記載したCSVファイルをアップロードしてください。</p>
            <div className="import-controls">
              <input type="file" id="csv-upload" accept=".csv" onChange={handleFileChange} />
              <label htmlFor="csv-upload" className="file-upload-btn">{csvFile ? csvFile.name : 'ファイルを選択'}</label>
              <button onClick={handleImport} disabled={isImporting} className="import-btn">
                {isImporting ? '処理中...' : 'インポート実行'}
              </button>
            </div>
            {message && <p className={`message-box ${importErrors.length > 0 ? 'message-box-error' : 'message-box-success'}`}>{message}</p>}
            {importErrors.length > 0 && (
              <div className="import-errors">
                <h4>エラー詳細:</h4>
                <ul>
                  {importErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );

      case 'studentDetails':
        if (!selectedStudent) return <p>生徒を選択してください。</p>;
        const progress = selectedStudent.progress || {};
        const { currentVocabulary = 0, targetVocabulary = 0 } = progress;
        return (
          <div className="admin-card">
            <h3>{selectedStudent.name} (ID: {selectedStudent.studentId})</h3>
            {isFetchingDetails ? <Spinner /> : (
              <>
                <div className="student-stats-container">
                  <div className="stat-item"><strong>学年</strong><span>{selectedStudent.grade || '未設定'}</span></div>
                  <div className="stat-item"><strong>学習目標</strong><span>{currentVocabulary} / {targetVocabulary} 単語</span></div>
                </div>
                <div className="student-details-grid">
                  <div className="detail-card">
                    <div className="card-header">
                      <h4>復習リスト ({studentDetails.reviewWords.length}単語)</h4>
                      <button onClick={() => setQuizModalOpen(true)} disabled={studentDetails.reviewWords.length === 0} className="create-quiz-btn">テスト作成</button>
                    </div>
                    <ul>{studentDetails.reviewWords.map(word => <li key={word.id}>{word.word}: {word.meaning}</li>)}</ul>
                  </div>
                  <div className="detail-card">
                    <h4>学習ログ ({studentDetails.logs.length}件)</h4>
                    <div className="log-timeline">
                      {studentDetails.logs.map(log => {
                          const logDate = new Date(log.timestamp.seconds * 1000);
                          return(
                              <div key={log.id} className="timeline-item">
                                  <div className="timeline-dot"></div>
                                  <div className="timeline-content">
                                      <div className="log-header">
                                          <span className="log-main-content">「{log.textbookId}」の {log.filterType === 'level' ? `レベル${log.filterValue}` : log.filterValue}</span>
                                          <span className="log-date">{logDate.toLocaleDateString()} {logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                      </div>
                                      <p className="log-progress">{log.index}単語まで学習</p>
                                  </div>
                              </div>
                          );
                      })}
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
                  <ProgressLamp percentage={student.progress?.percentage} />
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