import { renderHook, act } from '@testing-library/react';
import { useSeenOnce, resetAllCoaches, coachKeyFor } from './useSeenOnce';
import { useOnboarding } from './useOnboarding';
import { studyModePolicy } from './studyMode';

beforeEach(() => localStorage.clear());

describe('学習画面の中の案内', () => {
  it('動きが同じモードは同じ鍵（今日の新規とおかわり／復習と自由学習）', () => {
    expect(coachKeyFor(studyModePolicy('daily'))).toBe(coachKeyFor(studyModePolicy('extra')));
    expect(coachKeyFor(studyModePolicy('review'))).toBe(coachKeyFor(studyModePolicy('free')));
    expect(coachKeyFor(studyModePolicy('daily'))).not.toBe(coachKeyFor(studyModePolicy('review')));
    expect(coachKeyFor(studyModePolicy('bookmark'))).not.toBe(coachKeyFor(studyModePolicy('daily')));
  });

  it('1回見たら出さない', () => {
    const { result } = renderHook(() => useSeenOnce('card.flat.graduate'));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(renderHook(() => useSeenOnce('card.flat.graduate')).result.current[0]).toBe(true);
  });

  it('**「使い方を見る」で、案内を全部もう一度出す**（ほかの保存は消さない）', () => {
    localStorage.setItem('tsukutan.coach.v2.wordbook', '1');
    localStorage.setItem('tsukutan.coach.v2.card.up.graduate', '1');
    localStorage.setItem('wordbook_progress_default_all', '12');
    resetAllCoaches();
    expect(localStorage.getItem('tsukutan.coach.v2.wordbook')).toBeNull();
    expect(localStorage.getItem('tsukutan.coach.v2.card.up.graduate')).toBeNull();
    expect(localStorage.getItem('wordbook_progress_default_all')).toBe('12');
  });
});

describe('最初の案内', () => {
  it('見終わったら閉じ、メニューから開き直せる', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    localStorage.setItem('tsukutan.coach.v2.wordbook', '1');
    act(() => result.current[2]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('tsukutan.coach.v2.wordbook')).toBeNull();
  });
});
