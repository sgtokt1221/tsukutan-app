import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EikenInterview from './EikenInterview';

// 読み上げは jsdom に speechSynthesis が無いので差し替える。
// ここで見たいのは「面接の流れが順に出るか」であって、音そのものではない。
const mockSpeakSequence = jest.fn();
jest.mock('../../logic/speechUtils', () => ({
  speakSequence: (...args) => mockSpeakSequence(...args),
  stopSpeaking: jest.fn(),
}));
jest.mock('../../logic/audioLibrary', () => ({
  prefetchClips: () => Promise.resolve(),
}));

// public/ の素材をそのまま使う。ここが本番と食い違うと意味がない。
const FILES = {
  '/eiken-interview/index.json': require('../../../public/eiken-interview/index.json'),
  '/eiken-interview/interviewer-pre2.json': require('../../../public/eiken-interview/interviewer-pre2.json'),
  '/eiken-interview/pre2/eiken-p2-001.json': require('../../../public/eiken-interview/pre2/eiken-p2-001.json'),
  '/eiken-interview/interviewer-3.json': require('../../../public/eiken-interview/interviewer-3.json'),
  '/eiken-interview/3/eiken3-001.json': require('../../../public/eiken-interview/3/eiken3-001.json'),
};

// 文字起こしと採点はサーバー（Cloud Function）。ここで見たいのは画面の動きなので差し替える。
const mockTranscribe = jest.fn();
const mockReview = jest.fn();
jest.mock('../../logic/transcribeApi', () => ({
  transcribeSpeaking: (...args) => mockTranscribe(...args),
  reviewAnswer: (...args) => mockReview(...args),
  VERDICT_LABELS: { good: '質問に答えられています', partial: 'あと少し足りません', 'off-target': '質問とずれています' },
}));

// チャートは canvas が要る。jsdom には無いので、値だけ見えるものに置き換える。
jest.mock('react-chartjs-2', () => ({
  Doughnut: ({ data }) => <div data-testid="doughnut">{JSON.stringify(data.datasets[0].data)}</div>,
  Bar: ({ data }) => <div data-testid="bar">{JSON.stringify(data.datasets[0].data)}</div>,
}));

// jsdom にはマイクが無い。録音できる端末として振る舞わせる。
// stop() で onstop を呼んで、本物と同じように Blob が出るところまで真似る。
// （マイクが無い端末ではボタンを出さない、というのも下のテストで見る）
const giveMicrophone = () => {
  window.MediaRecorder = function MediaRecorderStub() {
    this.state = 'recording';
    this.mimeType = 'audio/webm';
    this.start = () => {};
    this.stop = () => {
      this.state = 'inactive';
      this.ondataavailable({ data: new Blob(['audio'], { type: 'audio/webm' }) });
      this.onstop();
    };
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: jest.fn(() => Promise.resolve({ getTracks: () => [] })) },
    configurable: true,
  });
  window.URL.createObjectURL = jest.fn(() => 'blob:test');
  window.URL.revokeObjectURL = jest.fn();
};

/** 録音する。押す → 止めるで、文字起こしまで走る。 */
const record = async () => {
  fireEvent.click(screen.getByRole('button', { name: /録音する|録り直す/ }));
  const stop = await screen.findByRole('button', { name: '録音を止める' });
  // 止めた時点で文字起こしが走る。返るところまで待たないと act の外で state が動く
  await act(async () => { fireEvent.click(stop); });
};

/** 結果を開く。開いた時点で採点が走る。 */
const openResult = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '結果を見る' }));
  });
};

beforeEach(() => {
  giveMicrophone();
  mockTranscribe.mockReset();
  mockTranscribe.mockResolvedValue({ transcript: 'These days many towns hold clean up events.' });
  mockReview.mockReset();
  mockReview.mockResolvedValue({ missing: ['many'], total: 20, content: null });
  mockSpeakSequence.mockClear();
  global.fetch = jest.fn((path) => Promise.resolve({
    ok: Boolean(FILES[path]),
    status: FILES[path] ? 200 : 404,
    json: () => Promise.resolve(FILES[path]),
  }));
});

/** 「次へ」を押して先へ進む。 */
const next = () => fireEvent.click(screen.getByRole('button', { name: '次へ' }));

test('カードを選ぶと入室のセリフから始まる', async () => {
  render(<EikenInterview grade="pre2" onExit={() => {}} />);

  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));

  expect(await screen.findByText('Hello.')).toBeInTheDocument();
  expect(screen.getByText('入室したらこちらから挨拶する。')).toBeInTheDocument();
});

test('答え方は押すまで出ない', async () => {
  render(<EikenInterview grade="pre2" onExit={() => {}} />);
  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));
  await screen.findByText('Hello.');

  expect(screen.queryByRole('button', { name: /見本を聞く/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /答え方を見る/ }));
  expect(screen.getByRole('button', { name: /見本を聞く/ })).toBeInTheDocument();
});

test('黙読の場面でパッセージとタイマーが出る', async () => {
  render(<EikenInterview grade="pre2" onExit={() => {}} />);
  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));
  await screen.findByText('Hello.');

  // 入室6場面 + カード受け取り を越えると黙読
  for (let i = 0; i < 7; i += 1) next();

  expect(screen.getByText('Please read the passage silently for 20 seconds.')).toBeInTheDocument();
  expect(screen.getByText(/These days, many towns hold clean-up events/)).toBeInTheDocument();
  expect(screen.getByText('0:20')).toBeInTheDocument();
});

test('準2級はカードを裏返したあと、イラストもパッセージも出ない', async () => {
  render(<EikenInterview grade="pre2" onExit={() => {}} />);
  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));
  await screen.findByText('Hello.');

  // No.3 までイラストが見えている
  for (let i = 0; i < 12; i += 1) next();
  expect(screen.getByText(/look at the person in Picture B/)).toBeInTheDocument();
  expect(screen.getByAltText(/イラスト B/)).toBeInTheDocument();

  // 裏返す合図 → No.4 からは見えない
  next();
  expect(screen.getByText(/please turn over the card and put it down/)).toBeInTheDocument();
  next();
  expect(screen.getByText(/Do you think more people should join volunteer activities/)).toBeInTheDocument();
  expect(screen.queryByAltText(/イラスト/)).not.toBeInTheDocument();
  expect(screen.getByText('カードは裏返してあります。見ずに答えます。')).toBeInTheDocument();
});

test('Yes / No を選ぶと、その追い質問と見本が出る', async () => {
  render(<EikenInterview grade="pre2" onExit={() => {}} />);
  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));
  await screen.findByText('Hello.');

  for (let i = 0; i < 14; i += 1) next();
  await screen.findByText(/Do you think more people should join volunteer activities/);

  fireEvent.click(screen.getByRole('button', { name: /Yes/ }));
  expect(screen.getByText('Why?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /答え方を見る/ }));
  expect(screen.getByText(/Volunteers can do things that the city cannot do/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /No/ }));
  expect(screen.getByText('Why not?')).toBeInTheDocument();
});

test('3級は最後までカードを裏返さない', async () => {
  render(<EikenInterview grade="3" onExit={() => {}} />);
  await screen.findByText('Morning Radio');
  fireEvent.click(screen.getByText('Morning Radio'));
  await screen.findByText('Hello.');

  await waitFor(() => expect(screen.queryByText(/turn over the card/)).not.toBeInTheDocument());
});

test('場面が変わるたびに面接委員のセリフを読み上げる', async () => {
  render(<EikenInterview grade="3" onExit={() => {}} />);
  await screen.findByText('Morning Radio');
  fireEvent.click(screen.getByText('Morning Radio'));
  await screen.findByText('Hello.');

  mockSpeakSequence.mockClear();
  next();
  expect(mockSpeakSequence).toHaveBeenCalledWith([
    { text: 'Can I have your card, please?', lang: 'en-US' },
  ]);
});

test('話す場面では画面下にマイクが出る。挨拶の場面には出ない', async () => {
  render(<EikenInterview grade="pre2" onExit={() => {}} />);
  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));
  await screen.findByText('Hello.');

  // 入室の挨拶は面接委員が話す番。マイクは出さない
  expect(screen.queryByRole('button', { name: '録音する' })).not.toBeInTheDocument();

  // 音読は生徒が話す番（入室6 + カード受け取り + 黙読 = 8回進める）
  for (let i = 0; i < 8; i += 1) next();
  expect(screen.getByText('Now, please read it aloud.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '録音する' })).toBeInTheDocument();
});

test('録音を止めると、押さなくても文字起こしが出る', async () => {
  render(<EikenInterview grade="pre2" onExit={() => {}} />);
  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));
  await screen.findByText('Hello.');
  for (let i = 0; i < 8; i += 1) next();

  // 「文字にする」を押させない。止めた時点で走る
  expect(screen.queryByRole('button', { name: /文字にする/ })).not.toBeInTheDocument();
  await record();

  expect(await screen.findByDisplayValue(/These days many towns hold clean up events/)).toBeInTheDocument();
  expect(mockTranscribe).toHaveBeenCalledTimes(1);
  expect(mockTranscribe.mock.calls[0][1]).toMatchObject({ mode: 'scripted' });
});

test('採点は途中では出さず、最後の結果画面でまとめて出る', async () => {
  mockReview.mockResolvedValue({
    missing: [],
    total: 20,
    content: { verdict: 'good', reasonJa: '質問にきちんと答えられています。', missingJa: '', betterAnswer: '' },
  });

  render(<EikenInterview grade="pre2" onExit={() => {}} />);
  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));
  await screen.findByText('Hello.');
  for (let i = 0; i < 8; i += 1) next();
  await record();
  await screen.findByDisplayValue(/These days/);

  // 面接の途中では判定を出さない
  expect(screen.queryByText(/質問にきちんと答えられています/)).not.toBeInTheDocument();
  expect(mockReview).not.toHaveBeenCalled();

  // 最後まで進むと「結果を見る」になる
  const last = screen.getByRole('button', { name: '次へ' });
  while (screen.queryByRole('button', { name: '次へ' })) {
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
  }
  expect(last).toBeDefined();
  await openResult();

  expect(await screen.findByText('面接の結果')).toBeInTheDocument();
  expect(await screen.findByText(/質問にきちんと答えられています/)).toBeInTheDocument();
  // 読み飛ばしゼロ → 100点
  expect(screen.getByTestId('doughnut')).toHaveTextContent('[100,0]');
});

test('文字起こしを直すと、直した文で採点に送られる', async () => {
  render(<EikenInterview grade="pre2" onExit={() => {}} />);
  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));
  await screen.findByText('Hello.');
  for (let i = 0; i < 8; i += 1) next();
  await record();

  const box = await screen.findByDisplayValue(/These days/);
  fireEvent.change(box, { target: { value: 'These days many towns hold clean-up events.' } });

  while (screen.queryByRole('button', { name: '次へ' })) {
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
  }
  await openResult();

  await waitFor(() => expect(mockReview).toHaveBeenCalled());
  expect(mockReview.mock.calls[0][0]).toMatchObject({
    transcript: 'These days many towns hold clean-up events.',
  });
});

test('採点に失敗しても投げ直し続けない', async () => {
  mockReview.mockRejectedValue(new Error('答えを見てもらえませんでした。'));

  render(<EikenInterview grade="pre2" onExit={() => {}} />);
  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));
  await screen.findByText('Hello.');
  for (let i = 0; i < 8; i += 1) next();
  await record();
  await screen.findByDisplayValue(/These days/);

  while (screen.queryByRole('button', { name: '次へ' })) {
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
  }
  await openResult();

  expect(await screen.findByText(/答えを見てもらえませんでした/)).toBeInTheDocument();
  // 失敗を数え直して延々と投げると、通信もお金も無駄になる
  expect(mockReview).toHaveBeenCalledTimes(1);
});

test('録音できない端末ではマイクを出さない', async () => {
  delete window.MediaRecorder;
  render(<EikenInterview grade="pre2" onExit={() => {}} />);
  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));
  await screen.findByText('Hello.');

  for (let i = 0; i < 8; i += 1) next();
  expect(screen.getByText('Now, please read it aloud.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '録音する' })).not.toBeInTheDocument();
});

test('心得はまとめて出さず、それが要る場面に出る', async () => {
  render(<EikenInterview grade="pre2" onExit={() => {}} />);
  await screen.findByText('Clean-up Events');
  fireEvent.click(screen.getByText('Clean-up Events'));
  await screen.findByText('Hello.');

  // 入室の場面。ここに出るのは面接全体の話だけ
  expect(screen.getByText(/面接委員とのやりとりはすべて英語/)).toBeInTheDocument();
  expect(screen.queryByText(/I beg your pardon/)).not.toBeInTheDocument();
  expect(screen.queryByText(/言えるだけ言う/)).not.toBeInTheDocument();

  // 質問に入るところ。聞き返し方はここ
  for (let i = 0; i < 9; i += 1) next();
  expect(screen.getByText(/I beg your pardon/)).toBeInTheDocument();
  expect(screen.queryByText(/面接委員とのやりとりはすべて英語/)).not.toBeInTheDocument();

  // No.2。5人を言う設問の心得はここまで出さない
  for (let i = 0; i < 2; i += 1) next();
  expect(screen.getByText(/言えるだけ言う/)).toBeInTheDocument();
  expect(screen.queryByText(/I beg your pardon/)).not.toBeInTheDocument();
});
