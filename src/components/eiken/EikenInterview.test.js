import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// jsdom にはマイクが無い。録音できる端末として振る舞わせる。
// （無い端末ではマイクを出さない、というのも下のテストで見る）
const giveMicrophone = () => {
  window.MediaRecorder = function MediaRecorderStub() {};
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: jest.fn() },
    configurable: true,
  });
};

beforeEach(() => {
  giveMicrophone();
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
