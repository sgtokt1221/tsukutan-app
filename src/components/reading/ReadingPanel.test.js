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
const mockNoteActivity = jest.fn();
const mockEndSession = jest.fn();
const mockStartSession = jest.fn();
jest.mock('../../logic/studySession', () => ({
  startStudySession: (...a) => mockStartSession(...a),
  endStudySession: (...a) => mockEndSession(...a),
  noteActivity: (...a) => mockNoteActivity(...a),
  noteAloud: (...args) => mockNoteAloud(...args),
}));

// 文字起こしと採点はサーバー（Cloud Function）。画面の動きを見たいので差し替える
const mockTranscribe = jest.fn();
jest.mock('../../logic/transcribeApi', () => ({
  transcribeSpeaking: (...args) => mockTranscribe(...args),
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
    // **2文にしてある。** 「前半だけ読んだ」を作れないと、
    // 語の集合で見ていたときのバグ（後半の同じ語まで緑）を捕まえられない
    sentences: [
      {
        ja: '六時に起きます。',
        chunks: [
          { en: 'I get up', ja: '起きます', role: 'V' },
          { en: 'at six.', ja: '六時に', role: 'M' },
        ],
      },
      {
        ja: '八時に食べます。',
        chunks: [
          { en: 'We eat', ja: '食べます', role: 'V' },
          { en: 'at eight.', ja: '八時に', role: 'M' },
        ],
      },
    ],
  }),
  readingEnglish: () => 'I get up at six. We eat at eight.',
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
  it('**読めたら点が出る。** 聞き取れた文を本文と突き合わせる', async () => {
    mockTranscribe.mockResolvedValue({ transcript: 'I get up at six we eat at eight' });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    expect(await screen.findByText('100')).toBeInTheDocument();
    expect(screen.getByText('% 読み進めました')).toBeInTheDocument();
    expect(screen.queryByText('聞き取れませんでした。もう一度どうぞ。')).not.toBeInTheDocument();
  });

  /*
    **読み飛ばした語を一覧で出すのはやめた**（2026-09-22）。語だけ並べても
    本文のどこだったか分からず、読み直す場所を探せなかった。
    本文をそのまま並べて、読めた語は緑・飛ばした語は赤にする。
  */
  it('**拾えなかった語は赤。** ただし最後まで届いていれば 100%', async () => {
    // 本文は9語。`get` だけ拾えなかったが、最後の `eight` まで届いている
    mockTranscribe.mockResolvedValue({ transcript: 'I up at six we eat at eight' });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    expect(await screen.findByText('100')).toBeInTheDocument();

    const passage = screen.getByTestId('aloud-passage');
    const missed = [...passage.querySelectorAll('.aloud-result__text .is-missed')].map((n) => n.textContent);
    expect(missed).toEqual(['get']);
    // 句読点ごと本文が残っている（語だけ抜き出して並べ替えない）
    expect(passage.querySelector('.aloud-result__text').textContent).toBe('I get up at six. We eat at eight.');
  });

  /*
    **これが 2026-09-22 の指摘。** 聞き取れた語の割合で線を引くと、発音が弱い子は
    最後まで読んでも届かず、いちばん声を出してほしい生徒がずっと「やっていない」
    ままになる。読んだ量（どこまで進んだか）で見る。
  */
  it('**発音が弱くて半分も拾えなくても、最後まで読めば数える**', async () => {
    // 9語のうち拾えたのは3語だけ。でも最後の `eight` まで届いている
    mockTranscribe.mockResolvedValue({ transcript: 'get six eight' });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    expect(await screen.findByText('100')).toBeInTheDocument();
    await waitFor(() => expect(mockNoteAloud).toHaveBeenCalledWith('My Morning'));
    // 拾えなかった語は赤のまま（本人にはそこが見える）
    const passage = screen.getByTestId('aloud-passage');
    expect(passage.querySelectorAll('.aloud-result__text .is-missed').length).toBe(6);
  });

  it('全部読めたら赤は1つも出ない', async () => {
    mockTranscribe.mockResolvedValue({ transcript: 'I get up at six we eat at eight' });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    await screen.findByText('100');
    const passage = screen.getByTestId('aloud-passage');
    expect(passage.querySelectorAll('.aloud-result__text .is-missed')).toHaveLength(0);
  });

  /*
    **どこまで進んだかは出せない**（送って返るまでの1往復）。作り物の数字を
    出さないかわりに、動き続ける帯で「止まっていない」ことを見せる。
  */
  it('聞き取っているあいだは進行中の帯を出す', async () => {
    let settle;
    mockTranscribe.mockReturnValue(new Promise((resolve) => { settle = resolve; }));

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    expect(await screen.findByText('聞き取っています…')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toBeInTheDocument();
    // **割合を言わない**（分からないものを数字で出さない）
    expect(bar).not.toHaveAttribute('aria-valuenow');

    settle({ transcript: 'I get up at six we eat at eight' });
    await screen.findByText('100');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  /*
    **語の集合で見ると、読んでいないところまで緑になる**（2026-09-22 に指摘）。
    `at` を前半で読んでいれば、後半の `at` も緑になってしまっていた。
    読んだ順に対応させるので、途中でやめたらその先は赤のまま。
  */
  it('**途中でやめたら、その先は同じ語でも赤のまま**', async () => {
    mockTranscribe.mockResolvedValue({ transcript: 'I get up at six' });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    // 5語目（six）で止まっている＝56%
    await screen.findByText('56');
    const passage = screen.getByTestId('aloud-passage');
    const missed = [...passage.querySelectorAll('.aloud-result__text .is-missed')].map((n) => n.textContent);
    // 後半（We eat at eight.）は読んでいないので、**前半に出た `at` も含めて**全部赤
    expect(missed).toEqual(['We', 'eat', 'at', 'eight']);
  });

  /*
    **本当に聞き取れなかったときは、そう出す。** ここだけは元の文言が正しい。
  */
  it('何も聞き取れなければ、点を出さず本文も出さない', async () => {
    mockTranscribe.mockResolvedValue({ transcript: '   ' });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    expect(await screen.findByText('聞き取れませんでした。もう一度どうぞ。')).toBeInTheDocument();
    expect(screen.queryByTestId('aloud-passage')).not.toBeInTheDocument();
  });
});

describe('つくばホームへ送る音読の数', () => {
  it('8割以上読めたら1本と数える', async () => {
    mockTranscribe.mockResolvedValue({ transcript: 'I get up at six we eat at eight' });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    await waitFor(() => expect(mockNoteAloud).toHaveBeenCalledWith('My Morning'));
    expect(await screen.findByText('文章の 80% 以上を読んだので「音読した日」になりました')).toBeInTheDocument();
  });

  /*
    **塾が見ているのは習慣**（2026-09-22 に決めた）。開いて少し声を出しただけの
    日まで「音読した日」にすると、○の意味が薄まる。
  */
  it('**8割まで進んでいなければ数えない。** ただし本人には理由を出す', async () => {
    // 5語目（six）で止まっている＝56%
    mockTranscribe.mockResolvedValue({ transcript: 'I get up at six' });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    // 点と色分けはこれまでどおり出る
    expect(await screen.findByText('56')).toBeInTheDocument();
    // **黙って落とさない**——「やったのに数えられていない」になる
    expect(screen.getByText('文章の 80% 以上まで読み進めると「音読した日」になります')).toBeInTheDocument();
    expect(mockNoteAloud).not.toHaveBeenCalled();
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

/**
 * **長文タブは「手を動かした」印を自分で付けないといけない。**
 *
 * 単語カードのような操作が無いので、印が無いと `lastAt` が読みものを開いた時刻の
 * まま動かない。締めるときは「最後に手を動かした時刻」までしか数えないので、
 * **どれだけ読んでも活動時間が0**になり、記録が1件も積まれず、つくばホームへ
 * 何も送られない（2026-09-22 に本番で確認。受け口の呼び出しが0件だった）。
 */
describe('勉強時間が積まれる', () => {
  it('**聞き取りが終わったら印を付ける**（点に関わらず）', async () => {
    // 56%。音読には数えないが、読んでいた時間は数える
    mockTranscribe.mockResolvedValue({ transcript: 'I get up at six' });

    const view = await openReading();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    await screen.findByText('56');
    expect(mockNoteActivity).toHaveBeenCalledWith('reading');
    expect(mockNoteAloud).not.toHaveBeenCalled();
  });

  /*
    **一覧に戻るまで待たない。** 読み終えてそのまま閉じた生徒のぶんが、
    次の起動まで届かなくなる。
  */
  it('**その場で1回ぶんを締めて、続きを測り直す**', async () => {
    mockTranscribe.mockResolvedValue({ transcript: 'I get up at six we eat at eight' });

    const view = await openReading();
    mockEndSession.mockClear();
    mockStartSession.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '音読する' }));
    finishRecording(view);

    await screen.findByText('100');
    expect(mockEndSession).toHaveBeenCalled();
    expect(mockStartSession).toHaveBeenCalled();
  });

  it('読み上げを押したときも印を付ける', async () => {
    await openReading();
    mockNoteActivity.mockClear();

    fireEvent.click(screen.getAllByRole('button', { name: /読み上げ/ })[0]);

    expect(mockNoteActivity).toHaveBeenCalledWith('reading');
  });
});
