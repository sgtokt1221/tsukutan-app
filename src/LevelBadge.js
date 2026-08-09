import React from 'react';
import { getLevel, MAX_WORD_LEVEL } from './config';


function LevelBadge({ level }) {
  const info = getLevel(level);
  const hasLevel = Boolean(level) && level > 0 && Boolean(info);

  if (!hasLevel) {
    return (
      <div className="level-badge-placeholder">
        <p>単語力チェックテストであなたのレベルを診断します！</p>
      </div>
    );
  }

  const { label, eiken: eikenLevel } = info;
  const totalLevels = MAX_WORD_LEVEL;

  // Determine the tier for styling
  // レベルは1〜7。3段階に分ける。
  let tier = 1;
  if (level >= 4 && level <= 5) tier = 2;
  else if (level >= 6) tier = 3;

  const containerClassName = `level-badge-container tier-${tier}`;

  return (
    <div className={containerClassName}>
      <p className="level-badge-title">現在のあなたのレベル</p>
      <div className="level-badge">
        <span className="level-badge-label">{label}</span>
        <div className="level-badge-details">
          <div className="level-badge-numeric">
            <span className="level-badge-current">{level}</span>
            <span className="level-badge-separator">/</span>
            <span className="level-badge-total">{totalLevels}</span>
          </div>
          <span className="level-badge-equivalent">{eikenLevel}</span>
        </div>
      </div>
    </div>
  );
}

export default LevelBadge;