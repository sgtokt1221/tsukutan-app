/**
 * 復習カードの振る舞いを固定する（2026-09-23）。
 *
 * 新規と復習の部品を1つにまとめる前に、復習（ReviewFlashcard、2026-09-23 に削除）の動きをここに書き留め、
 * まとめた部品（StudyFlashcard の learningMode="review"）で同じテストが通ることを確かめた。
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import StudyFlashcard from './StudyFlashcard';

// **CRA は resetMocks: true。** jest.fn の中身はテストのたびに消えるので、
// 呼ばれ方の記録にだけ jest.fn を使い、中身はふつうの関数で持つ
const mockUpdate = jest.fn();
const mockActivity = jest.fn();
const mockFlipSpeak = jest.fn();
let mockActiveMs = 0;

jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'u1' } }) }));
jest.mock('./logic/reviewLogic', () => ({
  updateUserWordProgress: (...args) => { mockUpdate(...args); return Promise.resolve({}); },
  undoWordProgress: () => Promise.resolve(),
}));
jest.mock('./logic/studySession.js', () => ({
  startStudySession: () => {},
  endStudySession: () => ({ activeMs: mockActiveMs }),
  noteActivity: (...args) => mockActivity(...args),
}));
jest.mock('./logic/speechUtils', () => ({
  ...jest.requireActual('./logic/speechUtils'),
  initialize: () => Promise.resolve(),
  speak: () => {},
  stopSpeaking: () => {},
  // めくると英語→意味を読み上げる。めくれたかどうかはこれで見る
  speakWordThenMeaning: (...args) => mockFlipSpeak(...args),
}));
jest.mock('./logic/audioLibrary', () => ({ prefetchClips: () => {} }));
jest.mock('./logic/useBookmarks', () => ({
  useBookmarks: () => ({ isBookmarked: () => false, toggle: () => {} }),
}));

const WORDS = [
  { id: 'w1', word: 'apple', meaning: 'りんご' },
  { id: 'w2', word: 'banana', meaning: 'バナナ' },
  { id: 'w3', word: 'cherry', meaning: 'さくらんぼ' },
];
const INFO = { textbookId: '今日のタスク', filterType: '復習単語', filterValue: '3語', startIndex: 0 };

const show = (props = {}) => render(
  <StudyFlashcard words={WORDS} onBack={() => {}} sessionInfo={INFO} learningMode="review" {...props} />,
);

/** カードの上で指を置いて、dx / dy 動かして離す */
const swipe = (dx, dy) => {
  const card = document.getElementById('flashcard');
  act(() => { fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 300 }] }); });
  act(() => { fireEvent.touchMove(card, { touches: [{ clientX: 200 + dx, clientY: 300 + dy }] }); });
  act(() => { fireEvent.touchEnd(card, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] }); });
};

const click = (name) => act(() => { fireEvent.click(screen.getByRole('button', { name })); });

beforeEach(() => {
  jest.clearAllMocks();
  mockActiveMs = 0;
});

describe('答える', () => {
  it('わかった：復習として記録する', () => {
    show();
    click('わかった');
    expect(mockActivity).toHaveBeenCalledWith('review');
    expect(mockUpdate).toHaveBeenCalledWith('u1', expect.objectContaining({ id: expect.any(String) }), 'good', false, undefined, { revealed: false });
  });

  it('もう一度：again で記録する', () => {
    show();
    click('もう一度');
    expect(mockActivity).toHaveBeenCalledWith('review');
    expect(mockUpdate).toHaveBeenCalledWith('u1', expect.anything(), 'again', false, undefined, { revealed: false });
  });

  it('右スワイプ＝わかった', () => {
    show();
    swipe(150, 0);
    expect(mockUpdate).toHaveBeenCalledWith('u1', expect.anything(), 'good', false, undefined, expect.anything());
  });
});

describe('外す・めくる', () => {
  it('**上スワイプで「もう覚えた」**（復習は効く）', () => {
    show();
    swipe(0, -200);
    expect(mockUpdate).toHaveBeenCalledWith('u1', expect.anything(), true, true);
  });

  it('「もう覚えた」ボタンも同じ', () => {
    show();
    click(/もう覚えた/);
    expect(mockUpdate).toHaveBeenCalledWith('u1', expect.anything(), true, true);
  });

  it('1回のタップでめくれる', () => {
    show();
    swipe(0, 0);
    expect(mockFlipSpeak).toHaveBeenCalledTimes(1);
  });
});

describe('記録', () => {
  it('**最後まで答えたら記録して閉じる**（わかったの数を graduatedCount に入れる）', async () => {
    const onSaveLog = jest.fn();
    const onBack = jest.fn();
    show({ onSaveLog, onBack });
    click('わかった');
    click('わかった');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'わかった' })); });
    expect(onSaveLog).toHaveBeenCalledTimes(1);
    expect(onSaveLog.mock.calls[0][0]).toMatchObject({ ...INFO, index: 2, graduatedCount: 3 });
    expect(onBack).toHaveBeenCalled();
  });

  it('**途中で終了したら durationInSeconds の形で記録する**（5秒を超えたときだけ）', () => {
    const onSaveLog = jest.fn();
    const onBack = jest.fn();
    mockActiveMs = 12_000;
    show({ onSaveLog, onBack });
    click('わかった');
    click('終了');
    expect(onSaveLog).toHaveBeenCalledTimes(1);
    expect(onSaveLog.mock.calls[0][0]).toMatchObject({
      ...INFO, wordsReviewed: 2, wordsGraduated: 1, durationInSeconds: 12,
    });
    expect(onBack).toHaveBeenCalled();
  });

  it('5秒以下なら途中終了は記録しない', () => {
    const onSaveLog = jest.fn();
    mockActiveMs = 3_000;
    show({ onSaveLog });
    click('わかった');
    click('終了');
    expect(onSaveLog).not.toHaveBeenCalled();
  });
});

describe('見出し', () => {
  it('「復習」と出る', () => {
    show();
    expect(screen.getByText('復習')).toBeInTheDocument();
  });
});

describe('まとめたときに直したこと（復習）', () => {
  /*
    **最後の1語を「もう覚えた」にしても記録を通る**（2026-09-23 に直した）。
    以前は書き込みを待って閉じるだけで、記録を飛ばしていた。
  */
  it('**最後の1語を「もう覚えた」にしたら、記録して閉じる**', async () => {
    const onSaveLog = jest.fn();
    const onBack = jest.fn();
    show({ onSaveLog, onBack });
    click('わかった');
    click('わかった');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /もう覚えた/ })); });
    expect(onSaveLog).toHaveBeenCalledTimes(1);
    expect(onSaveLog.mock.calls[0][0]).toMatchObject({ graduatedCount: 3 });
    expect(onBack).toHaveBeenCalled();
  });

  /*
    **「もう覚えた」は一覧から外す**（2026-09-23 に直した）。以前は進むだけで、
    「前の単語」で戻ると外したはずの語が出てきた。
  */
  it('**「もう覚えた」にした語は、「前の単語」で戻っても出てこない**', () => {
    show();
    const first = document.getElementById('card-front-text').textContent;
    click('わかった');
    const second = document.getElementById('card-front-text').textContent;
    click(/もう覚えた/);
    click(/前の単語/);
    expect(document.getElementById('card-front-text').textContent).toBe(first);
    click('わかった');
    expect(document.getElementById('card-front-text').textContent).not.toBe(second);
  });
});
