/**
 * 長文タブの音読。
 *
 * ## ここで止めたいこと
 *
 * **成功しても失敗の顔をしていた**（2026-09-22 に指摘されるまで気づかなかった）。
 * 文字起こし（`transcribeSpeaking`）が返すのは `{transcript}` だけで、
 * 点の材料（`missing` / `total`）は `reviewAnswer` にしか無い。
 * 1回しか呼んでいなかったので `total` が `undefined` → 点が null →
 * **どれだけ上手に読んでも「聞き取れませんでした」**で終わっていた。
 *
 * サーバは 200 を返しているのでログには出ない。**画面で確かめるしかない類**なので、
 * ここで固定する。
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReadingPanel from './ReadingPanel';

// 読み上げは jsdom に speechSynthesis が無い。ここで見たいのは音ではない。
jest.mock('../../logic/speechUtils', () => ({
  speakSequence: jest.fn(),
  stopSpeaking: jest.fn(),
  __esModule: true,
}));

// 単語カードの照合（長押し）は本題ではない
jest.mock('../../logic/wordMaster', () => ({ loadWordMaster: () => Promise.resolve([]) }));
// `wordLookup` は差し替えない。**純関数だけの部品**で、本文の描画にも使われている
// （`splitIntoUnits`）。丸ごと置き換えると本文が出ず、見たいところへ辿り着けない
jest.mock('../../logic/useBookmarks', () => ({
  useBookmarks: () => ({ isBookmarked: () => false, toggle: jest.fn() }),
}));

// 勉強時間の計測は studySession.test.js が見ている。ここでは呼ばれたかだけ
const mockNoteAloud = jest.fn();
jest.mock('../../logic/studySession', () => ({
  startStudySession: jest.fn(),
  endStudySession: jest.fn(),
  noteAloud: (...args) => mockNoteAloud(...args),
}));

// 文字起こしと採点はサーバー（Cloud Function）。画面の動きを見たいので差し替える
const mockTranscribe = jest.fn();
const mockReview = jest.fn();
jest.mock('../../logic/transcribeApi', () => ({
  transcribeSpeaking: (...args) => mockTranscribe(...args),
  reviewAnswer: (...args) => mockReview(...args),
}));

// 録音。**録り終えた Blob を外から差し込めるように**する
let mockRecorderState = { state: 'inactive', blob: null };
const mockStart = jest.fn();
jest.mock('../../logic/useRecorder', () => ({
  canRecord: () => true,
  useRecorder: () => ({
    ...mockRecorderState,
    start: (...args) => mockStart(...args),
    stop: jest.fn(),
    reset: jest.fn(),
  }),
}));

jest.mock('../../logic/readingContent', () => ({
  loadReadingIndex: () => Promise.resolve({
    categories: [{ id: 'daily', label: 'くらし' }],
    grades: [{ id: '5', label: '英検5級', readings: [{ id: 'r1', title: 'My Morning', titleJa: 'わたしの朝', category: 'daily' }] }],
  }),
  // **本物と同じ形にする**（文は `chunks` の並びで持っている）。
  // ここを簡単にすると ReadingView が落ちて、見たいところへ辿り着けない
  loadReading: () => Promise.resolve({
    id: 'r1',
    grade: '5',
    title: 'My Morning',
    titleJa: 'わたしの朝',
    sentences: [{
      ja: '六時に起きます。',
      chunks: [
        { en: 'I get up', ja: '起きます', role: 'V' },
        { en: 'at six.', ja: '六時に', role: 'M' },
      ],
    }],
  }),
  readingEnglish: () => 'I get up at six.',
  sentenceEnglish: (s) => s.en,
  speechPlanFor: () => [],
}));

// **本物と同じ形で返す**（`[zoom, setZoom]` の配列）。オブジェクトにすると
// 分割代入で「object is not iterable」になる
jest.mock('../../logic/useReadingZoom', () => ({
  useReadingZoom: () => [100, jest.fn()],
  MIN_ZOOM: 80,
  MAX_ZOOM: 160,
}));

jest.mock('../../logic/readingLevel', () => ({
  readingGradeFor: () => '5',
  EIKEN_LABELS: { 5: '英検5級' },
}));

const panel = () => (
  <ReadingPanel schoolGrade="中学1年生" abilityLevel={1} goalTargets={[]} userId="u1" />
);

const show = () => render(panel());

/**
 * 録り終えたことにする。
 *
 * 本物は `useRecorder` が Blob を持った状態で描き直す。差し替えた側は
 * **自分では描き直さない**ので、ここで Blob を差してから描き直す。
 */
const finishRecording = (view) => {
  mockRecorderState = { state: 'inactive', blob: new Blob(['x']) };
  view.rerender(panel());
};

/** 一覧 → 本文を開く */
const openReading = async () => {
  const view = show();
  await screen.findByText('My Morning');
  fireEvent.click(screen.getByText('My Morning'));
  /*
    **本文の文字では待てない。** 語ごとに `<span>` へ割られている（長押しで
    単語カードを引くため）ので、まとまった文字列として掴めない。
    本文にしか無い「音読」のボタンが出たことで、開けたと判断する。
  */
  await screen.findByRole('button', { name: '音読する' });
  return view;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRecorderState = { state: 'inactive', blob: null };
});

describe('音読の結果', () => {
  /*
    **これが今回のバグ。** `reviewAnswer` を呼ばないと `total` が来ないので、
    点が出ず、必ず「聞き取れませんでした」になる。
  */
  it('**読めたら点が出る。** 文字起こしだけで終わらせない', async () => {
    mockTranscribe.mockResolvedValue({ transcript: 'I get up at six' });
    mockReview.mockResolvedValue({ missing: [], total: 5, content: null });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    expect(await screen.findByText('100')).toBeInTheDocument();
    expect(screen.getByText('% 読めました')).toBeInTheDocument();
    expect(screen.queryByText('聞き取れませんでした。もう一度どうぞ。')).not.toBeInTheDocument();
  });

  it('読み飛ばした語が出て、点がそのぶん下がる', async () => {
    mockTranscribe.mockResolvedValue({ transcript: 'I get up' });
    mockReview.mockResolvedValue({ missing: ['at', 'six'], total: 5, content: null });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    expect(await screen.findByText('60')).toBeInTheDocument();
    expect(screen.getByText('at / six')).toBeInTheDocument();
  });

  it('**採点は、聞き取れた文と読むべき文の両方を送る**', async () => {
    mockTranscribe.mockResolvedValue({ transcript: 'I get up at six' });
    mockReview.mockResolvedValue({ missing: [], total: 5, content: null });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    await waitFor(() => expect(mockReview).toHaveBeenCalledTimes(1));
    expect(mockReview).toHaveBeenCalledWith({
      mode: 'scripted',
      transcript: 'I get up at six',
      referenceText: 'I get up at six.',
    });
  });

  /*
    **本当に聞き取れなかったときは、そう出す。** ここだけは元の文言が正しい。
  */
  it('何も聞き取れなければ、点を出さず採点もしない', async () => {
    mockTranscribe.mockResolvedValue({ transcript: '   ' });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    expect(await screen.findByText('聞き取れませんでした。もう一度どうぞ。')).toBeInTheDocument();
    expect(mockReview).not.toHaveBeenCalled();
  });
});

describe('つくばホームへ送る音読の数', () => {
  it('聞き取れたら1本と数える', async () => {
    mockTranscribe.mockResolvedValue({ transcript: 'I get up at six' });
    mockReview.mockResolvedValue({ missing: [], total: 5, content: null });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    await waitFor(() => expect(mockNoteAloud).toHaveBeenCalledWith('My Morning'));
  });

  /*
    塾は「音読した日」を見て声をかける。**多い方に外すと見落とす**ので、
    押しただけ・無音のものは数えない。
  */
  it('**無音は数えない**（押しただけで「やった」ことにしない）', async () => {
    mockTranscribe.mockResolvedValue({ transcript: '' });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    expect(await screen.findByText('聞き取れませんでした。もう一度どうぞ。')).toBeInTheDocument();
    expect(mockNoteAloud).not.toHaveBeenCalled();
  });

  it('文字起こしが失敗したら、理由を画面に出す', async () => {
    mockTranscribe.mockRejectedValue(new Error('通信できませんでした。'));

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    expect(await screen.findByText('通信できませんでした。')).toBeInTheDocument();
    expect(mockNoteAloud).not.toHaveBeenCalled();
  });
});
