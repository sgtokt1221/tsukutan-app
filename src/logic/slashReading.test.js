/**
 * スラッシュリーディングの区切り。
 *
 * **切りすぎない**ことを止める検査。SVOC の区切りをそのまま `/` にすると
 * 主語と動詞まで割れて、「頭から意味を取る」練習にならない。
 */
import { slashGroups, LONG_CHUNK_WORDS } from './slashReading';

/** 読みもののデータと同じ形。role は S / V / O / C / M */
const c = (en, ja, role = 'M') => ({ en, ja, role });

/** 区切りを `/` でつないだ1行にして見る */
const line = (chunks) => slashGroups(chunks).map((g) => g.en).join(' / ');

describe('切りすぎない', () => {
  it('**主語と動詞は割らない。** SVOC の区切りをそのまま使うとここが割れる', () => {
    // 実データ（eiken5-daily-01）。SVOC だと「I / get up / at six / in the morning.」
    expect(line([
      c('I', 'わたしは', 'S'),
      c('get up', '起きます', 'V'),
      c('at six', '6時に'),
      c('in the morning.', '朝に'),
    ])).toBe('I get up / at six / in the morning.');
  });

  it('短い文はまとめて1つ', () => {
    expect(line([
      c('My mother', '母は', 'S'),
      c('makes', '作ります', 'V'),
      c('breakfast', '朝ごはんを', 'O'),
    ])).toBe('My mother makes breakfast');
  });

  it('区切りが1つも無ければ、まとまりも1つ', () => {
    expect(slashGroups([c('I', 'わたしは', 'S'), c('run.', '走ります', 'V')])).toHaveLength(1);
  });
});

describe('1. 前置詞の前で切る', () => {
  it.each(['in', 'on', 'at', 'to', 'with', 'for', 'from', 'by', 'of', 'about'])('%s', (word) => {
    expect(line([
      c('I', 'わたしは', 'S'),
      c('go', '行きます', 'V'),
      c(`${word} school`, '学校へ'),
    ])).toBe(`I go / ${word} school`);
  });
});

describe('2. 接続詞の前で切る', () => {
  it.each(['and', 'but', 'because', 'if', 'or', 'so', 'when', 'while'])('%s', (word) => {
    expect(line([
      c('I', 'わたしは', 'S'),
      c('study', '勉強します', 'V'),
      c(`${word} I sleep.`, `${word}…`),
    ])).toBe(`I study / ${word} I sleep.`);
  });

  it('**程度の `so` では切らない**（so much / so many は接続詞ではない）', () => {
    // 切ると「have / so much interest?」と動詞と目的語が割れる
    expect(line([
      c('people', '人々は', 'S'),
      c('have', '持つ', 'V'),
      c('so much interest?', 'そんなに興味を', 'O'),
    ])).toBe('people have so much interest?');
    // 節をつなぐ `so` は今までどおり切る
    expect(line([
      c('It rained,', '雨が降った'),
      c('so we stayed home.', 'だから家にいた'),
    ])).toBe('It rained, / so we stayed home.');
  });
});

describe('3. 関係代名詞・関係副詞・疑問詞の前で切る', () => {
  it.each(['who', 'which', 'that', 'where', 'whose', 'what', 'how', 'why'])('%s', (word) => {
    expect(line([
      c('the book', 'その本', 'O'),
      c(`${word} I read`, '読んだ'),
    ])).toBe(`the book / ${word} I read`);
  });
});

describe('4. 準動詞の前で切る', () => {
  it('不定詞（to）', () => {
    expect(line([
      c('I', 'わたしは', 'S'),
      c('want', 'したい', 'V'),
      c('to play soccer.', 'サッカーを'),
    ])).toBe('I want / to play soccer.');
  });

  it('分詞・動名詞（-ing）は修飾のときだけ切る', () => {
    expect(line([
      c('the boy', 'その子は', 'S'),
      c('running in the park', '公園を走っている'),
    ])).toBe('the boy / running in the park');
  });

  it('**進行形では切らない。** be + -ing は動詞なので一息で読む', () => {
    expect(line([
      c('I', 'わたしは', 'S'),
      c('am reading', '読んでいます', 'V'),
      c('a book.', '本を', 'O'),
    ])).toBe('I am reading a book.');
  });

  it('**前置詞と同じ綴りの動詞で切らない**（like / off / near）', () => {
    // 綴りだけで見ると「I / like everything」と割れる
    const said = ['like', 'near', 'off'].map((verb) => line([
      c('I', 'わたしは', 'S'),
      c(verb, '…', 'V'),
      c('it.', 'それを', 'O'),
    ]));
    expect(said).toEqual(['I like it.', 'I near it.', 'I off it.']);
  });

  it('**`-ing` で終わるだけの名詞で切らない**（morning / everything など）', () => {
    // 「in the morning」は前置詞で切れるので、morning 自体では切らない
    expect(line([
      c('I', 'わたしは', 'S'),
      c('like', '好きです', 'V'),
      c('everything', 'すべてが', 'O'),
    ])).toBe('I like everything');
  });
});

describe('5. カンマ・コロン・セミコロンの後ろで切る', () => {
  it('カンマ', () => {
    // 実データ（eiken5-daily-01）
    expect(line([
      c('First,', 'まず'),
      c('I', 'わたしは', 'S'),
      c('wash', '洗います', 'V'),
      c('my face.', '顔を', 'O'),
    ])).toBe('First, / I wash my face.');
  });

  it.each([':', ';'])('%s', (mark) => {
    expect(line([
      c(`Here is the plan${mark}`, '計画はこう'),
      c('we run.', '走る', 'S'),
    ])).toBe(`Here is the plan${mark} / we run.`);
  });

  it('**文末のピリオドでは切らない**（次の文が無い）', () => {
    expect(slashGroups([c('I run.', '走ります', 'V')])).toHaveLength(1);
  });
});

describe('6. 長い主語・目的語・補語の後ろで切る', () => {
  it('短い主語の後ろでは切らない', () => {
    expect(line([c('My mother', '母は', 'S'), c('sings.', '歌います', 'V')]))
      .toBe('My mother sings.');
  });

  it('長い主語の後ろでは切る', () => {
    expect(line([
      c('The boy in the red cap', '赤い帽子の男の子は', 'S'),
      c('sings.', '歌います', 'V'),
    ])).toBe('The boy in the red cap / sings.');
    expect(LONG_CHUNK_WORDS).toBe(3);
  });

  it('長い目的語の後ろでも切る', () => {
    expect(line([
      c('I', 'わたしは', 'S'),
      c('read', '読みました', 'V'),
      c('a very long book', 'とても長い本を', 'O'),
      c('yesterday.', '昨日'),
    ])).toBe('I read a very long book / yesterday.');
  });
});

describe('まとまりの中身', () => {
  it('**訳は英語の並びのままつなぐ。** 頭から順に取る練習なので入れ替えない', () => {
    const [first] = slashGroups([
      c('I', 'わたしは', 'S'),
      c('wash', '洗います', 'V'),
      c('my face.', '顔を', 'O'),
    ]);
    expect(first.ja).toBe('わたしは 洗います 顔を');
  });

  it('元のチャンクを残す（SVOC の札や語の長押しが引けるように）', () => {
    const [first] = slashGroups([c('I', 'わたしは', 'S'), c('run.', '走ります', 'V')]);
    expect(first.parts.map((p) => p.role)).toEqual(['S', 'V']);
  });

  it('空や壊れた入力で落ちない', () => {
    expect(slashGroups(null)).toEqual([]);
    expect(slashGroups([])).toEqual([]);
    expect(slashGroups([{ en: '  ', ja: '' }])).toEqual([]);
  });
});
