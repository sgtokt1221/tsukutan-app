import React from 'react';

// StudentDashboardからレベル定義をコピーしてくる
const levelDescriptions = {
  1: { label: "中学基礎", equivalent: "英検5級 / Pre-A1" },
  2: { label: "中学標準", equivalent: "英検4級 / A1" },
  3: { label: "中学卒業", equivalent: "英検3級 / A2" },
  4: { label: "高校基礎", equivalent: "英検準2級 / A2" },
  5: { label: "高校標準", equivalent: "英検2級 / B1" },
  6: { label: "高校応用", equivalent: "英検2級〜準1級 / B1-B2" },
  7: { label: "大学中級", equivalent: "英検準1級 / B2" },
  8: { label: "大学上級", equivalent: "英検1級 / C1" },
  9: { label: "超上級", equivalent: "英検1級+" },
  10:{ label: "ネイティブ", equivalent: "ネイティブレベル" }
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