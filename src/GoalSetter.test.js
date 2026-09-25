import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

/* **今日から数えて作る。** 固定の '2099-12-31' だと達成日の上限（今日+10年）に
   引っかかり、「未来の日付」のつもりが弾かれる。 */
const plusYears = (n) => {
  const d = new Date();
  return `${d.getFullYear() + n}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const futureDate = plusYears(1);
const tooFarDate = plusYears(11);
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
    expect(screen.getByText(/達成日は今日から\d{4}年までで選んでください。/)).toBeInTheDocument();
  });

  /* **上限が無いと年に5桁以上が入る。** 実際に `202701-03-01` が保存でき、
     ホームが「あと73294807日」を出した。日付としては妥当なので黙って通る。 */
  test('遠すぎる達成日では保存できない', () => {
    render(<GoalSetter />);
    fireEvent.click(screen.getByRole('button', { name: /英検3級 合格/ }));
    setDate(tooFarDate);
    expect(getSubmitButton()).toBeDisabled();
    expect(screen.getByText(/達成日は今日から\d{4}年までで選んでください。/)).toBeInTheDocument();
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

describe('新しい単語の教材', () => {
  // 目標の「英検2級 合格」と取り違えないよう、教材の欄の中だけを見る
  const section = () => within(screen.getByRole('heading', { name: '新しい単語の教材' }).closest('section'));
  const chip = (name) => section().getByRole('button', { name: new RegExp(name) });

  test('既定はおまかせで、保存すると null が入る（undefined にしない）', async () => {
    render(<GoalSetter />);
    expect(chip('おまかせ')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /英検3級 合格/ }));
    setDate(futureDate);
    fireEvent.click(getSubmitButton());
    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    expect(mockUpdateDoc.mock.calls[0][1].goal.newWordTextbook).toBeNull();
  });

  test('選んだ教材のIDを goal に保存する', async () => {
    render(<GoalSetter schoolGrade="高校2年生" />);
    fireEvent.click(chip('システム英単語'));
    expect(chip('システム英単語')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('おまかせ')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: /英検3級 合格/ }));
    setDate(futureDate);
    fireEvent.click(getSubmitButton());
    await waitFor(() => expect(mockUpdateDoc).toHaveBeenCalledTimes(1));
    expect(mockUpdateDoc.mock.calls[0][1].goal.newWordTextbook).toBe('book-systan5');
  });

  test('中学生には教科書と英検だけ出す', () => {
    render(<GoalSetter schoolGrade="中学1年生" />);
    expect(chip('Sunshine 1年')).toBeInTheDocument();
    expect(chip('英検準1級')).toBeInTheDocument();
    expect(section().queryByRole('button', { name: /システム英単語/ })).not.toBeInTheDocument();
  });

  test('高校生には単語帳と英検だけ出す', () => {
    render(<GoalSetter schoolGrade="高1" />);
    expect(chip('英単語ターゲット1900')).toBeInTheDocument();
    expect(chip('英検5級')).toBeInTheDocument();
    expect(section().queryByRole('button', { name: /Sunshine/ })).not.toBeInTheDocument();
  });

  test('学年が分からなければ全部出す', () => {
    render(<GoalSetter />);
    expect(chip('Sunshine 3年')).toBeInTheDocument();
    expect(chip('必携英単語LEAP')).toBeInTheDocument();
    expect(chip('英検2級')).toBeInTheDocument();
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
