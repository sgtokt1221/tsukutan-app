import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AssignedQuiz from './AssignedQuiz';
import AssignedQuizCard from './AssignedQuizCard';

// resetMocks: true なので、モックの中身は素の関数で書く（jest.fn の実装は毎回消える）
const mockSaved = [];
let mockSaveFails = false;
jest.mock('../../logic/assignedQuiz', () => {
  const actual = jest.requireActual('../../logic/assignedQuiz');
  return {
    ...actual,
    saveQuizResult: (uid, quiz, answers) => {
      if (mockSaveFails) return Promise.reject(new Error('offline'));
      mockSaved.push({ uid, id: quiz.id, answers });
      return Promise.resolve({ score: answers.filter((a) => a.correct).length, total: answers.length });
    },
    addMissedWordsToReview: () => Promise.resolve(),
  };
});
jest.mock('../../logic/textbookPages', () => ({ loadSunshineCards: () => Promise.resolve([]) }));
jest.mock('../../firebaseConfig', () => ({ db: {} }));

const QUIZ = {
  id: 'q1',
  title: 'Sunshine 1年 p.10〜12',
  direction: 'en-ja',
  grade: 1,
  words: [
    { id: 'a', word: 'apple', meaning: 'りんご' },
    { id: 'b', word: 'bread', meaning: 'パン' },
  ],
};

beforeEach(() => { mockSaved.length = 0; mockSaveFails = false; });

test('1問ずつ4択で答え、最後に結果を保存して点数と間違えた語を出す', async () => {
  const onFinished = jest.fn();
  render(<AssignedQuiz quiz={QUIZ} uid="u1" onExit={() => {}} onFinished={onFinished} />);

  expect(screen.getByText('apple')).toBeInTheDocument();
  fireEvent.click(screen.getByText('りんご'));
  fireEvent.click(screen.getByText('次へ'));
  expect(screen.getByText('bread')).toBeInTheDocument();
  fireEvent.click(screen.getByText('りんご')); // 間違える
  fireEvent.click(screen.getByText('結果を見る'));

  await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  expect(mockSaved).toEqual([{ uid: 'u1', id: 'q1', answers: [{ id: 'a', correct: true }, { id: 'b', correct: false }] }]);
  expect(screen.getByText('bread')).toBeInTheDocument(); // 間違えた語
  fireEvent.click(screen.getByText('ホームに戻る'));
  expect(onFinished).toHaveBeenCalled();
});

test('**保存に失敗したら、そう言ってもう一度送れる**（黙って閉じない）', async () => {
  mockSaveFails = true;
  render(<AssignedQuiz quiz={{ ...QUIZ, words: [QUIZ.words[0]] }} uid="u1" onExit={() => {}} onFinished={() => {}} />);
  fireEvent.click(screen.getByText('りんご'));
  fireEvent.click(screen.getByText('結果を見る'));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('結果を送れませんでした'));
  mockSaveFails = false;
  fireEvent.click(screen.getByText('もう一度送る'));
  await waitFor(() => expect(mockSaved).toHaveLength(1));
});

test('ホームのカードは、まだ解いていない小テストがあるときだけ出る', () => {
  const { container, rerender } = render(<AssignedQuizCard quizzes={[]} onStart={() => {}} />);
  expect(container).toBeEmptyDOMElement();
  const onStart = jest.fn();
  rerender(<AssignedQuizCard quizzes={[QUIZ]} onStart={onStart} />);
  expect(screen.getByText('先生からの小テスト')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Sunshine 1年 p.10〜12'));
  expect(onStart).toHaveBeenCalledWith(QUIZ);
});

describe('受験サポートのテスト範囲（2026-09-24）', () => {
  // eslint-disable-next-line global-require
  const ExamPracticeCard = require('./ExamPracticeCard').default;
  const P = { assignmentId: 'a1', title: '必携英単語LEAP 101〜200', dueDate: '2026-09-30', words: [{ deckId: 'leap', no: 101 }, { deckId: 'leap', no: 102 }], range: { deckId: 'leap', from: 101, to: 200 } };

  test('まだ合格していない範囲を出し、押すとその範囲で練習する。締切も見せる', () => {
    const onStart = jest.fn();
    render(<ExamPracticeCard practice={[P]} onStart={onStart} />);
    expect(screen.getByText('受験サポートのテスト範囲')).toBeInTheDocument();
    expect(screen.getByText(/2語・9\/30まで/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('必携英単語LEAP 101〜200'));
    expect(onStart).toHaveBeenCalledWith(P);
  });

  test('範囲が無ければ何も出さない', () => {
    const { container } = render(<ExamPracticeCard practice={[]} onStart={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
