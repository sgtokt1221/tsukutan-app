/**
 * 単語カードの指の動き（2026-09-23）。
 *
 * - 上スワイプ（外す）は**復習と自由学習だけ**。今日の新規では語が消えない
 * - 毎日みる単語の「外す」は★を外すだけ。覚えた記録にしない
 * - **1回のタップでめくる**（以前は2回タップでしかめくれなかった）
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LearningFlashcard from './LearningFlashcard';

// **CRA は resetMocks: true。** jest.fn に渡した中身はテストのたびに消えるので、
// 呼ばれ方の記録にだけ jest.fn を使い、中身はふつうの関数で持つ
const mockUpdate = jest.fn();
const mockToggle = jest.fn();

jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'u1' } }) }));
jest.mock('./logic/reviewLogic', () => ({
  updateUserWordProgress: (...args) => { mockUpdate(...args); return Promise.resolve({}); },
  undoWordProgress: () => Promise.resolve(),
}));
jest.mock('./logic/studySession.js', () => ({
  startStudySession: () => {},
  endStudySession: () => ({ activeMs: 0 }),
  noteActivity: () => {},
}));
const mockFlipSpeak = jest.fn();
jest.mock('./logic/speechUtils', () => ({
  ...jest.requireActual('./logic/speechUtils'),
  initialize: () => Promise.resolve(),
  speak: () => {},
  stopSpeaking: () => {},
  // めくると英語→意味を読み上げる。**めくれたかどうかはこれで見る**
  //（framer-motion の回転は jsdom では style に出ない）
  speakWordThenMeaning: (...args) => mockFlipSpeak(...args),
}));
jest.mock('./logic/audioLibrary', () => ({ prefetchClips: () => {} }));
jest.mock('./logic/useBookmarks', () => ({
  useBookmarks: () => ({ isBookmarked: () => true, toggle: (...args) => mockToggle(...args) }),
}));

const WORDS = [
  { id: 'w1', word: 'apple', meaning: 'りんご', japanese: 'りんご' },
  { id: 'w2', word: 'banana', meaning: 'バナナ', japanese: 'バナナ' },
  { id: 'w3', word: 'cherry', meaning: 'さくらんぼ', japanese: 'さくらんぼ' },
];

const show = (learningMode) => render(
  <LearningFlashcard words={WORDS} onBack={() => {}} learningMode={learningMode}
    sessionInfo={{ textbookId: 'ターゲット1900', filterValue: '1〜100' }} />,
);

/** カードの上で指を置いて、dx / dy 動かして離す */
const swipe = (dx, dy) => {
  const card = document.getElementById('flashcard');
  act(() => { fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 300 }] }); });
  act(() => { fireEvent.touchMove(card, { touches: [{ clientX: 200 + dx, clientY: 300 + dy }] }); });
  act(() => { fireEvent.touchEnd(card, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] }); });
};

/** 分母（全部で何語か）。外すと減る */
const total = () => screen.getByText(/\/\s*3|\/\s*2/).textContent;

beforeEach(() => { jest.clearAllMocks(); });

describe('上スワイプ', () => {
  it('**今日の新規では効かない。** 語は消えず、覚えた記録も付かない', () => {
    show('daily');
    swipe(0, -200);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(document.body.textContent).toMatch(/3/);
    expect(total()).toMatch(/3/);
  });

  it('**自由学習では効く。** もう覚えたとして外す', () => {
    show('free');
    swipe(0, -200);
    expect(mockUpdate).toHaveBeenCalledWith('u1', expect.anything(), true, true);
    expect(total()).toMatch(/2/);
  });

  it('**毎日みる単語では効かない**', () => {
    show('bookmark');
    swipe(0, -200);
    expect(mockToggle).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('外すボタン', () => {
  it('**毎日みる単語では★を外すだけ**（覚えた記録にしない）', () => {
    show('bookmark');
    fireEvent.click(screen.getByRole('button', { name: /覚えた（毎日みるから外す）/ }));
    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(total()).toMatch(/2/);
  });

  it('今日の新規では「もう覚えた」', () => {
    show('daily');
    fireEvent.click(screen.getByRole('button', { name: /もう覚えた/ }));
    expect(mockUpdate).toHaveBeenCalledWith('u1', expect.anything(), true, true);
  });
});

describe('めくる', () => {
  it('**1回のタップでめくれる**', () => {
    show('daily');
    swipe(0, 0);
    expect(mockFlipSpeak).toHaveBeenCalledTimes(1);
  });

  it('**スワイプではめくれない**（左右は採点）', () => {
    show('daily');
    swipe(150, 0);
    expect(mockFlipSpeak).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith('u1', expect.anything(), 'good', false, undefined, expect.anything());
  });
});

describe('見出し', () => {
  it('**どのモードかが出る**', () => {
    show('free');
    expect(screen.getByText('ターゲット1900 1〜100')).toBeInTheDocument();
  });
});
