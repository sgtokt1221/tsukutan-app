import React from 'react';
import { FaCircle } from 'react-icons/fa';

const ProgressLamp = ({ percentage, dailyCompletion, title }) => {
  const getLampColor = () => {
    // ノルマ達成率を最優先（数値ベース）
    if (typeof dailyCompletion === 'number') {
      if (dailyCompletion >= 80) {
        return '#4caf50'; // Green - 優秀
      }
      if (dailyCompletion >= 50) {
        return '#ffc107'; // Yellow - 良好
      }
      return '#f44336'; // Red - 要改善
    }
    
    // dailyCompletionがundefinedの場合は従来の進捗率ベース
    if (percentage === undefined || percentage === null) {
      return '#e0e0e0'; // Grey for no data
    }
    if (percentage >= 80) {
      return '#4caf50'; // Green
    }
    if (percentage >= 50) {
      return '#ffc107'; // Yellow
    }
    return '#f44336'; // Red
  };

  const getLampTitle = () => {
    // ノルマ達成率を最優先
    if (typeof dailyCompletion === 'number') {
      if (dailyCompletion >= 80) {
        return `優秀 - ノルマ達成率${dailyCompletion}%`;
      }
      if (dailyCompletion >= 50) {
        return `良好 - ノルマ達成率${dailyCompletion}%`;
      }
      return `要改善 - ノルマ達成率${dailyCompletion}%`;
    }
    
    // dailyCompletionがundefinedの場合は従来の進捗率ベース
    if (percentage === undefined || percentage === null) {
      return '進捗データなし';
    }
    return `進捗: ${percentage}%`;
  }

  return (
    <div className="progress-lamp" title={title || getLampTitle()}>
      <FaCircle style={{ color: getLampColor(), fontSize: '1em', verticalAlign: 'middle' }} />
    </div>
  );
};

export default ProgressLamp;
