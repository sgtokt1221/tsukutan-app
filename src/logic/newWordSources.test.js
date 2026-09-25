import fs from 'fs';
import path from 'path';

const mockMaster = jest.fn();
const mockTextbook = jest.fn();
const mockSunshine = jest.fn();

jest.mock('./wordMaster', () => ({
  loadWordMaster: (...args) => mockMaster(...args),
  loadTextbookWords: (...args) => mockTextbook(...args),
}));
jest.mock('./textbookPages', () => ({
  loadSunshineCards: (...args) => mockSunshine(...args),
}));

// eslint-disable-next-line import/first
import {
  NEW_WORD_SOURCES, getNewWordSource, schoolStageOf, sourcesForGrade, estimateLevels, orderByLevelFit,
} from './newWordSources';

const ids = (sources) => sources.map((source) => source.id);
const SUNSHINE = ['sunshine-1', 'sunshine-2', 'sunshine-3'];
const BOOKS = ['book-systan5', 'book-target1900', 'book-leap', 'book-idiom-target1000'];
const EIKEN = ['eiken-5', 'eiken-4', 'eiken-3', 'eiken-pre2', 'eiken-2', 'eiken-pre1'];

describe('教材IDは管理画面の定着度と同じ', () => {
  test('functions/index.js の MASTERY_TEXTBOOKS に無いIDを出さない', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../functions/index.js'), 'utf8');
    const block = source.slice(source.indexOf('const MASTERY_TEXTBOOKS'), source.indexOf('const loadMasteryTextbooks'));
    const masteryIds = new Set([
      ...[...block.matchAll(/id: '([^']+)'/g)].map((m) => m[1]),
      // 英検は `eiken-${eiken}` で組み立てている
      ...[...block.matchAll(/\['(\w+)', '[^']+級'\]/g)].map((m) => `eiken-${m[1]}`),
    ]);
    expect(masteryIds.size).toBeGreaterThan(10);
    for (const id of ids(NEW_WORD_SOURCES)) expect(masteryIds).toContain(id);
  });

  test('選べる教材は 教科書3・単語帳4・英検6', () => {
    expect(ids(NEW_WORD_SOURCES).sort()).toEqual([...SUNSHINE, ...BOOKS, ...EIKEN].sort());
  });
});

describe('学年で出し分ける', () => {
  test.each([
    ['中学1年生', 'middle'], ['中3', 'middle'],
    ['高校3年生', 'high'], ['高1', 'high'],
    ['小６', 'elementary'], ['年長', 'elementary'],
    ['', null], [null, null], [undefined, null], ['大学生', null],
  ])('%s → %s', (grade, stage) => {
    expect(schoolStageOf(grade)).toBe(stage);
  });

  test('中学生は Sunshine と英検', () => {
    expect(ids(sourcesForGrade('中学2年生'))).toEqual([...SUNSHINE, ...EIKEN]);
  });

  test('高校生は単語帳と英検', () => {
    expect(ids(sourcesForGrade('高2')).sort()).toEqual([...BOOKS, ...EIKEN].sort());
  });

  test.each(['小５', '', null, '年長'])('小学生・学年不明（%s）は全部', (grade) => {
    expect(ids(sourcesForGrade(grade))).toEqual(ids(NEW_WORD_SOURCES));
  });
});

describe('教材の語を読む', () => {
  beforeEach(() => {
    mockMaster.mockReset();
    mockTextbook.mockReset();
    mockSunshine.mockReset();
  });

  test('英検の級は、いちばんやさしい級1つにだけ入れる', async () => {
    mockMaster.mockResolvedValue([
      { id: 'a', eikenLevels: [3, 4, 5] },
      { id: 'b', eikenLevels: [3] },
      { id: 'c', eikenLevels: ['pre2', 3] },
      { id: 'd', eikenLevels: ['pre2'] },
      { id: 'e' },
    ]);
    expect(ids(await getNewWordSource('eiken-3').load())).toEqual(['b', 'c']);
    expect(ids(await getNewWordSource('eiken-5').load())).toEqual(['a']);
    expect(ids(await getNewWordSource('eiken-pre2').load())).toEqual(['d']);
  });

  test('Sunshine は学年で絞る', async () => {
    mockSunshine.mockResolvedValue([{ id: 'x', grade: 1 }, { id: 'y', grade: 2 }, { id: 'z', grade: 2 }]);
    expect(ids(await getNewWordSource('sunshine-2').load())).toEqual(['y', 'z']);
  });

  test('単語帳は教材IDで読む', async () => {
    mockTextbook.mockResolvedValue([{ id: 'q' }]);
    expect(ids(await getNewWordSource('book-leap').load())).toEqual(['q']);
    expect(mockTextbook).toHaveBeenCalledWith('book-leap');
  });

  test('知らないIDは null（おまかせ扱い）', () => {
    expect(getNewWordSource('なにこれ')).toBeNull();
    expect(getNewWordSource(null)).toBeNull();
  });
});

describe('estimateLevels', () => {
  test('level のある語はそのまま。無い語は本の並びで近い語の中央値', () => {
    const words = [
      { id: 'a', level: 2 }, { id: 'b', level: 2 }, { id: 'c' }, { id: 'd', level: 5 }, { id: 'e', level: 5 },
      { id: 'f', level: 5 },
    ];
    const levels = estimateLevels(words, 3);
    expect(levels.get('a')).toBe(2);
    // c の近く3つ: b(2), d(5), a(2) → 中央値 2
    expect(levels.get('c')).toBe(2);
    // 語そのものには書き足さない（reviewWords に level が載ると到達語数が狂う）
    expect(words[2]).not.toHaveProperty('level');
  });

  test('1語も level が無い教材では何も決めない', () => {
    expect(estimateLevels([{ id: 'a' }, { id: 'b' }]).size).toBe(0);
  });
});

describe('orderByLevelFit', () => {
  const word = (id, level) => ({ id, level });
  const levelsOf = (words) => new Map(words.map((w) => [w.id, w.level]));

  test('生徒のレベル帯 [level, level+1] の語が先', () => {
    const words = [word('l1', 1), word('l3', 3), word('l4', 4), word('l6', 6), word('l2', 2)];
    const ordered = orderByLevelFit(words, levelsOf(words), 3, () => 0.5);
    expect(ids(ordered.slice(0, 2)).sort()).toEqual(['l3', 'l4']);
  });

  test('帯の語が足りなければ近いレベルから埋める（0語にしない）', () => {
    const words = [word('l7', 7), word('l1', 1), word('l5', 5), word('l2', 2)];
    const ordered = orderByLevelFit(words, levelsOf(words), 3, () => 0.5);
    // 帯（3,4）は0語。距離1は l2・l5、次に l1（2）、l7（3）
    expect(ids(ordered.slice(0, 2)).sort()).toEqual(['l2', 'l5']);
    expect(ids(ordered.slice(2))).toEqual(['l1', 'l7']);
  });

  test('レベルの分からない語は最後', () => {
    const words = [word('none'), word('l7', 7)];
    const ordered = orderByLevelFit(words, new Map([['l7', 7]]), 1, () => 0.5);
    expect(ids(ordered)).toEqual(['l7', 'none']);
  });
});
