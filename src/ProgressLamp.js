import React from 'react';
import { FaCircle } from 'react-icons/fa';

const ProgressLamp = ({ percentage }) => {
  const getLampColor = () => {
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
    if (percentage === undefined || percentage === null) {
      return '進捗データなし';
    }
    return `進捗: ${percentage}%`;
  }

  return (
    <div className="progress-lamp" title={getLampTitle()}>
      <FaCircle style={{ color: getLampColor(), fontSize: '1em', verticalAlign: 'middle' }} />
    </div>
  );
};

export default ProgressLamp;
