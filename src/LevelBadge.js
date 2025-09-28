import React from 'react';

// StudentDashboardからレベル定義をコピーしてくる
const levelDescriptions = {
  1: { label: "中学基礎", equivalent: "英検5級 / Pre-A1", wordsRequired: 600 },
  2: { label: "中学標準", equivalent: "英検4級 / A1", wordsRequired: 1300 },
  3: { label: "中学卒業", equivalent: "英検3級 / A2", wordsRequired: 2100 },
  4: { label: "高校基礎", equivalent: "英検準2級 / A2", wordsRequired: 3600 },
  5: { label: "高校標準", equivalent: "英検2級 / B1", wordsRequired: 5100 },
  6: { label: "高校応用", equivalent: "英検2級〜準1級 / B1-B2", wordsRequired: 6000 },
  7: { label: "大学中級", equivalent: "英検準1級 / B2", wordsRequired: 8000 },
  8: { label: "大学上級", equivalent: "英検1級 / C1", wordsRequired: 10000 },
  9: { label: "超上級", equivalent: "英検1級+", wordsRequired: 12000 },
  10:{ label: "ネイティブ", equivalent: "ネイティブレベル", wordsRequired: 15000 }
};

function LevelBadge({ level, type = 'full' }) {
  const hasLevel = level && level > 0 && levelDescriptions[level];

  if (type === 'header') {
    if (!hasLevel) return null; // ヘッダーではレベルがない場合は何も表示しない

    const { label } = levelDescriptions[level];
    return (
      <span className="header-level-badge">
        {label}
      </span>
    );
  }

  // --- デフォルトの 'full' 表示 ---
  if (!hasLevel) {
    return (
      <div className="level-badge-placeholder">
        <p>単語力チェックテストでレベルを診断しよう！</p>
      </div>
    );
  }

  const { label, equivalent } = levelDescriptions[level];
  // "英検5級 / Pre-A1" のような文字列から "Pre-A1" の部分だけを抽出
  const cefr = equivalent.split(' / ')[1] || '';

  return (
    <div className="level-badge-container">
      <p className="level-badge-title">現在のあなたのレベル</p>
      <div className="level-badge">
        <span className="level-badge-cefr">{cefr}</span>
        <span className="level-badge-label">{label}</span>
      </div>
    </div>
  );
}

export default LevelBadge;