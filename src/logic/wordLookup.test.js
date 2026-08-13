import { buildWordIndex, findWord, normalizeToken, formsOf } from './wordLookup';

const MASTER = [
  { id: 'w1', word: 'make', level: 1, meaning: '作る' },
  { id: 'w2', word: 'friend', level: 1, meaning: '友だち' },
  { id: 'w3', word: 'study', level: 1, meaning: '勉強する' },
  { id: 'w4', word: 'run', level: 1, meaning: '走る' },
  { id: 'w5', word: 'a lot of', level: 2, meaning: 'たくさんの' },
  // 同じ綴りが2つ。やさしいほうを採る。
  { id: 'w6', word: 'face', level: 6, meaning: '直面する' },
  { id: 'w7', word: 'face', level: 2, meaning: '顔' },
];
const INDEX = buildWordIndex(MASTER);

test('記号を落として引く', () => {
  expect(normalizeToken('face.')).toBe('face');
  expect(normalizeToken('"Hello,"')).toBe('hello');
  expect(findWord('face.', INDEX).meaning).toBe('顔');
});

test('活用していても原形で引く', () => {
  expect(findWord('makes', INDEX).id).toBe('w1');
  expect(findWord('making', INDEX).id).toBe('w1');
  expect(findWord('friends', INDEX).id).toBe('w2');
  expect(findWord('studied', INDEX).id).toBe('w3');
  expect(findWord('running', INDEX).id).toBe('w4');
});

test('同じ綴りが複数あればやさしいほうを採る', () => {
  // 中高生に見せるのは基本の意味のほう
  expect(findWord('face', INDEX).meaning).toBe('顔');
});

test('熟語は1語では引かない', () => {
  expect(findWord('lot', INDEX)).toBeNull();
});

test('カードに無ければ null。当てずっぽうで別の語を返さない', () => {
  expect(findWord('supercalifragilistic', INDEX)).toBeNull();
  expect(findWord('', INDEX)).toBeNull();
  expect(findWord('the', null)).toBeNull();
});

test('原形の候補に元の語を必ず含める', () => {
  expect(formsOf('walk')).toContain('walk');
  expect(formsOf('walked')).toEqual(expect.arrayContaining(['walked', 'walk']));
});

describe('熟語はまとまりで押す', () => {
  const { buildPhraseIndex, splitIntoUnits } = require('./wordLookup');
  const PHRASES = buildPhraseIndex([
    { id: 'p1', word: 'a lot of', meaning: 'たくさんの' },
    { id: 'p2', word: 'look up', meaning: '見上げる' },
    { id: 'p3', word: 'look up to', meaning: '尊敬する' },
    { id: 'p4', word: 'get up', meaning: '起きる' },
    { id: 'p5', word: 'take care of ～', meaning: '～の世話をする' },
  ]);

  const shape = (text) => splitIntoUnits(text, PHRASES)
    .filter((unit) => !unit.space)
    .map((unit) => (unit.phrase ? `[${unit.text}]` : unit.text));

  test('熟語のところはひとまとまりになる', () => {
    expect(shape('I get up at six.')).toEqual(['I', '[get up]', 'at', 'six.']);
  });

  test('長い熟語を先に当てる', () => {
    // look up ではなく look up to
    expect(shape('I look up to my father.')).toEqual(['I', '[look up to]', 'my', 'father.']);
  });

  test('～を含む熟語も本文の語に当たる', () => {
    expect(shape('I take care of my dog.')).toEqual(['I', '[take care of]', 'my', 'dog.']);
  });

  test('熟語でないところはそのまま1語ずつ', () => {
    expect(shape('I like the morning.')).toEqual(['I', 'like', 'the', 'morning.']);
  });

  test('空白は残す。つなぐと元の文に戻る', () => {
    const text = 'I get up at six.';
    expect(splitIntoUnits(text, PHRASES).map((u) => u.text).join('')).toBe(text);
  });
});
