import React from 'react';

/**
 * 推奨バッジ（カード内部表示用）。
 *
 * 自由学習の入口（FreeStudyMenu）と、レベル・品詞・意味の絞り込み画面
 * （StudentDashboard）の両方から使う。
 */
const RecommendationBadge = ({ type, priority = 'medium' }) => {
  const getBadgeStyle = () => {
    switch (priority) {
      case 'high':
        return {
          backgroundColor: 'linear-gradient(135deg, #ff6b6b, #ee5a52)',
          color: 'white',
          text: '推奨',
          icon: null,
          borderColor: '#dc2626'
        };
      case 'medium':
        return {
          backgroundColor: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          color: 'white',
          text: 'おすすめ',
          icon: null,
          borderColor: '#d97706'
        };
      case 'low':
        return {
          backgroundColor: 'linear-gradient(135deg, #10b981, #059669)',
          color: 'white',
          text: '復習',
          icon: null,
          borderColor: '#047857'
        };
      default:
        return {
          backgroundColor: 'linear-gradient(135deg, #6b7280, #4b5563)',
          color: 'white',
          text: '推奨',
          icon: null,
          borderColor: '#374151'
        };
    }
  };

  const badgeStyle = getBadgeStyle();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: badgeStyle.backgroundColor,
        color: badgeStyle.color,
        fontSize: '11px',
        fontWeight: '600',
        padding: '4px 8px',
        borderRadius: '12px',
        border: `1px solid ${badgeStyle.borderColor}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        whiteSpace: 'nowrap',
        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
        letterSpacing: '0.025em'
      }}
    >
      {/* 記号を出さず、文言と枠の色だけで区別する（絵文字を使わない方針） */}
      <span>{badgeStyle.text}</span>
    </div>
  );
};

export default RecommendationBadge;
