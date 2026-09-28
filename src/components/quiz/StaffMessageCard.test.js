import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StaffMessageCard from './StaffMessageCard';

const msg = { id: 'm1', text: '追試は月曜の放課後です', relatedTitle: 'LEAP No.1〜100', createdByName: '沖藤' };

test('メッセージが無ければ何も出さない', () => {
  const { container } = render(<StaffMessageCard messages={[]} onRead={jest.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

test('本文・関係するテスト・送った先生が出て、「読んだ」で親へ渡す', async () => {
  const onRead = jest.fn(async () => {});
  render(<StaffMessageCard messages={[msg]} onRead={onRead} />);
  expect(screen.getByText('追試は月曜の放課後です')).toBeInTheDocument();
  expect(screen.getByText('LEAP No.1〜100')).toBeInTheDocument();
  expect(screen.getByText(/沖藤先生/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '読んだ' }));
  await waitFor(() => expect(onRead).toHaveBeenCalledWith('m1'));
});

test('**送れなかったら、そう書く**（黙って消さない）', async () => {
  render(<StaffMessageCard messages={[msg]} onRead={async () => { throw new Error('offline'); }} />);
  fireEvent.click(screen.getByRole('button', { name: '読んだ' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('もう一度押してください');
});
