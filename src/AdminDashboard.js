import React, { useState, useEffect } from 'react';
import { auth, db } from './firebaseConfig';
import { collection, getDocs, doc, query, orderBy } from 'firebase/firestore';
import ProgressLamp from './ProgressLamp';
import PrintableQuiz from './PrintableQuiz';
import './AdminDashboard.css';

// A simple spinner component
const Spinner = () => (
  <div className="spinner-container">
    <div className="spinner"></div>
  </div>
);

function AdminDashboard() {
  const [csvFile, setCsvFile] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [isFetchingStudents, setIsFetchingStudents] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetails, setStudentDetails] = useState({ logs: [], reviewWords: [] });
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isQuizModalOpen, setQuizModalOpen] = useState(false);

  useEffect(() => {
    const fetchStudents = async () => {
      setIsFetchingStudents(true);
      try {
        const usersCollectionRef = collection(db, 'users');
        const q = query(usersCollectionRef, orderBy("name"));
        const querySnapshot = await getDocs(q);
        const studentList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setStudents(studentList);
      } catch (error) {
        console.error("Error fetching students: ", error);
        setMessage("生徒リストの読み込みに失敗しました。");
      } finally {
        setIsFetchingStudents(false);
      }
    };

    fetchStudents();
  }, []);

  const handleStudentSelect = async (student) => {
    setSelectedStudent(student);
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

  const handleFileChange = (e) => {
    setCsvFile(e.target.files[0]);
    setMessage('');
  };

  const handleImport = async () => {
    if (!csvFile) {
      setMessage('CSVファイルを選択してください。');
      return;
    }

    setIsLoading(true);
    setMessage('ユーザーをインポート中...');

    try {
      const fileReader = new FileReader();
      fileReader.onload = async (event) => {
        const csvData = event.target.result;
        const idToken = await auth.currentUser.getIdToken();
        const functionUrl = process.env.REACT_APP_IMPORT_USERS_URL;
        if (!functionUrl) {
          throw new Error("Cloud FunctionのURLが設定されていません。");
        }

        try {
          const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain', 'Authorization': `Bearer ${idToken}` },
            body: csvData
          });

          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.message || `HTTPエラー: ${response.status}`);
          }

          setMessage(`インポート完了: 作成 ${result.created}, 失敗 ${result.failed}.`);
          if (result.errors && result.errors.length > 0) {
            console.error('Import errors:', result.errors);
          }
        } catch (error) {
          console.error('Fetch error:', error);
          if (error.message.includes('Failed to fetch')) {
             setMessage('エラー: Cloud Functionへの接続に失敗しました。URLやCORSの設定を確認してください。');
          } else {
            setMessage(`エラー: ${error.message}`);
          }
        }
      };
      fileReader.readAsText(csvFile, 'UTF-8');
    } catch (error) {
      setMessage(`エラー: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    auth.signOut();
  };

  const renderContent = () => {
    if (!selectedStudent) {
      return (
        <div className="admin-card">
          <h3>ユーザーインポート</h3>
          <p>A列にユーザー名、B列に4桁のIDを記載したCSVファイルをアップロードしてください。</p>
          <div className="import-controls">
            <input type="file" id="csv-upload" accept=".csv" onChange={handleFileChange} />
            <label htmlFor="csv-upload" className="file-upload-btn">{csvFile ? csvFile.name : 'ファイルを選択'}</label>
            <button onClick={handleImport} disabled={isLoading} className="import-btn">
              {isLoading ? <Spinner /> : 'インポート実行'}
            </button>
          </div>
          {message && <p className="message-box">{message}</p>}
        </div>
      );
    }

    const getCurrentLevel = () => {
      if (!studentDetails.logs || studentDetails.logs.length === 0) {
        return "N/A";
      }
      const lastLog = studentDetails.logs[0]; // Logs are sorted by timestamp desc
      if (lastLog.filterType === 'level') {
        return `レベル ${lastLog.filterValue}`;
      }
      return lastLog.filterValue;
    };

    const progress = selectedStudent.progress || {};
    const { currentVocabulary = 0, targetVocabulary = 0 } = progress;

    return (
      <div className="admin-card">
        <h3>{selectedStudent.name} (ID: {selectedStudent.studentId})</h3>
        {isFetchingDetails ? <Spinner /> : (
          <>
            <div className="student-stats-container">
              <div className="stat-item">
                <strong>現在のレベル</strong>
                <span>{getCurrentLevel()}</span>
              </div>
              <div className="stat-item">
                <strong>学習目標</strong>
                <span>{currentVocabulary} / {targetVocabulary} 単語</span>
              </div>
            </div>
            <div className="student-details-grid">
              <div className="detail-card">
                <div className="card-header">
                  <h4>復習リスト ({studentDetails.reviewWords.length}単語)</h4>
                  <button 
                    onClick={() => setQuizModalOpen(true)} 
                    disabled={studentDetails.reviewWords.length === 0}
                    className="create-quiz-btn"
                  >
                    テスト作成
                  </button>
                </div>
                {studentDetails.reviewWords.length > 0 ? (
                  <ul>
                    {studentDetails.reviewWords.map(word => (
                      <li key={word.id}>{word.word}: {word.meaning}</li>
                    ))}
                  </ul>
                ) : <p>復習リストは空です。</p>}
              </div>
              <div className="detail-card">
                <h4>学習ログ ({studentDetails.logs.length}件)</h4>
                {studentDetails.logs.length > 0 ? (
                  <ul>
                    {studentDetails.logs.map((log) => (
                      <li key={log.id}>
                        {new Date(log.timestamp.seconds * 1000).toLocaleString()}:
                        「{log.textbookId}」の {log.filterType === 'level' ? `レベル${log.filterValue}` : log.filterValue}
                        を {log.index}単語まで学習
                      </li>
                    ))}
                  </ul>
                ) : <p>学習ログはありません。</p>}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };
  
  return (
    <div className="dashboard-container">
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
             <button onClick={() => setSelectedStudent(null)} className="show-import-btn">＋ ユーザーインポート</button>
          </div>
          {isFetchingStudents ? <Spinner /> : (
            <div className="student-list">
              {students.map(student => (
                <div
                  key={student.id}
                  className={`student-list-item ${selectedStudent?.id === student.id ? 'active' : ''}`}
                  onClick={() => handleStudentSelect(student)}
                >
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
      {isQuizModalOpen && (
        <PrintableQuiz 
          words={studentDetails.reviewWords}
          studentName={selectedStudent.name}
          onCancel={() => setQuizModalOpen(false)}
        />
      )}
    </div>
  );
}

export default AdminDashboard;
