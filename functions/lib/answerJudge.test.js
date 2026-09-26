const { judgeAnswer, buildPrompt, normalize } = require('./answerJudge');

const base = {
  grade: '3',
  question: 'What do you usually do before breakfast?',
  modelAnswer: 'I usually wash my face and change my clothes.',
  transcript: 'I usually walk my dog.',
};

test('聞き取れていないときは Gemini を呼ばない', async () => {
  const generate = jest.fn();
  const result = await judgeAnswer({ ...base, transcript: '   ' }, generate);

  expect(generate).not.toHaveBeenCalled();
  expect(result.verdict).toBe('off-target');
  expect(result.reasonJa).toContain('聞き取れませんでした');
});

test('返ってきた判定をそのまま渡す', async () => {
  const generate = async () => JSON.stringify({
    verdict: 'good',
    reasonJa: '質問に完全な文で答えられています。',
    missingJa: '',
    betterAnswer: '',
  });
  const result = await judgeAnswer(base, generate);
  expect(result.verdict).toBe('good');
  expect(result.reasonJa).toBe('質問に完全な文で答えられています。');
});

test('JSON が壊れていても発音の点は返せるように落とさない', async () => {
  const result = await judgeAnswer(base, async () => 'ごめんなさい、JSONではありません');
  expect(result.verdict).toBe('partial');
  expect(result.reasonJa).toContain('発音の点だけ');
});

test('知らない verdict は partial に寄せる', () => {
  expect(normalize({ verdict: 'perfect', reasonJa: 'x' }).verdict).toBe('partial');
  expect(normalize({}).reasonJa).toBe('');
  expect(normalize({ verdict: 'off-target', reasonJa: 'y' }).verdict).toBe('off-target');
});

test('プロンプトに質問と認識結果と級の目安が入る', () => {
  const prompt = buildPrompt({ ...base, grade: 'pre1' });
  expect(prompt).toContain('What do you usually do before breakfast?');
  expect(prompt).toContain('I usually walk my dog.');
  expect(prompt).toContain('意見と根拠');
  expect(prompt).toContain('Grade: pre1');
});

test('模範解答が無くても組み立てられる', () => {
  const prompt = buildPrompt({ ...base, modelAnswer: undefined });
  expect(prompt).not.toContain('A model answer');
  expect(prompt).toContain('I usually walk my dog.');
});
