/**
 * スラッシュリーディングの区切り。
 *
 * **SVOCM の切れ目で必ず切る**（2026-09-23 に変えた）。もとは「主語と動詞は
 * 一息で読む」として S と V をくっつけ、前置詞・接続詞などの目印で切る場所を
 * 決めていた。塾の教え方に合わせて、意味のカタマリごとに切る形へ変えた。
 *
 * 区切りは2か所で決まる。**ここが見るのはチャンクとチャンクの間**で、
 * チャンクの中の区切りはデータ（`chunk.slash`）に焼き込んである。
 */
import { slashUnits, slashPiecesFor } from './slashReading';

/** 読みもののデータと同じ形。role は S / V / O / C / M */
const c = (en, ja, role = 'M') => ({ en, ja, role });

/** 区切りを `/` でつないだ1行にして見る */
const line = (chunks) => slashUnits(chunks).map((u) => u.en).join(' / ');

describe('SVOCM の切れ目で切る', () => {
  /*
    **S と V も割る**（2026-09-23 の指定）。もとは
    「I get up / at six / in the morning.」とくっつけていた。
  */
  it('**主語と動詞も割る**（意味のカタマリごと）', () => {
    // 実データ（eiken5-daily-01）
    expect(line([
      c('I', 'わたしは', 'S'),
      c('get up', '起きます', 'V'),
      c('at six', '6時に'),
      c('in the morning.', '朝に'),
    ])).toBe('I / get up / at six / in the morning.');
  });

  it('短い文でも割る', () => {
    expect(line([
      c('My mother', '母は', 'S'),
      c('makes', '作ります', 'V'),
      c('breakfast', '朝ごはんを', 'O'),
    ])).toBe('My mother / makes / breakfast');
  });

  /*
    **動詞が1語だけのまとまりになってよい。** V は V で1つのカタマリ。
    もとの規則では「動詞が孤立する」として避けていた。
  */
  it('**動詞が1語でも、そのまま1つのまとまりにする**', () => {
    expect(line([
      c('One of the causes', '原因の1つは', 'S'),
      c('is', '〜です', 'V'),
      c('that the temperature has risen.', '温度が上がったこと', 'C'),
    ])).toBe('One of the causes / is / that the temperature has risen.');
  });

  /*
    **`than` の前だけは切らない**（SVOCM で必ず切ることへの唯一の例外）。
    比較級とひと続きで読む。データ上は `than before.` が M として独立している
    ことがあり、切ると比較が割れる（2026-09-23 に実データで8か所）。
  */
  it('**`than` の前では切らない**（比較級とひと続きで読む）', () => {
    expect(line([
      c('I', 'わたしは', 'S'),
      c('was reading', '読んでいました', 'V'),
      c('fewer books', '少ない本を', 'O'),
      c('than before.', '以前より'),
    ])).toBe('I / was reading / fewer books than before.');
  });

  it('`than` をくっつけるとき、訳もつなぐ', () => {
    const [, second] = slashUnits([
      c('It', 'それは', 'S'),
      c('is safer', 'より安全です', 'V'),
      c('than before.', '以前より'),
    ]);
    expect(second).toEqual({ en: 'is safer than before.', ja: 'より安全です 以前より' });
  });

  it('チャンクが1つなら、まとまりも1つ', () => {
    expect(slashUnits([c('I run.', 'わたしは走ります', 'S')])).toHaveLength(1);
  });

  it('語の綴りでは判断しない（動詞の like / off でも同じように切る）', () => {
    expect(line([
      c('I', 'わたしは', 'S'),
      c('like', '好きです', 'V'),
      c('everything', 'すべてが', 'O'),
    ])).toBe('I / like / everything');
  });
});

describe('まとまりの中身', () => {
  it('**訳はチャンクの訳をそのまま使う**（作り直さない）', () => {
    expect(slashUnits([
      c('I', 'わたしは', 'S'),
      c('wash', '洗います', 'V'),
      c('my face.', '顔を', 'O'),
    ])).toEqual([
      { en: 'I', ja: 'わたしは' },
      { en: 'wash', ja: '洗います' },
      { en: 'my face.', ja: '顔を' },
    ]);
  });

  it('空や壊れた入力で落ちない', () => {
    expect(slashUnits(null)).toEqual([]);
    expect(slashUnits([])).toEqual([]);
    expect(slashUnits([{ en: '  ', ja: '' }])).toEqual([]);
    expect(slashUnits([null, undefined])).toEqual([]);
  });
});

describe('まとまりの中を切る位置（訳を作るときに使う）', () => {
  const pieces = (en) => slashPiecesFor({ en });

  it('**チャンクの中の前置詞でも切る**', () => {
    expect(pieces('there is a skill of repairing broken bowls with gold.'))
      .toEqual(['there is a skill', 'of repairing broken bowls', 'with gold.']);
  });

  it('**チャンクの中の接続詞でも切る**', () => {
    expect(pieces('Real kintsugi needs several months and a high level of skill.'))
      .toEqual(['Real kintsugi needs several months', 'and a high level', 'of skill.']);
  });

  it('**チャンクの中の関係詞でも切る**', () => {
    expect(pieces('People who have experienced failure or illness'))
      .toEqual(['People who have experienced failure', 'or illness']);
  });

  it('**比較の `than` の前では切らない**（more than / safer than）', () => {
    expect(pieces('and it has a history of more than five hundred years.'))
      .toEqual(['and it has a history', 'of more than five hundred years.']);
    expect(pieces('and it is safer than before.')).toEqual(['and it is safer than before.']);
  });

  it('**1語だけの小片を作らない。** 切ると読みにくくなる', () => {
    expect(pieces('big and new things')).toEqual(['big and new things']);
    expect(pieces('the time that the bowl has passed through.'))
      .toEqual(['the time', 'that the bowl has passed through.']);
  });

  it('**2語で1つの前置詞は割らない**（next to / according to）', () => {
    expect(pieces('the house next to number one')).toEqual(['the house', 'next to number one']);
    expect(pieces('we changed it according to the rule.'))
      .toEqual(['we changed it', 'according to the rule.']);
  });

  it('切るところが無ければ小片は1つ', () => {
    expect(pieces('I run.')).toEqual(['I run.']);
  });
});

describe('区切りには必ず訳が付く', () => {
  const split = { en: 'a skill of repairing bowls', ja: '器を直す技', role: 'O',
    slash: [{ en: 'a skill', ja: '技' }, { en: 'of repairing bowls', ja: '器を直す' }] };

  it('**訳のある小片（`chunk.slash`）だけで切る**', () => {
    expect(slashUnits([split])).toEqual([
      { en: 'a skill', ja: '技' },
      { en: 'of repairing bowls', ja: '器を直す' },
    ]);
  });

  it('**訳が無ければ切らない。** 区切りだけあって訳が無い、を作らない', () => {
    const noJa = { en: 'a skill of repairing bowls', ja: '器を直す技', role: 'O' };
    expect(slashUnits([noJa])).toEqual([{ en: 'a skill of repairing bowls', ja: '器を直す技' }]);
  });

  /*
    **チャンクの境目でも、中の区切りでも切る**（2026-09-23 に変えた）。
    もとは境目では切らず前のまとまりに続けていた。
  */
  it('チャンクの境目でも、中の区切りでも切る', () => {
    const v = { en: 'get up at six', ja: '6時に起きます', role: 'V',
      slash: [{ en: 'get up', ja: '起きます' }, { en: 'at six', ja: '6時に' }] };
    expect(slashUnits([c('I', 'わたしは', 'S'), v]).map((u) => u.en))
      .toEqual(['I', 'get up', 'at six']);
  });

  it('どのまとまりにも訳がある', () => {
    for (const unit of slashUnits([c('I', 'わたしは', 'S'), split])) {
      expect(unit.ja).not.toBe('');
    }
  });
});
