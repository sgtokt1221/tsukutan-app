import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import EikenWriting from './EikenWriting';

const PROMPTS = {
  grade: 'pre2',
  tasks: {
    opinion: {
      label: '意見論述', minWords: 5, maxWords: 8, instructions: ['Write an answer.'],
      items: [{ id: 'o1', theme: '学校', question: 'Do you think students should study in the morning?' }],
    },
    email: {
      label: 'Eメール', minWords: 4, maxWords: 6, instructions: ['Reply.'],
      items: [{ id: 'e1', theme: '趣味', from: 'Alex', body: 'Hi,\n\nI joined a [[beach cleanup]].\n\nAlex' }],
    },
  },
};
const CARD = {
  grade: 'pre2',
  sections: [
    { id: 'template', label: '型', groups: [{ items: [{ en: 'I have two reasons.', ja: '理由', important: true }] }] },
    { id: 'markers', label: 'つなぎ言葉', groups: [{ title: '【追加】', items: [{ en: 'In addition,', ja: 'さらに' }] }] },
  ],
};

const mockScore = jest.fn();
jest.mock('../../../logic/writingContent', () => ({
  ...jest.requireActual('../../../logic/writingContent'),
  loadWritingPrompts: () => Promise.resolve(PROMPTS),
  loadWritingCard: () => Promise.resolve(CARD),
}));
jest.mock('../../../logic/writingApi', () => ({ scoreWritingAnswer: (...args) => mockScore(...args) }));
jest.mock('../../../firebaseConfig', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ collection: () => ({}), getDocs: () => Promise.resolve({ docs: [] }) }));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'u1' } }) }));

beforeEach(() => {
  localStorage.setItem('tsukutan.coach.v2.writing', '1');
  mockScore.mockReset();
});

const open = async () => {
  render(<EikenWriting grade="pre2" onExit={() => {}} />);
  await screen.findByRole('tab', { name: /意見論述/ });
};

test('タスクは本番の順（Eメール → 意見論述）で、Eメールから', async () => {
  await open();
  const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
  expect(tabs[0]).toMatch(/Eメール/);
  expect(tabs[1]).toMatch(/意見論述/);
});

test('Eメールの下線が下線で出る', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: /beach cleanup/ }));
  expect(screen.getByText('beach cleanup').tagName).toBe('U');
});

test('語数はその場で数え、範囲で色が変わる', async () => {
  await open();
  fireEvent.click(screen.getByRole('tab', { name: /意見論述/ }));
  fireEvent.click(screen.getByRole('button', { name: /study in the morning/ }));
  const area = screen.getByLabelText('解答');
  fireEvent.change(area, { target: { value: 'Yes I think so.' } });
  expect(screen.getByTestId('word-count').className).toContain('is-short');
  fireEvent.change(area, { target: { value: 'Yes I think so because it is good.' } });
  expect(screen.getByTestId('word-count').className).toContain('is-ok');
});

test('カンペを引いて分類を切り替え、閉じても書いた文は残る', async () => {
  await open();
  fireEvent.click(screen.getByRole('tab', { name: /意見論述/ }));
  fireEvent.click(screen.getByRole('button', { name: /study in the morning/ }));
  fireEvent.change(screen.getByLabelText('解答'), { target: { value: 'My answer' } });
  fireEvent.click(screen.getByRole('button', { name: 'カンペを開く' }));
  expect(screen.getByText('I have two reasons.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'つなぎ言葉' }));
  expect(screen.getByText('In addition,')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'カンペを閉じる' })[0]);
  expect(screen.getByLabelText('解答').value).toBe('My answer');
});

test('提出すると採点を頼み、点数だけの結果が出る', async () => {
  mockScore.mockResolvedValue({
    scores: { content: 3, organization: 2, vocabulary: 3, grammar: 2 }, total: 10, max: 16, flags: ['contractions'], words: 7,
  });
  await open();
  fireEvent.click(screen.getByRole('tab', { name: /意見論述/ }));
  fireEvent.click(screen.getByRole('button', { name: /study in the morning/ }));
  fireEvent.change(screen.getByLabelText('解答'), { target: { value: "Yes. I'm sure it is good." } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '提出して採点' })); });
  expect(mockScore).toHaveBeenCalledWith(expect.objectContaining({ grade: 'pre2', task: 'opinion', answer: "Yes. I'm sure it is good." }));
  await waitFor(() => expect(screen.getByText('10')).toBeInTheDocument());
  expect(screen.getByText(/短縮形があります/)).toBeInTheDocument();
});

describe('文ごとの間違い（2026-09-27）', () => {
  const { render, screen } = require('@testing-library/react');
  const WritingResult = require('./WritingResult').default;
  test('間違いのある文に種類とヒント。間違いの無い文には何も付けない', () => {
    render(<WritingResult
      result={{ total: 9, max: 16, scores: { content: 2, organization: 2, vocabulary: 3, grammar: 2 }, flags: [], words: 20,
        sentences: [{ text: 'I goes to library.', errors: ['agreement', 'spelling'] }, { text: 'So I think it is good.', errors: [] }] }}
      answer="I goes to library. So I think it is good." onRetry={() => {}} onBack={() => {}} />);
    expect(screen.getByText('I goes to library.').closest('li')).toHaveClass('has-error');
    expect(screen.getByText('主語と動詞の形')).toBeInTheDocument();
    expect(screen.getByText('つづり・大文字')).toBeInTheDocument();
    expect(screen.getByText('So I think it is good.').closest('li')).not.toHaveClass('has-error');
  });
});
