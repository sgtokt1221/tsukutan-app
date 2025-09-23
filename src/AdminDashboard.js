import React, { useState, useEffect } from 'react';
import { auth, db } from './firebaseConfig';
import { collection, getDocs, doc, query, orderBy } from 'firebase/firestore';

function AdminDashboard() {
  const [csvFile, setCsvFile] = useState(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [isFetchingStudents, setIsFetchingStudents] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetails, setStudentDetails] = useState({ logs: [], reviewWords: [] });
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const usersCollectionRef = collection(db, 'users');
        const querySnapshot = await getDocs(usersCollectionRef);
        const studentList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setStudents(studentList);
      } catch (error) {
        console.error("Error fetching students: ", error);
      } finally {
        setIsFetchingStudents(false);
      }
    };

    fetchStudents();
  }, []);

  const handleStudentSelect = async (student) => {
    if (selectedStudent?.id === student.id) {
      setSelectedStudent(null); // Toggle off if clicking the same student
      return;
    }

    setSelectedStudent(student);
    setIsFetchingDetails(true);
    setStudentDetails({ logs: [], reviewWords: [] });

    try {
      // Fetch logs
      const logsColRef = collection(db, 'users', student.id, 'logs');
      const logsQuery = query(logsColRef, orderBy("timestamp", "desc"));
      const logsSnapshot = await getDocs(logsQuery);
      const logs = logsSnapshot.docs.map(d => d.data());

      // Fetch review words
      const reviewWordsColRef = collection(db, 'users', student.id, 'reviewWords');
      const reviewWordsSnapshot = await getDocs(reviewWordsColRef);
      const reviewWords = reviewWordsSnapshot.docs.map(d => d.data());

      setStudentDetails({ logs, reviewWords });
    } catch (error) {
      console.error("Error fetching student details:", error);
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
          throw new Error("Cloud Function URL is not configured. Please set REACT_APP_IMPORT_USERS_URL in your environment.");
        }

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'Authorization': `Bearer ${idToken}`
          },
          body: csvData
        });

        const result = await response.json();

        if (response.ok) {
          setMessage(`インポート完了: 作成 ${result.created}, 失敗 ${result.failed}.`);
          if (result.errors && result.errors.length > 0) {
            console.error('Import errors:', result.errors);
            // Optionally display errors in the UI
          }
        } else {
          throw new Error(result.message || 'インポートに失敗しました。');
        }
      };

      fileReader.onerror = () => {
        throw new Error('ファイルの読み込みに失敗しました。');
      };

      fileReader.readAsText(csvFile);

    } catch (error) {
      setMessage(`エラー: ${error.message}`);
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    auth.signOut();
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
      <main className="admin-main">
        <section className="admin-section">
          <h3>ユーザーインポート</h3>
          <p>A列にユーザー名、B列に4桁のIDを記載したCSVファイルをアップロードしてください。</p>
          <input type="file" accept=".csv" onChange={handleFileChange} />
          <button onClick={handleImport} disabled={isLoading}>
            {isLoading ? '処理中...' : 'インポート実行'}
          </button>
          {message && <p>{message}</p>}
        </section>
        <section className="admin-section">
          <h3>生徒一覧</h3>
          {isFetchingStudents ? (
            <p>生徒データを読み込み中...</p>
          ) : (
            <div className="student-list">
              {students.map(student => (
                <div key={student.id}>
                  <div className="student-list-item" onClick={() => handleStudentSelect(student)}>
                    <strong>{student.name}</strong> (ID: {student.studentId})
                  </div>
                  {selectedStudent?.id === student.id && (
                    <div className="student-details">
                      {isFetchingDetails ? (
                        <p>詳細を読み込み中...</p>
                      ) : (
                        <>
                          <h4>復習リスト ({studentDetails.reviewWords.length}単語)</h4>
                          {studentDetails.reviewWords.length > 0 ? (
                            <ul>
                              {studentDetails.reviewWords.map(word => (
                                <li key={word.id}>{word.word}: {word.meaning}</li>
                              ))}
                            </ul>
                          ) : <p>復習リストは空です。</p>}

                          <h4>学習ログ</h4>
                          {studentDetails.logs.length > 0 ? (
                            <ul>
                              {studentDetails.logs.map((log, index) => (
                                <li key={index}>
                                  {log.timestamp.toDate().toLocaleString()}:
                                  「{log.textbookId}」の {log.filterType === 'level' ? `レベル${log.filterValue}` : log.filterValue}
                                  を {log.index}単語まで学習 (ステータス: {log.status})
                                </li>
                              ))}
                            </ul>
                          ) : <p>学習ログはありません。</p>}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default AdminDashboard;
