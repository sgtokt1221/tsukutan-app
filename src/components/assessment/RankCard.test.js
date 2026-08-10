import { fireEvent, render, screen, within } from '@testing-library/react';
import RankCard from './RankCard';

describe('RankCard compact rank journey', () => {
  test('shows the current position across all seven ranks', () => {
    render(<RankCard score={518} compact />);

    // ホームは「全7段階の4番目」ではなく、外の物差しでの位置を出す
    expect(screen.getByText('英検準2級〜準2級プラス')).toBeInTheDocument();
    expect(screen.getByText('TOEIC 385〜545 相当')).toBeInTheDocument();
    expect(screen.getByText('次の A まで あと 57')).toBeInTheDocument();

    const journey = screen.getByLabelText('ランクの全体マップ。B ランク、全7段階の4番目');
    const steps = within(journey).getAllByRole('listitem');
    expect(steps).toHaveLength(7);
    expect(steps.map((step) => step.getAttribute('aria-label'))).toEqual([
      'E ランク', 'D ランク', 'C ランク', 'B ランク（現在）', 'A ランク', 'S ランク', 'SS ランク',
    ]);
    expect(screen.getByLabelText('B ランク（現在）')).toHaveAttribute('aria-current', 'step');
    const heroBadge = screen.getAllByLabelText('ランク B')[0];
    expect(within(heroBadge).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      '/brand/rank-badges-pop-v3/rank-b.png',
    );
    expect(
      screen.getByRole('progressbar', { name: 'E から SS までの現在位置。B ランク、全7段階の4番目' }),
    ).toHaveAttribute('aria-valuenow', '60');
  });

  test('keeps SS visible as a quiet destination instead of awarding it', () => {
    render(<RankCard score={900} compact />);

    expect(screen.getByLabelText('S ランク（現在）')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByLabelText('SS ランク')).toBeInTheDocument();
    expect(screen.queryByText('準備中')).not.toBeInTheDocument();
  });

  test('shows the complete route and starts the assessment when unmeasured', () => {
    const onRetest = jest.fn();
    render(<RankCard score={null} compact onRetest={onRetest} />);

    expect(screen.getByText('まだ未測定です')).toBeInTheDocument();
    expect(screen.getByText('実力テストからランクの旅を始めよう')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(7);

    fireEvent.click(screen.getByRole('button', { name: '実力テストを受ける' }));
    expect(onRetest).toHaveBeenCalledTimes(1);
  });

  test('runs retest action from the compact card', () => {
    const onRetest = jest.fn();
    render(<RankCard score={610} compact onRetest={onRetest} />);

    fireEvent.click(screen.getByRole('button', { name: '測り直す' }));
    expect(onRetest).toHaveBeenCalledTimes(1);
  });
});
