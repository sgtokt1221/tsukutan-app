import React, { useState, useEffect } from 'react';

const PrintableQuiz = ({ words, studentName, onCancel }) => {
  const [numQuestions, setNumQuestions] = useState(10);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [isQuizGenerated, setIsQuizGenerated] = useState(false);

  useEffect(() => {
    if (isQuizGenerated) {
      const handleAfterPrint = () => {
        setIsQuizGenerated(false); // Reset state after printing
      };

      window.addEventListener('afterprint', handleAfterPrint);
      
      // Use a timeout to ensure the DOM is painted before printing
      const timer = setTimeout(() => {
        window.print();
      }, 100);
      
      return () => {
        clearTimeout(timer);
        window.removeEventListener('afterprint', handleAfterPrint);
      };
    }
  }, [isQuizGenerated]);

  const handleGenerateQuiz = () => {
    const maxQuestions = Math.min(numQuestions, words.length);
    const shuffled = [...words].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, maxQuestions);
    setQuizQuestions(selected);
    setIsQuizGenerated(true); // This will trigger the useEffect
  };

  return (
    <>
      <div className={`quiz-modal-overlay ${isQuizGenerated ? 'printing' : ''}`} onClick={onCancel}>
        <div className="quiz-modal-content" onClick={(e) => e.stopPropagation()}>
          <h3>復習テスト作成</h3>
          <p>問題数を指定して、印刷用テストを作成します。</p>
          <div className="quiz-controls">
            <label htmlFor="num-questions">問題数:</label>
            <input
              type="number"
              id="num-questions"
              value={numQuestions}
              onChange={(e) => setNumQuestions(Math.max(1, parseInt(e.target.value, 10)))}
              min="1"
              max={words.length}
            />
            <button onClick={handleGenerateQuiz} disabled={words.length === 0}>
              テストを生成して印刷
            </button>
          </div>
          <button onClick={onCancel} className="cancel-btn">キャンセル</button>
        </div>
      </div>
      {isQuizGenerated && (
         <div className="printable-quiz">
            <div className="quiz-header">
                <h2>{studentName}さんの復習テスト</h2>
                <p>{new Date().toLocaleDateString()} | 問題数: {quizQuestions.length}</p>
            </div>
            <ol className="quiz-questions">
              {quizQuestions.map((word, index) => (
                <li key={index} className="quiz-question">
                  <span className="quiz-question-word">{word.word}</span>
                  <div className="quiz-question-answer-space"></div>
                </li>
              ))}
            </ol>
            <div className="quiz-answer-key">
              <h3>解答</h3>
              <ol>
                {quizQuestions.map((word, index) => (
                  <li key={index}>
                    <strong>{word.word}:</strong> {word.meaning}
                  </li>
                ))}
              </ol>
            </div>
        </div>
      )}
    </>
  );
};

export default PrintableQuiz;
