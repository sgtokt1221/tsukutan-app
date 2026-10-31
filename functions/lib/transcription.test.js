const {
  transcribe, splitPcm, toPcm, missingWords, CHUNK_BYTES, SAMPLE_RATE,
} = require('./transcription');

/** ヘッダー44バイト + 指定秒数ぶんの無音。 */
const makeWav = (seconds) => Buffer.concat([
  Buffer.alloc(44, 1),
  Buffer.alloc(seconds * SAMPLE_RATE * 2),
]);

const respondWith = (...texts) => {
  const calls = [];
  const recognize = jest.fn(async (request) => {
    calls.push(request);
    const text = texts[calls.length - 1];
    return [{ results: text ? [{ alternatives: [{ transcript: text }] }] : [] }];
  });
  return { recognize, calls };
};

test('ヘッダーを落として PCM だけにする', () => {
  const wav = makeWav(1);
  expect(toPcm(wav)).toHaveLength(SAMPLE_RATE * 2);
});

test('60秒以内なら1回で投げる', async () => {
  const { recognize, calls } = respondWith('Many people listen to the radio.');
  const result = await transcribe(makeWav(20), {}, recognize);

  expect(calls).toHaveLength(1);
  expect(result.chunks).toBe(1);
  expect(result.transcript).toBe('Many people listen to the radio.');
});

test('2分のナレーションは分割して、順につなぐ', async () => {
  const { recognize, calls } = respondWith('One Sunday morning,', 'she saw a lot of rubbish.', 'The end.');
  const result = await transcribe(makeWav(120), {}, recognize);

  expect(calls).toHaveLength(3); // 55秒 × 2 + 10秒
  expect(result.transcript).toBe('One Sunday morning, she saw a lot of rubbish. The end.');
});

test('分割は標本の途中で切らない', () => {
  const chunks = splitPcm(Buffer.alloc(CHUNK_BYTES * 2 + 100));
  for (const chunk of chunks) expect(chunk.length % 2).toBe(0);
  expect(chunks).toHaveLength(3);
});

test('聞き取れない区間があっても、他の区間は生かす', async () => {
  const { recognize } = respondWith('One Sunday morning,', null, 'The end.');
  const result = await transcribe(makeWav(120), {}, recognize);
  expect(result.transcript).toBe('One Sunday morning, The end.');
});

test('音読では、読むべき英文を認識のヒントに渡す', async () => {
  const { recognize, calls } = respondWith('hello');
  await transcribe(makeWav(5), { phrases: ['radio', 'traffic'] }, recognize);
  expect(calls[0].config.speechContexts).toEqual([{ phrases: ['radio', 'traffic'] }]);
});

test('ヒントが無ければ speechContexts を付けない', async () => {
  const { recognize, calls } = respondWith('hello');
  await transcribe(makeWav(5), {}, recognize);
  expect(calls[0].config.speechContexts).toBeUndefined();
});

test('空の音声は受け取らない', async () => {
  await expect(transcribe(Buffer.alloc(10), {}, jest.fn())).rejects.toThrow('音声が空です');
});

test('長すぎる音声は受け取らない', async () => {
  await expect(transcribe(makeWav(300), {}, jest.fn())).rejects.toThrow('音声が長すぎます');
});

describe('missingWords', () => {
  const passage = 'Many people listen to the radio in the morning.';

  test('読み飛ばした語を拾う', () => {
    expect(missingWords(passage, 'Many people listen to the radio.')).toEqual(['in', 'morning']);
  });

  test('全部読めていれば空', () => {
    expect(missingWords(passage, 'many people listen to the radio in the morning')).toEqual([]);
  });

  test('大文字小文字と句読点は無視する', () => {
    expect(missingWords('Radio, traffic!', 'radio traffic')).toEqual([]);
  });

  test('同じ語は一度しか挙げない', () => {
    expect(missingWords('the cat and the dog', 'cat dog')).toEqual(['the', 'and']);
  });
});
