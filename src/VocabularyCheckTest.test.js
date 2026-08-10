import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockUpdateDoc = jest.fn();
const mockLogStudySession = jest.fn();
const mockUpdateProgress = jest.fn();
const mockUpdateUserWordProgress = jest.fn();
const mockNavigate = jest.fn();

jest.mock('./firebaseConfig', () => ({
  auth: { currentUser: { uid: 'student-a' } },
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: (...args) => ({ path: args.slice(1).join('/') }),
  updateDoc: (...args) => mockUpdateDoc(...args),
  serverTimestamp: () => 'server-timestamp',
}));

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('./logic/reviewLogic', () => ({
  updateUserWordProgress: (...args) => mockUpdateUserWordProgress(...args),
}));
jest.mock('./logic/studyLogger', () => ({ logStudySession: (...args) => mockLogStudySession(...args) }));
jest.mock('./logic/progressLogic', () => ({ updateProgressPercentage: (...args) => mockUpdateProgress(...args) }));
jest.mock('./logic/speechUtils', () => ({ initialize: () => Promise.resolve(), speak: jest.fn() }));

// eslint-disable-next-line import/first
import VocabularyCheckTest from './VocabularyCheckTest';

/** eikenLevels に文字列を混ぜた単語データ */
const WORDS = [];
for (let level = 1; level <= 7; level += 1) {
  for (let i = 0; i < 40; i += 1) {
    WORDS.push({
      id: `w_L${level}_${i}`,
      word: `word-${level}-${i}`,
      partOfSpeech: '名',
      meaning: `意味${level}-${i}`,
      level,
      eikenLevels: level >= 5 ? ['pre1', 'pre2', 2] : [5, 4],
    });
  }
}

const clickKnow = () => fireEvent.click(screen.getByRole('button', { name: 'わかる' }));
const clickDontKnow = () => fireEvent.click(screen.getByRole('button', { name: 'わからない' }));

/** 「3 / 10」のような進捗表示を読む */
const progress = () => {
  const match = screen.getByText(/^\d+ \/ \d+$/).textContent.match(/(\d+) \/ (\d+)/);
  return { index: Number(match[1]), total: Number(match[2]) };
};
const stageLabel = () => screen.getByText(/^ステージ \d+ \/ 10$/).textContent;
/** カードは表と裏の両方に語を持つので、先頭（表）だけを読む */
const currentWordText = () => screen.getAllByText(/^word-/)[0].textContent;

beforeEach(() => {
  mockUpdateDoc.mockReset().mockResolvedValue(undefined);
  mockLogStudySession.mockReset().mockResolvedValue(undefined);
  mockUpdateProgress.mockReset().mockResolvedValue(undefined);
  mockUpdateUserWordProgress.mockReset().mockResolvedValue(undefined);
  mockNavigate.mockReset();
});

describe('出題', () => {
  test('ステージ1は5問で始まる', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);
    expect(progress()).toEqual({ index: 1, total: 5 });
    expect(stageLabel()).toBe('ステージ 1 / 10');
  });

  test('pre1 / pre2 を含むデータでも例外にならず出題される', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);
    expect(currentWordText()).toMatch(/^word-/);
  });

  test('回答するたびに1問ずつ進む', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);
    clickKnow();
    expect(progress()).toEqual({ index: 2, total: 5 });
    clickDontKnow();
    expect(progress()).toEqual({ index: 3, total: 5 });
  });
});

describe('ステージ途中でリセットされない', () => {
  test('5問目まで進んでも問題番号も正答率も巻き戻らない', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);

    for (let i = 1; i <= 4; i += 1) {
      expect(progress().index).toBe(i);
      clickKnow();
    }
    // 5問目に到達している
    expect(progress()).toEqual({ index: 5, total: 5 });
    expect(screen.getByText(/これまでの正答率: 100%（4問）/)).toBeInTheDocument();
  });

  test('ステージ1を終えるとステージ2の10問に進み、履歴は残る', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);
    for (let i = 0; i < 5; i += 1) clickKnow();

    expect(stageLabel()).toBe('ステージ 2 / 10');
    expect(progress()).toEqual({ index: 1, total: 10 });
    expect(screen.getByText(/これまでの正答率: 100%（5問）/)).toBeInTheDocument();
  });

  test('全問正解するとステージ2の出題レベルが上がる', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);
    expect(screen.getByText(/出題レベル: 3 \/ 7/)).toBeInTheDocument();
    for (let i = 0; i < 5; i += 1) clickKnow();
    expect(screen.getByText(/出題レベル: 4 \/ 7/)).toBeInTheDocument();
  });

  test('全問不正解するとステージ2の出題レベルが下がる', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);
    for (let i = 0; i < 5; i += 1) clickDontKnow();
    expect(screen.getByText(/出題レベル: 2 \/ 7/)).toBeInTheDocument();
  });
});

describe('同じ単語を二度出さない', () => {
  test('ステージ1とステージ2で出題が重複しない', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);
    const seen = new Set();

    for (let i = 0; i < 5; i += 1) {
      seen.add(currentWordText());
      clickKnow();
    }
    for (let i = 0; i < 10; i += 1) {
      const word = currentWordText();
      expect(seen.has(word)).toBe(false);
      seen.add(word);
      clickKnow();
    }
  });
});

describe('前の問題へ戻る', () => {
  test('最初の問題では戻れない', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);
    expect(screen.getByRole('button', { name: /前の問題/ })).toBeDisabled();
  });

  test('戻ると回答が1件取り消される', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);
    clickKnow();
    clickKnow();
    expect(screen.getByText(/これまでの正答率: 100%（2問）/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /前の問題/ }));
    expect(progress().index).toBe(2);
    expect(screen.getByText(/これまでの正答率: 100%（1問）/)).toBeInTheDocument();
  });
});

describe('不正解の単語', () => {
  test('復習リストへ登録される', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);
    const word = currentWordText();
    clickDontKnow();
    expect(mockUpdateUserWordProgress).toHaveBeenCalledTimes(1);
    const [uid, passedWord, isCorrect] = mockUpdateUserWordProgress.mock.calls[0];
    expect(uid).toBe('student-a');
    expect(passedWord.word).toBe(word);
    expect(isCorrect).toBe(false);
  });

  test('正解では登録されない', () => {
    render(<VocabularyCheckTest allWords={WORDS} />);
    clickKnow();
    expect(mockUpdateUserWordProgress).not.toHaveBeenCalled();
  });
});

describe('保存', () => {
  /** 正答率50%で進めるとレベルが動かず、15問を超えたところで終了する */
  const playUntilComplete = () => {
    for (let i = 0; i < 60; i += 1) {
      const known = screen.queryByRole('button', { name: 'わかる' });
      if (!known) return;
      if (i % 2 === 0) fireEvent.click(known);
      else clickDontKnow();
    }
  };

  test('完了すると結果を保存して完了コールバックを呼ぶ', async () => {
    const onTestComplete = jest.fn();
    render(<VocabularyCheckTest allWords={WORDS} onTestComplete={onTestComplete} />);
    playUntilComplete();

    await waitFor(() => expect(onTestComplete).toHaveBeenCalled());

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    const [, payload] = mockUpdateDoc.mock.calls[0];
    expect(payload.level).toBeGreaterThanOrEqual(1);
    expect(payload.level).toBeLessThanOrEqual(7);
    // 到達語数そのものは updateProgressPercentage が和集合で数え直す。
    // ここではテストの推定値だけを保存する。
    expect(payload['progress.assessedVocabulary']).toBeGreaterThan(0);
    expect(payload['progress.currentVocabulary']).toBeUndefined();

    expect(mockLogStudySession).toHaveBeenCalled();
    expect(mockUpdateProgress).toHaveBeenCalledWith('student-a');
  });

  test('保存に失敗したら完了画面へ進まず、再試行できる', async () => {
    mockUpdateDoc.mockRejectedValue(new Error('offline'));
    const onTestComplete = jest.fn();
    render(<VocabularyCheckTest allWords={WORDS} onTestComplete={onTestComplete} />);
    playUntilComplete();

    expect(await screen.findByText('結果を保存できませんでした')).toBeInTheDocument();
    expect(onTestComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'もう一度保存する' })).toBeInTheDocument();
  });
});
