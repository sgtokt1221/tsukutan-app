import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// firebaseConfig は gitignore 済みの実ファイルを読ませたくないので、
// モジュールファクトリごと差し替える（実モジュールは一切読み込まれない）。
const mockUpdateDoc = jest.fn();
const mockUpdateProgress = jest.fn();

jest.mock('./firebaseConfig', () => ({
  auth: { currentUser: { uid: 'student-a' } },
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: (...args) => ({ path: args.slice(1).join('/') }),
  updateDoc: (...args) => mockUpdateDoc(...args),
}));

jest.mock('./logic/progressLogic', () => ({
  updateProgressPercentage: (...args) => mockUpdateProgress(...args),
}));

// eslint-disable-next-line import/first
import GoalSetter from './GoalSetter';

const futureDate = '2099-12-31';
const pastDate = '2000-01-01';

beforeEach(() => {
  mockUpdateDoc.mockReset().mockResolvedValue(undefined);
  mockUpdateProgress.mockReset().mockResolvedValue(undefined);
});

const getSubmitButton = () => screen.getByRole('button', { name: /目標を設定する/ });
const setDate = (value) => fireEvent.change(screen.getByLabelText('達成日'), { target: { value } });

describe('保存できる条件', () => {
  test('初期状態では保存できない', () => {
    render(<GoalSetter />);
    expect(getSubmitButton()).toBeDisabled();
    expect(screen.getByText('目標を1つ以上選んでください。')).toBeInTheDocument();
  });

  test('目標だけ選んでも達成日が無ければ保存できない', () => {
    render(<GoalSetter />);
    fireEvent.click(screen.getByRole('button', { name: /英検3級 合格/ }));
    expect(getSubmitButton()).toBeDisabled();
  });

  test('達成日だけ入れても目標が無ければ保存できない', () => {
    render(<GoalSetter />);
    setDate(futureDate);
    expect(getSubmitButton()).toBeDisabled();
  });

  test('過去の達成日では保存できない', () => {
    render(<GoalSetter />);
    fireEvent.click(screen.getByRole('button', { name: /英検3級 合格/ }));
    setDate(pastDate);
    expect(getSubmitButton()).toBeDisabled();
    expect(screen.getByText('達成日は今日以降を選んでください。')).toBeInTheDocument();
  });

  test('目標1件以上 + 今日以降の達成日で保存できるようになる', () => {
    render(<GoalSetter />);
    fireEvent.click(screen.getByRole('button', { name: /英検3級 合格/ }));
    setDate(futureDate);
    expect(getSubmitButton()).toBeEnabled();
  });
});

describe('選択状態', () => {
  test('目標チップの選択が aria-pressed に出る', () => {
    render(<GoalSetter />);
    const chip = screen.getByRole('button', { name: /英検3級 合格/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  test('やる気レベルは既定が普通で、選ぶと切り替わる', () => {
    render(<GoalSetter />);
    const normal = screen.getByRole('button', { name: /普通/ });
    const high = screen.getByRole('button', { name: /やる気満々/ });
    expect(normal).toHaveAttribute('aria-pressed', 'true');
    expect(high).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(high);
    expect(high).toHaveAttribute('aria-pressed', 'true');
    expect(normal).toHaveAttribute('aria-pressed', 'false');
  });

  test('やる気レベルの表示値は設定ファイル由来', () => {
    render(<GoalSetter />);
    expect(screen.getByText('新規: 15語/日')).toBeInTheDocument();
    expect(screen.getByText('新規: 20語/日')).toBeInTheDocument();
    expect(screen.getByText('新規: 30語/日')).toBeInTheDocument();
  });
});

describe('保存', () => {
  test('選んだ目標と達成日を保存し、進捗率を更新する', async () => {
    const onGoalSet = jest.fn();
    render(<GoalSetter onGoalSet={onGoalSet} />);

    fireEvent.click(screen.getByRole('button', { name: /英検3級 合格/ }));
    fireEvent.click(screen.getByRole('button', { name: /高校入試（偏差値50）合格/ }));
    setDate(futureDate);
    fireEvent.click(getSubmitButton());

    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));

    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.goal.isSet).toBe(true);
    expect(payload.goal.targetDate).toBe(futureDate);
    expect(payload.goal.motivationLevel).toBe('normal');
    expect(payload.goal.targets).toEqual([
      { goalId: 'eiken_3', displayName: '英検3級 合格' },
      { goalId: 'hs_50', displayName: '高校入試（偏差値50）合格' },
    ]);

    await waitFor(() => expect(mockUpdateProgress).toHaveBeenCalledWith('student-a'));
    expect(onGoalSet).toHaveBeenCalled();
  });

  test('保存中は二重送信できない', async () => {
    let resolveSave;
    mockUpdateDoc.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));

    render(<GoalSetter />);
    fireEvent.click(screen.getByRole('button', { name: /英検3級 合格/ }));
    setDate(futureDate);

    const submit = getSubmitButton();
    fireEvent.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);

    resolveSave();
    await waitFor(() => expect(mockUpdateProgress).toHaveBeenCalled());
  });

  test('保存に失敗したら画面内にエラーを出し、完了扱いにしない', async () => {
    mockUpdateDoc.mockRejectedValue(new Error('offline'));
    const onGoalSet = jest.fn();
    render(<GoalSetter onGoalSet={onGoalSet} />);

    fireEvent.click(screen.getByRole('button', { name: /英検3級 合格/ }));
    setDate(futureDate);
    fireEvent.click(getSubmitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('目標の保存に失敗しました');
    expect(onGoalSet).not.toHaveBeenCalled();
  });
});

describe('目標一覧の出どころ', () => {
  test('共通定義の14目標が3カテゴリで表示される', () => {
    render(<GoalSetter />);
    for (const heading of ['英検', '高校入試', '大学入試']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/目安: [\d,]+語/)).toHaveLength(14);
  });
});
