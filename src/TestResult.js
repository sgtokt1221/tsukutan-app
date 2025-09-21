import React from 'react';

function TestResult({ level, onRestart }) {
  const getFeedback = () => {
    switch (level) {
      case 2:
        return {
          title: "あなたの単語レベルは「2」です！",
          plan: "まずは基礎固めから！レベル1〜3の単語を中心に学習して、中学英語の土台をしっかり作りましょう。",
          focus: "レベル 1-3",
          challenge: "レベル 4",
        };
      case 4:
        return {
          title: "あなたの単語レベルは「4」です！",
          plan: "中学の基本はOK！レベル4の単語を完璧にしつつ、レベル5〜6の応用単語にも挑戦していきましょう。",
          focus: "レベル 4-5",
          challenge: "レベル 6",
        };
      case 6:
        return {
          title: "あなたの単語レベルは「6」です！",
          plan: "高校基礎レベルに到達！レベル6〜7の単語を固めれば、長文読解も楽になります。ハイレベルな単語にも挑戦しましょう。",
          focus: "レベル 6-7",
          challenge: "レベル 8",
        };
      case 8:
        return {
          title: "あなたの単語レベルは「8」です！",
          plan: "素晴らしい実力です！レベル8以上の難関単語をマスターすれば、受験で大きな武器になります。",
          focus: "レベル 8-9",
          challenge: "レベル 10",
        };
      default:
        return {
          title: "診断結果",
          plan: "テストお疲れ様でした！結果に基づいて学習を進めましょう。",
          focus: "N/A",
          challenge: "N/A"
        }
    }
  };

  const feedback = getFeedback();

  return (
    <div className="test-result-container">
      <h2>{feedback.title}</h2>
      <div className="result-card">
        <h3>今後の学習プラン</h3>
        <p>{feedback.plan}</p>
        <ul>
          <li><strong>集中学習ゾーン:</strong> {feedback.focus}</li>
          <li><strong>挑戦ゾーン:</strong> {feedback.challenge}</li>
        </ul>
      </div>
      <button className="restart-btn" onClick={onRestart}>
        ダッシュボードに戻る
      </button>
    </div>
  );
}

// この行がエラーを解決します！
export default TestResult;