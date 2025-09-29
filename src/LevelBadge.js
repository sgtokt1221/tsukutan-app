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

function LevelBadge({ level }) {
  const hasLevel = level && level > 0 && levelDescriptions[level];

  if (!hasLevel) {
    return (
      <div className="level-badge-placeholder">
        <p>単語力チェックテストであなたのレベルを診断します！</p>
      </div>
    );
  }

  const { label, equivalent } = levelDescriptions[level];
  const cefr = equivalent.split(' / ')[1] || '';

  // Determine the tier for styling
  let tier = 1;
  if (level >= 4 && level <= 6) tier = 2;
  else if (level >= 7 && level <= 8) tier = 3;
  else if (level >= 9) tier = 4;

  const containerClassName = `level-badge-container tier-${tier}`;

  return (
    <div className={containerClassName}>
      <p className="level-badge-title">現在のあなたのレベル</p>
      <div className="level-badge">
        <span className="level-badge-cefr">{cefr}</span>
        <span className="level-badge-label">{label}</span>
      </div>
    </div>
  );
}

export default LevelBadge;