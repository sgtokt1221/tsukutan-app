/**
 * 単語カードの指の動き（2026-09-23）。
 *
 * - 上スワイプ（外す）は**復習と自由学習だけ**。今日の新規では語が消えない
 * - 毎日みる単語の「外す」は★を外すだけ。覚えた記録にしない
 * - **1回のタップでめくる**（以前は2回タップでしかめくれなかった）
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import StudyFlashcard from './StudyFlashcard';

// **CRA は resetMocks: true。** jest.fn に渡した中身はテストのたびに消えるので、
// 呼ばれ方の記録にだけ jest.fn を使い、中身はふつうの関数で持つ
const mockUpdate = jest.fn();
const mockToggle = jest.fn();
const mockActivity = jest.fn();
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

const INFO = { textbookId: 'ターゲット1900', filterType: 'range', filterValue: '1〜100' };
const show = (learningMode, props = {}) => render(
  <StudyFlashcard words={WORDS} onBack={() => {}} learningMode={learningMode}
    sessionInfo={INFO} {...props} />,
);

const click = (name) => act(() => { fireEvent.click(screen.getByRole('button', { name })); });
/** いま表に出ている語 */
const front = () => document.getElementById('card-front-text').textContent;

/** カードの上で指を置いて、dx / dy 動かして離す */
const swipe = (dx, dy) => {
  const card = document.getElementById('flashcard');
  act(() => { fireEvent.touchStart(card, { touches: [{ clientX: 200, clientY: 300 }] }); });
  act(() => { fireEvent.touchMove(card, { touches: [{ clientX: 200 + dx, clientY: 300 + dy }] }); });
  act(() => { fireEvent.touchEnd(card, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] }); });
};

/** 分母（全部で何語か）。外すと減る */
const total = () => screen.getByText(/\/\s*3|\/\s*2/).textContent;

beforeEach(() => {
  jest.clearAllMocks();
  mockActiveMs = 0;
});

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

describe('記録（新規）', () => {
  it('新規として数える', () => {
    show('daily');
    click('わかった');
    expect(mockActivity).toHaveBeenCalledWith('new');
  });

  it('**最後まで答えたら記録して閉じる**（新規の形。graduatedCount は載せない）', async () => {
    const onSaveLog = jest.fn();
    const onBack = jest.fn();
    const onFirstCompletion = jest.fn();
    show('daily', { onSaveLog, onBack, onFirstCompletion });
    click('わかった');
    click('もう一度');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'わかった' })); });
    expect(onFirstCompletion).toHaveBeenCalledTimes(1);
    expect(onSaveLog.mock.calls[0][0]).toMatchObject({ ...INFO, index: 2 });
    expect(onSaveLog.mock.calls[0][0]).not.toHaveProperty('graduatedCount');
    // 間違えた語を親へ返す
    expect(onBack.mock.calls[0][0].map((w) => w.id)).toEqual(['w2']);
  });

  /*
    **フラッシュカードの「終了」も記録を通る**（2026-09-23 に直した）。
    以前はここだけ記録を飛ばしていたので、自由学習の続きの位置が保存されなかった。
  */
  it('**フラッシュカードで「終了」しても、続きの位置を記録する**', () => {
    const onSaveLog = jest.fn();
    mockActiveMs = 4000;
    show('free', { onSaveLog });
    click('わかった');
    click('終了');
    expect(onSaveLog).toHaveBeenCalledTimes(1);
    expect(onSaveLog.mock.calls[0][0]).toMatchObject({ ...INFO, index: 1, duration: 4000 });
  });
});

describe('外したあとの位置', () => {
  /*
    **外しても開始位置へ戻らない**（2026-09-23 に直した）。以前は並びの長さが
    変わるたびに開始位置（前回の続き）を入れ直していた。
  */
  it('**続きから始めて1語外すと、次の語が出る**（開始位置へ戻らない）', () => {
    show('free', { initialIndex: 1 });
    expect(front()).toBe('banana');
    click(/もう覚えた/);
    expect(front()).toBe('cherry');
  });

  it('**最後の1語を外したら、記録して閉じる**', async () => {
    const onSaveLog = jest.fn();
    const onBack = jest.fn();
    show('free', { initialIndex: 2, onSaveLog, onBack });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /もう覚えた/ })); });
    expect(onSaveLog).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalled();
  });
});

describe('単語帳', () => {
  /** 単語帳の n 枚目を、マウスで横に払う */
  const swipeWordbookCard = (index, dx) => {
    const card = document.querySelector(`[data-card-index="${index}"]`);
    act(() => { fireEvent.mouseDown(card, { clientX: 100, clientY: 100 }); });
    act(() => { fireEvent.mouseMove(document, { clientX: 100 + dx, clientY: 100 }); });
    act(() => { fireEvent.mouseUp(document, { clientX: 100 + dx, clientY: 100 }); });
  };

  /*
    **採点の色は単語で覚える**（2026-09-23 に直した）。以前は並びの番号で覚えていて、
    1語外すと後ろが繰り上がり、色が隣のカードへずれていた。
  */
  it('**手前の語を外しても、採点の色は同じ語に残る**', () => {
    show('free');
    act(() => { fireEvent.click(screen.getByRole('tab', { name: '単語帳' })); });
    swipeWordbookCard(1, 120); // banana を「わかった」
    expect(document.querySelector('[data-card-index="1"]').className).toContain('wordbook-card--correct');
    act(() => { fireEvent.click(screen.getByRole('button', { name: /^apple：もう覚えた/ })); });
    const banana = document.querySelector('[data-card-index="0"]');
    expect(banana.textContent).toContain('banana');
    expect(banana.className).toContain('wordbook-card--correct');
    expect(document.querySelector('[data-card-index="1"]').className).not.toContain('wordbook-card--');
  });
});

describe('見直しで直したこと', () => {
  const toWordbook = () => act(() => { fireEvent.click(screen.getByRole('tab', { name: '単語帳' })); });
  const toFlashcard = () => act(() => { fireEvent.click(screen.getByRole('tab', { name: 'フラッシュカード' })); });

  /*
    **単語帳で外しても、一覧ごと消えない**（見直しで見つけた）。
    フラッシュカードの位置が並びの長さを超え、「単語がありません」に替わっていた。
  */
  it('**カードの途中から単語帳で2語外しても、残りの語が出る**', () => {
    show('free', { initialIndex: 2 });
    toWordbook();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /^apple：もう覚えた/ })); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /^banana：もう覚えた/ })); });
    expect(screen.queryByText('学習する単語がありません。')).toBeNull();
    expect(document.querySelector('[data-card-index="0"]').textContent).toContain('cherry');
    toFlashcard();
    expect(front()).toBe('cherry');
  });

  it('**単語帳で手前の語を外しても、フラッシュカードの語は飛ばない**', () => {
    show('free', { initialIndex: 1 });
    expect(front()).toBe('banana');
    toWordbook();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /^apple：もう覚えた/ })); });
    toFlashcard();
    expect(front()).toBe('banana');
  });

  /*
    **閉じる最中に押しても2回閉じない**（見直しで見つけた）。
    最後の1語のあと書き込みを待つあいだ、ボタンが残っていた。
  */
  it('**最後の1語を答えたら「保存しています」に替わり、閉じるのは1回だけ**', async () => {
    const onBack = jest.fn();
    const onSaveLog = jest.fn();
    show('free', { initialIndex: 2, onBack, onSaveLog });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'わかった' })); });
    expect(screen.getByText('保存しています…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'わかった' })).toBeNull();
    await act(async () => {});
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSaveLog).toHaveBeenCalledTimes(1);
  });
});
