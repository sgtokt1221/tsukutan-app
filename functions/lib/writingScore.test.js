const fs = require('fs');
const path = require('path');
const {
  FORMATS, countWords, findContractions, buildJevRequest, scoreFromJev, strictRound, callJev,
} = require('./writingScore');

const ESSAY = 'Yes. I think that families should make time to play sports together. I have two reasons. First, it is good for their health. Second, it will be a good experience for them. For these reasons, I believe that they had better play sports together.';

describe('数える（AIに数えさせない）', () => {
  test('語数：記号だけの塊は数えない', () => {
    expect(countWords('Hi, James! Thank you — for your e-mail.')).toBe(7);
    expect(countWords('')).toBe(0);
  });

  test('短縮形：I\'m / It\'s / don\'t は数え、Tom\'s は数えない', () => {
    expect(findContractions("I'm sure it's fun, but I don't know Tom's idea.")).toEqual(["I'm", "it's", "don't"]);
    expect(findContractions('I am sure it is fun.')).toEqual([]);
  });
});

describe('Jev に送る本文', () => {
  test('観点は級とタスクで決まる（Eメールは構成なし）', () => {
    const essay = buildJevRequest({ grade: 'pre2', task: 'opinion', prompt: { question: 'Q?' }, answer: ESSAY });
    expect(Object.keys(essay.questions)).toEqual(expect.arrayContaining(['content', 'organization', 'vocabulary', 'grammar', 'answersQuestion', 'twoReasons']));
    const mail = buildJevRequest({ grade: 3, task: 'email', prompt: { body: 'Hi! [[What do you like?]]' }, answer: 'I like tea.' });
    expect(mail.questions.organization).toBeUndefined();
    expect(mail.state.prompt).toContain('<u>What do you like?</u>');
  });

  test('基準は低い順に5段（0〜4）', () => {
    const req = buildJevRequest({ grade: 2, task: 'summary', prompt: { passage: ['a', 'b', 'c'] }, answer: 'x' });
    expect(req.questions.content.type).toBe('score');
    expect(req.questions.content.criteria).toHaveLength(5);
    expect(req.questions.isSummary.type).toBe('noul');
  });

  test('準1級だけ「POINTSを2つ使ったか」を聞く', () => {
    expect(buildJevRequest({ grade: 'pre1', task: 'opinion', prompt: {}, answer: ESSAY }).questions.usesTwoPoints).toBeDefined();
    expect(buildJevRequest({ grade: 2, task: 'opinion', prompt: {}, answer: ESSAY }).questions.usesTwoPoints).toBeUndefined();
  });
});

describe('点にする（堅く）', () => {
  const all = (score, extra = {}) => ({
    content: { score }, organization: { score }, vocabulary: { score }, grammar: { score }, ...extra,
  });

  test('四捨五入より 0.25 厳しく丸める', () => {
    expect(strictRound(3.7)).toBe(3);
    expect(strictRound(3.8)).toBe(4);
    expect(strictRound(-1)).toBe(0);
  });

  test('問いに答えていなければ全観点0（公式の0点ルール）', () => {
    const r = scoreFromJev({ grade: 'pre2', task: 'opinion', answer: ESSAY }, all(3.9, { answersQuestion: { noul: 0.1 }, twoReasons: { noul: 0.9 } }));
    expect(r.total).toBe(0);
    expect(r.flags).toContain('not-answersQuestion');
  });

  test('理由が2つ無ければ内容は2まで', () => {
    const r = scoreFromJev({ grade: 'pre2', task: 'opinion', answer: ESSAY }, all(4, { answersQuestion: { noul: 0.9 }, twoReasons: { noul: 0.2 } }));
    expect(r.scores.content).toBe(2);
    expect(r.scores.grammar).toBe(4);
  });

  test('要約は必須の語数から外れたら内容は2まで', () => {
    const short = 'The passage says robots help people.';
    const r = scoreFromJev({ grade: 2, task: 'summary', answer: short }, all(4, { isSummary: { noul: 0.9 } }));
    expect(r.flags).toContain('too-short');
    expect(r.scores.content).toBe(2);
  });

  test('級は文字でも数でも同じ（3級のEメールは「両方に答えたか」を聞く）', () => {
    const a = buildJevRequest({ grade: '3', task: 'email', prompt: {}, answer: 'x' });
    const b = buildJevRequest({ grade: 3, task: 'email', prompt: {}, answer: 'x' });
    expect(Object.keys(a.questions)).toEqual(Object.keys(b.questions));
    expect(a.questions.answersBoth).toBeDefined();
  });

  test('短縮形は印だけ付ける', () => {
    const r = scoreFromJev({ grade: 3, task: 'email', answer: "Hi! I'm fine. It's sunny here and I like it a lot today, thanks." }, { content: { score: 3 }, vocabulary: { score: 3 }, grammar: { score: 3 }, isReply: { noul: 0.9 }, answersBoth: { noul: 0.9 } });
    expect(r.flags).toContain('contractions');
    expect(r.max).toBe(12);
  });
});

describe('Jev を呼ぶ', () => {
  test('429 はやり直し、成功したら答えを返す', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(init);
      if (calls.length === 1) return { ok: false, status: 429 };
      return { ok: true, status: 200, json: async () => ({ model: 'jev-1.13.0', answers: { content: { score: 3 } } }) };
    };
    const json = await callJev({}, { apiKey: 'k', fetchImpl, backoffMs: 0 });
    expect(json.answers.content.score).toBe(3);
    expect(calls[0].headers.Authorization).toBe('Bearer k');
  });

  test('401 はやり直さずに失敗', async () => {
    let count = 0;
    const fetchImpl = async () => { count += 1; return { ok: false, status: 401 }; };
    await expect(callJev({}, { apiKey: 'k', fetchImpl, backoffMs: 0 })).rejects.toThrow('401');
    expect(count).toBe(1);
  });
});

describe('画面の問題データと語数がそろっている', () => {
  const dir = path.join(__dirname, '..', '..', 'public', 'eiken-writing', 'prompts');
  const grades = ['3', 'pre2', '2', 'pre1'];
  test.each(grades)('%s', (grade) => {
    const file = path.join(dir, `${grade}.json`);
    if (!fs.existsSync(file)) return; // データを作る前
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const key = grade === '3' || grade === '2' ? Number(grade) : grade;
    for (const [task, spec] of Object.entries(data.tasks)) {
      expect([spec.minWords, spec.maxWords]).toEqual([FORMATS[key][task].min, FORMATS[key][task].max]);
    }
  });
});
