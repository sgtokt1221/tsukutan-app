import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FreeStudyMenu, { freeStudyBackTarget } from './FreeStudyMenu';

const EIKEN_OPTIONS = [
  { id: 'eiken-5', label: '英検5級' },
  { id: 'eiken-4', label: '英検4級' },
  { id: 'eiken-3', label: '英検3級' },
  { id: 'eiken-pre2', label: '英検準2級' },
  { id: 'eiken-2', label: '英検2級' },
  { id: 'eiken-pre1', label: '英検準1級' },
];

const INTERVIEW_GRADES = [
  { id: '3', label: '3級' },
  { id: 'pre2', label: '準2級' },
  { id: '2', label: '2級' },
  { id: 'pre1', label: '準1級' },
];

const COUNTS = {
  'osaka-koukou-nyuushi': 3193,
  'highschool-english': 5934,
  'eiken-5': 620,
  'eiken-4': 1240,
  'eiken-3': 2100,
  'eiken-pre2': 3400,
  'eiken-2': 4800,
  'eiken-pre1': 6200,
};

const show = (props = {}) => {
  const handlers = {
    onNavigate: jest.fn(),
    onSelectTextbook: jest.fn(),
    onSelectInterview: jest.fn(),
  };
  render(
    <FreeStudyMenu
      mode="main"
      eikenOptions={EIKEN_OPTIONS}
      interviewGrades={INTERVIEW_GRADES}
      wordCountOf={(id) => COUNTS[id] ?? null}
      recommendationOf={() => null}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

test('最初は 中学英語 / 高校英語 / 英検 の3枚だけ', () => {
  show();

  const titles = screen.getAllByRole('button')
    .map((card) => card.querySelector('.free-study-card__title').textContent);
  expect(titles).toEqual(['中学英語', '高校英語', '英検']);

  // 級や面接の入口は、英検を開くまで出さない
  expect(screen.queryByText('英検3級')).not.toBeInTheDocument();
  expect(screen.queryByText('二次試験（面接）')).not.toBeInTheDocument();
});

test('中学英語・高校英語は語数を添えて、押すとそのまま教材へ入る', () => {
  const { onSelectTextbook } = show();

  expect(screen.getByText('大阪府公立入試・3,193語')).toBeInTheDocument();
  expect(screen.getByText('基礎・標準・応用・5,934語')).toBeInTheDocument();

  fireEvent.click(screen.getByText('中学英語'));
  expect(onSelectTextbook).toHaveBeenCalledWith('osaka-koukou-nyuushi');
});

test('単語データを読む前は語数を出さない', () => {
  show({ wordCountOf: () => null });

  expect(screen.getByText('大阪府公立入試')).toBeInTheDocument();
  expect(screen.queryByText(/\d語/)).not.toBeInTheDocument();
});

test('英検は選ばずに一段下りる', () => {
  const { onNavigate, onSelectTextbook } = show();

  fireEvent.click(screen.getByText('英検'));
  expect(onNavigate).toHaveBeenCalledWith('eiken');
  expect(onSelectTextbook).not.toHaveBeenCalled();
});

test('英検の下は 単語 と 面接 の2つ', () => {
  const { onNavigate } = show({ mode: 'eiken' });

  fireEvent.click(screen.getByText('単語を覚える'));
  expect(onNavigate).toHaveBeenCalledWith('eiken-words');

  fireEvent.click(screen.getByText('二次試験（面接）'));
  expect(onNavigate).toHaveBeenCalledWith('eiken-interview');
});

test('単語は5級から準1級まで並ぶ', () => {
  const { onSelectTextbook } = show({ mode: 'eiken-words' });

  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
    '英検5級620語', '英検4級1,240語', '英検3級2,100語',
    '英検準2級3,400語', '英検2級4,800語', '英検準1級6,200語',
  ]);

  fireEvent.click(screen.getByText('英検3級'));
  expect(onSelectTextbook).toHaveBeenCalledWith('eiken-3');
});

test('収録が0語の級は出さない。選んでも何も学べない', () => {
  show({ mode: 'eiken-words', wordCountOf: (id) => (id === 'eiken-pre1' ? 0 : 100) });

  expect(screen.getByText('英検2級')).toBeInTheDocument();
  expect(screen.queryByText('英検準1級')).not.toBeInTheDocument();
});

test('面接は3級以上の4つだけ。単語ではないので語数を出さない', () => {
  const { onSelectInterview } = show({ mode: 'eiken-interview' });

  expect(screen.getAllByRole('button').map((b) => b.textContent))
    .toEqual(['3級5問', '準2級5問', '2級5問', '準1級5問']);

  fireEvent.click(screen.getByText('準2級'));
  expect(onSelectInterview).toHaveBeenCalledWith('pre2');
});

test('英検カードのおすすめは、どれか1級でも合っていれば付く', () => {
  show({ recommendationOf: (id) => (id === 'eiken-3' ? 'medium' : null) });

  // 中学英語・高校英語には付かず、英検にだけ付く
  expect(screen.getAllByText('おすすめ')).toHaveLength(1);
  expect(screen.getByText('英検').closest('button')).toHaveTextContent('おすすめ');
});

describe('戻る先', () => {
  test('英検の中は一段ずつ戻る', () => {
    expect(freeStudyBackTarget('eiken-words', null)).toBe('eiken');
    expect(freeStudyBackTarget('eiken-interview', null)).toBe('eiken');
    expect(freeStudyBackTarget('eiken', null)).toBe('main');
  });

  test('教材から戻る先は、その教材をどこから選んだかで決まる', () => {
    expect(freeStudyBackTarget('filter', 'eiken-3')).toBe('eiken-words');
    expect(freeStudyBackTarget('filter', 'osaka-koukou-nyuushi')).toBe('main');
    expect(freeStudyBackTarget('filter', 'highschool-english')).toBe('main');
    expect(freeStudyBackTarget('filter', null)).toBe('main');
  });
});
