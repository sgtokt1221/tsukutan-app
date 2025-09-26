import React, { useState, useEffect } from 'react';
import { auth, db } from './firebaseConfig';
import { collection, getDocs, doc, query, orderBy, getDoc } from 'firebase/firestore';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import ProgressLamp from './ProgressLamp';
import PrintableQuiz from './PrintableQuiz';
import './AdminDashboard.css';

// Chart.jsのコンポーネントを登録
ChartJS.register(ArcElement, Tooltip, Legend);

// --- 定数 ---
const GRADE_ORDER = ['小学生', '中１', '中２', '中３', '高１', '高２', '高３'];

// --- 子コンポーネント ---

// ローディングスピナー
const Spinner = () => <div className="spinner-container"><div className="spinner"></div></div>;

// 各学年の統計情報を表示するカード
const GradeAnalyticsCard = ({ grade, data }) => {
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
      </div>
    </div>
  );
};


// --- メインコンポーネント ---

function AdminDashboard() {
  // --- State宣言 ---
  const [view, setView] = useState('analytics'); // 'analytics', 'studentDetails', 'import'
  const [students, setStudents] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetails, setStudentDetails] = useState({ logs: [], reviewWords: [] });
  const [csvFile, setCsvFile] = useState(null);
  const [message, setMessage] = useState('');
  
  // ローディングState
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // モーダルState
  const [isQuizModalOpen, setQuizModalOpen] = useState(false);

  // --- データ取得 ---
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        // 全生徒の基本情報を取得
        const usersCollectionRef = collection(db, 'users');
        const q = query(usersCollectionRef, orderBy("name"));
        const usersSnapshot = await getDocs(q);
        const studentList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setStudents(studentList);

        // 分析データを生成
        const todayStr = new Date().toISOString().slice(0, 10);
        const studentWithCompletion = await Promise.all(studentList.map(async (student) => {
          const completionDocRef = doc(db, 'users', student.id, 'dailyCompletion', todayStr);
          const completionDoc = await getDoc(completionDocRef);
          return { ...student, completedToday: completionDoc.exists() };
        }));
        
        const dataByGrade = studentWithCompletion.reduce((acc, student) => {
          const grade = student.grade || '学年未設定';
          if (!acc[grade]) {
            acc[grade] = { total: 0, completed: 0, students: [] };
          }
          acc[grade].total++;
          if (student.completedToday) acc[grade].completed++;
          acc[grade].students.push(student);
          return acc;
        }, {});
        
        setAnalyticsData(dataByGrade);

      } catch (error) {
        console.error("Error fetching initial data: ", error);
        setMessage("データの読み込みに失敗しました。");
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  // --- イベントハンドラ ---

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

const handleImport = async () => {
    if (!csvFile) {
      setMessage('CSVファイルを選択してください。');
      return;
    }
    // ★isImportingを使うように変数名を修正（以前のコードとの整合性のため）
    setIsImporting(true); 
    setMessage('ユーザーをインポート中...');
    try {
      // ▼▼▼ ファイル読み込みを、より安定した .text() 方式に変更 ▼▼▼
      const csvData = await csvFile.text();
      const idToken = await auth.currentUser.getIdToken();
      const functionUrl = process.env.REACT_APP_IMPORT_USERS_URL;
      
      if (!functionUrl) {
        throw new Error("Cloud FunctionのURLが設定されていません。");
      }

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'Authorization': `Bearer ${idToken}` },
        body: csvData
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || `HTTPエラー: ${response.status}`);
      }
      
      // ★更新件数も表示できるようにメッセージを修正
      setMessage(`インポート完了: 新規作成 ${result.created || 0}, 更新 ${result.updated || 0}, 失敗 ${result.failed || 0}.`);

      if (result.errors && result.errors.length > 0) {
        console.error('Import errors:', result.errors);
      }

    } catch (error) {
      console.error('Import process error:', error);
      setMessage(`エラー: ${error.message}`);
    } finally {
      // ★isImportingを使うように変数名を修正
      setIsImporting(false); 
    }
  };

  const handleLogout = () => auth.signOut();
  
  // --- レンダリング ---

  const renderContent = () => {
    if (isLoading) return <Spinner />;

    switch(view) {
      case 'analytics':
        return (
          <div className="analytics-grid">
            {GRADE_ORDER.map(grade => (
              analyticsData && analyticsData[grade] &&
              <GradeAnalyticsCard key={grade} grade={grade} data={analyticsData[grade]} />
            ))}
            {analyticsData && analyticsData['学年未設定'] && (
               <GradeAnalyticsCard key="学年未設定" grade="学年未設定" data={analyticsData['学年未設定']} />
            )}
          </div>
        );
      
      case 'import':
        return (
          <div className="admin-card">
            <h3>ユーザーインポート</h3>
            <p>A列にユーザー名、B列に4桁のID、C列に学年を記載したCSVファイルをアップロードしてください。</p>
            <div className="import-controls">
              <input type="file" id="csv-upload" accept=".csv" onChange={handleFileChange} />
              <label htmlFor="csv-upload" className="file-upload-btn">{csvFile ? csvFile.name : 'ファイルを選択'}</label>
              <button onClick={handleImport} disabled={isImporting} className="import-btn">
                {isImporting ? '処理中...' : 'インポート実行'}
              </button>
            </div>
            {message && <p className="message-box">{message}</p>}
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
    </div>
  );
}

export default AdminDashboard;