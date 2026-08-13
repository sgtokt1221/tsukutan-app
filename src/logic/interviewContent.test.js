import { buildBeats, cardViewFor, speakingFor } from './interviewContent';

const flow = {
  steps: [
    { id: 'greeting', phase: 'enter', interviewer: 'Hello.' },
    { id: 'silent-read', phase: 'read', interviewer: 'Please read the passage silently for 20 seconds.', timerSeconds: 20 },
    { id: 'read-aloud', phase: 'read', interviewer: 'Now, please read it aloud.', recordsStudent: true },
    { id: 'questions-intro', phase: 'questions', interviewer: "Now, I'll ask you four questions." },
    { id: 'turn-over', phase: 'questions', interviewer: 'Please turn over the card and put it down.', afterQuestion: 2 },
    { id: 'goodbye', phase: 'leave', interviewer: 'You may go now.' },
  ],
};

const card = {
  questions: [
    { no: 1, type: 'passage', cardVisible: true, prompt: 'Q1' },
    { no: 2, type: 'narration', cardVisible: true, prompt: 'Q2' },
    { no: 3, type: 'opinion', cardVisible: false, prompt: 'Q3' },
    { no: 4, type: 'opinion', cardVisible: false, prompt: 'Q4' },
  ],
};

test('設問は questions-intro の直後に、番号順で入る', () => {
  const keys = buildBeats(flow, card).map((beat) => beat.key);
  expect(keys).toEqual([
    'step-greeting',
    'step-silent-read',
    'step-read-aloud',
    'step-questions-intro',
    'q-1',
    'q-2',
    'step-turn-over',
    'q-3',
    'q-4',
    'step-goodbye',
  ]);
});

test('カードを裏返す合図は afterQuestion の設問の直後にだけ出る', () => {
  const beats = buildBeats(flow, card);
  const turnOvers = beats.filter((beat) => beat.stepId === 'turn-over');
  expect(turnOvers).toHaveLength(1);
  expect(beats[beats.indexOf(turnOvers[0]) - 1].key).toBe('q-2');
});

test('裏返す合図の無い級（3級）でも設問がそのまま並ぶ', () => {
  const noTurnOver = { steps: flow.steps.filter((step) => step.id !== 'turn-over') };
  const keys = buildBeats(noTurnOver, card).map((beat) => beat.key);
  expect(keys).not.toContain('step-turn-over');
  expect(keys.slice(4, 8)).toEqual(['q-1', 'q-2', 'q-3', 'q-4']);
});

test('裏返したあとの設問ではカードを見せない', () => {
  const beats = buildBeats(flow, card);
  const view = (key) => cardViewFor(beats.find((beat) => beat.key === key));
  expect(view('q-1')).toBe('passage');
  expect(view('q-2')).toBe('illustration');
  expect(view('q-3')).toBe('none');
  expect(view('step-silent-read')).toBe('passage');
  expect(view('step-greeting')).toBe('none');
});

test('受験者自身のことを聞く設問では、裏返さない級でも絵を出さない', () => {
  // 3級は最後までカードを持ったままだが、絵の説明をさせる設問ではない
  const personal = { kind: 'question', question: { type: 'personal', prompt: 'Do you often listen to music?' } };
  const opinion = { kind: 'question', question: { type: 'opinion', prompt: 'Do you think ...?' } };
  const illustration = { kind: 'question', question: { type: 'illustration', prompt: 'How many cups ...?' } };
  expect(cardViewFor(personal)).toBe('none');
  expect(cardViewFor(opinion)).toBe('none');
  expect(cardViewFor(illustration)).toBe('illustration');
});

test('timerSeconds のある場面は timer になる', () => {
  const beats = buildBeats(flow, card);
  const silentRead = beats.find((beat) => beat.stepId === 'silent-read');
  expect(silentRead.kind).toBe('timer');
  expect(silentRead.timerSeconds).toBe(20);
});

describe('speakingFor', () => {
  const readAloud = buildBeats(flow, card).find((beat) => beat.stepId === 'read-aloud');
  const q1 = buildBeats(flow, card).find((beat) => beat.key === 'q-1');
  const withPassage = { passage: { text: 'Many people listen to the radio.' } };

  test('音読は scripted。読むべき英文を渡す', () => {
    expect(speakingFor(readAloud, withPassage)).toEqual({
      mode: 'scripted',
      referenceText: 'Many people listen to the radio.',
    });
  });

  test('設問は unscripted。質問文と模範解答を渡す', () => {
    const target = { ...q1, question: { ...q1.question, modelAnswer: 'Because ...' } };
    expect(speakingFor(target, withPassage)).toEqual({
      mode: 'unscripted',
      question: 'Q1',
      modelAnswer: 'Because ...',
    });
  });

  test('Yes を選んだら、採点は追い質問のほうに切り替わる', () => {
    const target = {
      kind: 'question',
      question: {
        prompt: 'Do you like reading?',
        followUp: {
          yes: { prompt: 'Why?', modelAnswer: 'Because it is fun.' },
          no: { prompt: 'Why not?', modelAnswer: 'I have no time.' },
        },
      },
    };
    expect(speakingFor(target, withPassage, 'yes')).toEqual({
      mode: 'unscripted',
      question: 'Do you like reading? (Yes) Why?',
      modelAnswer: 'Because it is fun.',
    });
    expect(speakingFor(target, withPassage, 'no').modelAnswer).toBe('I have no time.');
  });

  test('挨拶など、声を出さない場面は null', () => {
    const greeting = buildBeats(flow, card).find((beat) => beat.stepId === 'greeting');
    expect(speakingFor(greeting, withPassage)).toBeNull();
    expect(speakingFor(null, withPassage)).toBeNull();
  });

  test('準1級のナレーションは、あらすじと書き出しを質問として渡す', () => {
    const beat = { stepId: 'narration', kind: 'line' };
    const pre1Card = {
      narration: { storyLine: 'This is a story about a woman.', openingSentence: 'One Sunday morning, ...' },
    };
    expect(speakingFor(beat, pre1Card)).toEqual({
      mode: 'unscripted',
      question: 'This is a story about a woman. Begin with: One Sunday morning, ...',
    });
  });
});
