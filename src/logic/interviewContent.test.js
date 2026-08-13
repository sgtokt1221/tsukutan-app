import { buildBeats, cardViewFor } from './interviewContent';

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

test('timerSeconds のある場面は timer になる', () => {
  const beats = buildBeats(flow, card);
  const silentRead = beats.find((beat) => beat.stepId === 'silent-read');
  expect(silentRead.kind).toBe('timer');
  expect(silentRead.timerSeconds).toBe(20);
});
