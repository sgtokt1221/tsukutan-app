/**
 * 語彙力チェックの結果画面（2026-09-24）。保存した値と画面の数字を食い違わせない。
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import TestResult from './TestResult';

jest.mock('./firebaseConfig', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('./logic/basicAnalytics', () => ({
  analyzeUserPerformance: () => Promise.resolve(null),
  generateLearningRecommendations: () => [],
}));

test('**レベルは「/ 7」**（最大は7。「/ 10」と出ていた）', () => {
  render(<TestResult level={3} estimatedVocabulary={1505} />);
  expect(screen.getByText('Lv. 3 / 7')).toBeInTheDocument();
});

test('**推定語彙数は保存した値**（目標の語数ではない）', () => {
  render(<TestResult level={3} estimatedVocabulary={1505} />);
  expect(screen.getByText('1,505語')).toBeInTheDocument();
});

test('**目標達成度は出さない**（中身はレベル÷7で、目標とは関係が無かった）', () => {
  render(<TestResult level={3} estimatedVocabulary={1505} />);
  expect(screen.queryByText('目標達成度')).toBeNull();
});
