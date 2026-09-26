/**
 * 管理者がつくつくに入ったときは、つくばホームへの案内だけを出す（2026-09-23）。
 * 生徒を見る場所はつくばホームの管理者ポータルに一本化した。
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import AdminMoved, { TSUKUBA_ADMIN_URL } from './AdminMoved';

jest.mock('./firebaseConfig.js', () => ({ auth: { signOut: () => Promise.resolve() } }));

test('つくばホームの管理者ポータルへ案内する', () => {
  render(<AdminMoved />);
  expect(screen.getByText('管理はつくばホームへ移りました')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '管理者ポータルを開く' })).toHaveAttribute('href', TSUKUBA_ADMIN_URL);
  expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument();
});
