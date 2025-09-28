import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

// レベル定義
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

const getLevelColor = (level) => {
  if (level <= 3) return "#34d399"; // 緑
  if (level <= 6) return "#fbbf24"; // 黄
  if (level <= 8) return "#f97316"; // オレンジ
  return "#ef4444"; // 赤
};

function TestResult({ level, onRestart }) {
  const [meterWidth, setMeterWidth] = useState(0);

  useEffect(() => {
    // アニメーションのため、少し遅れて幅を計算
    const timer = setTimeout(() => {
      setMeterWidth((level / 10) * 100);
    }, 500); // 0.5秒後にアニメーション開始
    return () => clearTimeout(timer);
  }, [level]);

  const { label, equivalent } = levelDescriptions[level] || { label: "レベル判定中", equivalent: "" };

  return (
    <div className="test-result-container stylish-result">
      <h2>診断結果</h2>
      <div className="result-meter-card">
        <p className="result-meter-title">あなたの現在の単語レベルは...</p>
        <h3 className="result-meter-level-label">{label}</h3>
        <p className="result-meter-equivalent">{equivalent}</p>
        
        <div className="meter-background">
          <motion.div
            className="meter-foreground"
            style={{ backgroundColor: getLevelColor(level) }}
            initial={{ width: 0 }}
            animate={{ width: `${meterWidth}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        </div>
        
        <p className="result-meter-level-num">Lv. {level}</p>
      </div>
      <button className="restart-btn" onClick={onRestart}>
        メインメニューに戻る
      </button>
    </div>
  );
}

export default TestResult;
