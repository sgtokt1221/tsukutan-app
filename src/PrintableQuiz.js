import React, { useState } from 'react';

const PrintableQuiz = ({ words, studentName, onCancel }) => {
  const [numQuestions, setNumQuestions] = useState(10);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [isQuizGenerated, setIsQuizGenerated] = useState(false);

  const handleGenerateAndPrint = () => {
    const maxQuestions = Math.min(numQuestions, words.length);
    const shuffled = [...words].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, maxQuestions);
    
    // 1. Set the state to render the printable content
    setQuizQuestions(selected);
    setIsQuizGenerated(true);

    // 2. Use a timeout to allow React to re-render the component
    setTimeout(() => {
      // 3. Trigger the browser's print dialog
      window.print();
      
      // 4. Reset the state after printing so the modal is usable again
      setIsQuizGenerated(false);
    }, 200); // 200ms delay to be safe
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
            <button onClick={handleGenerateAndPrint} disabled={words.length === 0}>
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
