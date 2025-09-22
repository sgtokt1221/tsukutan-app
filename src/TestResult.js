import React from 'react';

// 新しいレベル定義に合わせて、フィードバックの内容を更新
const levelDescriptions = {
  1: { label: "中学基礎", equivalent: "英検5級 / Pre-A1" },
  2: { label: "中学標準", equivalent: "英検4級 / A1" },
  3: { label: "中学卒業", equivalent: "英検3級 / A2" },
  4: { label: "高校基礎", equivalent: "英検準2級 / A2" },
  5: { label: "高校標準", equivalent: "英検2級 / B1" },
  6: { label: "高校応用", equivalent: "英検2級〜準1級 / B1-B2" },
  7: { label: "大学中級", equivalent: "英検準1級 / B2" },
  8: { label: "大学上級", equivalent: "英検1級 / C1" }
};

function TestResult({ level, onRestart }) {
  const getFeedback = () => {
    // 診断結果がない場合や範囲外の場合のデフォルト表示
    if (!level || !levelDescriptions[level]) {
      return {
        title: "診断結果",
        plan: "テストお疲れ様でした！もう一度テストを受けるか、ダッシュボードから学習を始めましょう。",
        focus: "N/A",
        challenge: "N/A"
      }
    }

    const currentLevelInfo = levelDescriptions[level];
    const nextLevelInfo = levelDescriptions[level + 1];

    switch (level) {
      case 1:
        return {
          title: `あなたの単語レベルは「${currentLevelInfo.label}」です！`,
          plan: "英語学習の素晴らしいスタートです！まずはこのレベルの単語を確実に覚え、次のステップに進みましょう。",
          focus: currentLevelInfo.label,
          challenge: nextLevelInfo?.label || "次のレベル",
        };
      case 2:
        return {
          title: `あなたの単語レベルは「${currentLevelInfo.label}」です！`,
          plan: "中学レベルの基本的な単語は身についていますね。このレベルを完璧にして、中学卒業レベルを目指しましょう。",
          focus: currentLevelInfo.label,
          challenge: nextLevelInfo?.label || "次のレベル",
        };
      case 3:
        return {
          title: `あなたの単語レベルは「${currentLevelInfo.label}」です！`,
          plan: "中学で習う単語はほぼマスターしています。次は高校レベルの単語に進み、語彙力をさらに強化しましょう。",
          focus: currentLevelInfo.label,
          challenge: nextLevelInfo?.label || "次のレベル",
        };
      case 4:
        return {
          title: `あなたの単語レベルは「${currentLevelInfo.label}」です！`,
          plan: "高校英語の良いスタートが切れています。このレベルの語彙を固め、より難しい長文にも対応できる力をつけましょう。",
          focus: currentLevelInfo.label,
          challenge: nextLevelInfo?.label || "次のレベル",
        };
      case 5:
        return {
          title: `あなたの単語レベルは「${currentLevelInfo.label}」です！`,
          plan: "高校で必要な標準的な単語力は十分にあります。さらに応用的な単語を学び、大学受験に備えましょう。",
          focus: currentLevelInfo.label,
          challenge: nextLevelInfo?.label || "次のレベル",
        };
      case 6:
        return {
          title: `あなたの単語レベルは「${currentLevelInfo.label}」です！`,
          plan: "高校範囲の応用的な単語も理解できています。大学入試レベルの語彙をマスターし、自信をつけましょう。",
          focus: currentLevelInfo.label,
          challenge: nextLevelInfo?.label || "次のレベル",
        };
      case 7:
        return {
          title: `あなたの単語レベルは「${currentLevelInfo.label}」です！`,
          plan: "大学入試や実際のコミュニケーションでも通用する高い語彙力です。最上級レベルに挑戦し、英語力を完璧なものにしましょう。",
          focus: currentLevelInfo.label,
          challenge: nextLevelInfo?.label || "次のレベル",
        };
      case 8:
        return {
          title: `あなたの単語レベルは「${currentLevelInfo.label}」です！`,
          plan: "素晴らしい語彙力です！ネイティブスピーカーとも対等に渡り合えるレベルです。知識の維持とさらなる向上を目指しましょう。",
          focus: currentLevelInfo.label,
          challenge: "知識の維持・向上",
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

export default TestResult;