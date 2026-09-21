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

test('**まとめて積まない。** iOS Safari は一度に積んだ2つ目以降を黙って落とす', async () => {
  const { speakSequence } = require('./speechUtils');
  const ended = [];
  // speak() された utterance を覚えておき、手で読み終わらせる
  const queue = [];
  window.speechSynthesis.speak = (u) => { spoken.push(u.text); queue.push(u); };

  const onDone = jest.fn();
  // **まとまらない並びで見る。** 同じ言語が続くと1つの発話にまとめる作りなので、
  // 言語を変えて「積む回数」そのものを見る
  speakSequence(
    [{ text: 'One.', lang: 'en-US' }, { text: 'いち。', lang: 'ja-JP' }, { text: 'Three.', lang: 'en-US' }],
    { onDone },
  );
  await settle();

  // 1つ目しか積んでいない
  expect(spoken).toEqual(['One.']);

  queue[0].onend();
  expect(spoken).toEqual(['One.', 'いち。']);
  queue[1].onend();
  expect(spoken).toEqual(['One.', 'いち。', 'Three.']);
  expect(onDone).not.toHaveBeenCalled();

  queue[2].onend();
  expect(onDone).toHaveBeenCalled();
  expect(ended).toEqual([]);
});

test('**途中で失敗しても止まらない。** 次の文へ進む', async () => {
  const { speakSequence } = require('./speechUtils');
  const queue = [];
  window.speechSynthesis.speak = (u) => { spoken.push(u.text); queue.push(u); };

  const onDone = jest.fn();
  speakSequence([{ text: 'One.', lang: 'en-US' }, { text: 'いち。', lang: 'ja-JP' }], { onDone });
  await settle();

  queue[0].onerror({ error: 'synthesis-failed' });
  expect(spoken).toEqual(['One.', 'いち。']);
  queue[1].onend();
  expect(onDone).toHaveBeenCalled();
});

test('**止めたら次へ進まない**（通しの読み上げを途中で止める）', async () => {
  const { speakSequence, stopSpeaking } = require('./speechUtils');
  const queue = [];
  window.speechSynthesis.speak = (u) => { spoken.push(u.text); queue.push(u); };

  speakSequence([{ text: 'One.', lang: 'en-US' }, { text: 'いち。', lang: 'ja-JP' }]);
  await settle();
  expect(spoken).toEqual(['One.']);

  stopSpeaking();
  queue[0].onend();
  expect(spoken).toEqual(['One.']);
});

describe('通しの読み上げを待たせない', () => {
  /*
    **1文ずつ積むと、文と文のあいだに合成の待ちが必ず入る。**
    ネット音声だと1文ごとに200〜400ms。10文の読みものなら数秒ぶん黙る。
    続けて読むぶんは1つの発話にまとめる。
  */
  test('**同じ言語のぶんは1つにまとめる**', async () => {
    const { speakSequence } = require('./speechUtils');
    speakSequence([{ text: 'One.' }, { text: 'Two.' }, { text: 'Three.' }]);
    await settle();
    expect(spoken).toEqual(['One. Two. Three.']);
  });

  test('言語が変わるところでは切る（英語→日本語）', async () => {
    const { speakSequence } = require('./speechUtils');
    const queue = [];
    window.speechSynthesis.speak = (u) => { spoken.push(u.text); queue.push(u); };
    speakSequence([
      { text: 'One.', lang: 'en-US' },
      { text: 'Two.', lang: 'en-US' },
      { text: 'いち。', lang: 'ja-JP' },
    ]);
    await settle();
    expect(spoken).toEqual(['One. Two.']);
    queue[0].onend();
    expect(spoken).toEqual(['One. Two.', 'いち。']);
  });

  test('**1文ずつ光らせる経路はまとめない。** どの文を読んでいるか分からなくなる', async () => {
    const { speakSequence } = require('./speechUtils');
    const started = [];
    speakSequence([
      { text: 'One.', onStart: () => started.push(1) },
      { text: 'Two.', onStart: () => started.push(2) },
    ]);
    await settle();
    expect(spoken).toEqual(['One.']);
  });
});

describe('押した瞬間に鳴らす（iOS）', () => {
  /*
    **iOS Safari は、押した操作と同じ処理の中で `speak()` を呼ばないと鳴らさない。**
    通信（作り置き音声の確認）や `setTimeout` を挟むと、エラーも出ないまま無音になる。
    「1文ずつは鳴るのに通しの読み上げが効かない」という形でしか気づけない。
  */
  test('**待たずにその場で積む**（await も setTimeout も挟まない）', () => {
    const { speakSequence } = require('./speechUtils');
    speakSequence([{ text: 'Hello.' }]);
    // await を1つも挟んでいないので、この行ですでに積まれている
    expect(spoken).toEqual(['Hello.']);
  });

  test('鳴っている最中に頼まれたときだけ、打ち切って間を置く', async () => {
    const { speakSequence } = require('./speechUtils');
    window.speechSynthesis.speaking = true;
    speakSequence([{ text: 'Next.' }]);
    // 前のを打ち切ったので、その場では積まない
    expect(spoken).toEqual([]);
    expect(cancelled).toBe(1);

    window.speechSynthesis.speaking = false;
    await settle();
    expect(spoken).toEqual(['Next.']);
  });
});
