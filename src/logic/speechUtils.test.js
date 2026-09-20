/**
 * 読み上げの打ち切りと再開。
 *
 * **Chrome は cancel() の直後の speak() を黙って捨てる。** エラーも出ないので、
 * 「押しても鳴らない」という形でしか気づけない。ここで止める。
 */

// 作っておいた音声は使わない（端末の読み上げへ落ちる経路を見る）
jest.mock('./audioLibrary', () => ({ fetchClip: jest.fn(async () => null) }));

let spoken;
let cancelled;

class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.lang = '';
  }
}

beforeEach(() => {
  jest.resetModules();
  spoken = [];
  cancelled = 0;
  window.SpeechSynthesisUtterance = FakeUtterance;
  window.speechSynthesis = {
    speaking: false,
    pending: false,
    getVoices: () => [],
    speak: (u) => { spoken.push(u.text); },
    cancel: () => { cancelled += 1; },
    onvoiceschanged: null,
  };
});

/** マイクロタスクとタイマーを進めて、積まれたものを出し切る */
const settle = async (ms = 400) => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, ms));
};

test('ふつうに読み上げる', async () => {
  const { speakSequence } = require('./speechUtils');
  speakSequence([{ text: 'Hello.', lang: 'en-US' }]);
  await settle();
  expect(spoken).toEqual(['Hello.']);
});

test('**止めた直後でも鳴る。** cancel() の直後に speak() すると Chrome が捨てる', async () => {
  const { speakSequence, stopSpeaking } = require('./speechUtils');

  // 読み上げボタンの経路。止めてから、間を置かずに次を頼む
  stopSpeaking();
  speakSequence([{ text: 'Second.', lang: 'en-US' }]);

  // 打ち切りの直後に積んでいない（ここで積むと捨てられる）
  expect(spoken).toEqual([]);

  await settle();
  expect(cancelled).toBeGreaterThan(0);
  expect(spoken).toEqual(['Second.']);
});

test('**押し直しても最後のぶんだけ鳴る。** 前のぶんが残って重ならない', async () => {
  const { speakSequence, stopSpeaking } = require('./speechUtils');

  stopSpeaking();
  speakSequence([{ text: 'First.', lang: 'en-US' }]);
  stopSpeaking();
  speakSequence([{ text: 'Last.', lang: 'en-US' }]);

  await settle();
  expect(spoken).toEqual(['Last.']);
});

test('読むものが無ければ、そのまま終わりを知らせる', async () => {
  const { speakSequence } = require('./speechUtils');
  const onDone = jest.fn();
  speakSequence([], { onDone });
  expect(onDone).toHaveBeenCalled();
  expect(spoken).toEqual([]);
});
