import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CoachModal, { cardCoachSteps } from './CoachModal';
import { studyModePolicy } from '../../logic/studyMode';

describe('カードの使い方（モーダル）', () => {
  it('**上へ払うは全部のモードで出し、新しい単語では「はっきり払う」と添える**', () => {
    const up = (mode) => cardCoachSteps(studyModePolicy(mode)).find((s) => s.key === 'up');
    expect(up('review').text).not.toContain('まっすぐ');
    expect(up('daily').text).toContain('大きくまっすぐ上へ払ったときだけ');
    expect(up('bookmark').text).toContain('大きくまっすぐ上へ払ったときだけ');
  });

  it('毎日みる単語では「覚えた＝毎日みるから外す」と言う', () => {
    const steps = cardCoachSteps(studyModePolicy('bookmark'));
    expect(steps.at(-1).title).toBe('「覚えた」ボタン');
    expect(steps.find((s) => s.key === 'up').text).toContain('毎日みる単語から外します');
  });

  it('「やってみる」で閉じる', () => {
    const onClose = jest.fn();
    render(<CoachModal kind="card" policy={studyModePolicy('daily')} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'やってみる' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('単語帳の使い方も開ける', () => {
    render(<CoachModal kind="wordbook" policy={studyModePolicy('review')} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: '単語帳の使い方' })).toBeInTheDocument();
    expect(screen.getByText('一覧で見わたす')).toBeInTheDocument();
  });
});

describe('単語力チェックテストの受け方（モーダル）', () => {
  it('わかる／わからないで説明する', () => {
    render(<CoachModal kind="test" onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: '単語力チェックテストの受け方' })).toBeInTheDocument();
    expect(screen.getAllByText('わかる').length).toBeGreaterThan(0);
  });
});
