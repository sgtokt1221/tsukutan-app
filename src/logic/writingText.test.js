import { countWords, findContractions, lengthState } from './writingText';
import { splitUnderline, tasksOf } from './writingContent';

// サーバ（functions/lib/writingScore.test.js）と同じ例。食い違ったら片方だけ直っている
describe('語数と短縮形（サーバと同じ規則）', () => {
  test('語数：記号だけの塊は数えない', () => {
    expect(countWords('Hi, James! Thank you — for your e-mail.')).toBe(7);
    expect(countWords('')).toBe(0);
  });

  test("短縮形：I'm / It's / don't は数え、Tom's は数えない", () => {
    expect(findContractions("I'm sure it's fun, but I don't know Tom's idea.")).toEqual(["I'm", "it's", "don't"]);
  });

  test('語数の状態', () => {
    expect(lengthState(20, 25, 35)).toBe('short');
    expect(lengthState(30, 25, 35)).toBe('ok');
    expect(lengthState(40, 25, 35)).toBe('long');
  });
});

describe('素材', () => {
  test('Eメールの下線 [[...]] を分ける', () => {
    expect(splitUnderline('Hi! [[What sport]] do you like? [[Why?]]')).toEqual([
      { text: 'Hi! ', underline: false },
      { text: 'What sport', underline: true },
      { text: ' do you like? ', underline: false },
      { text: 'Why?', underline: true },
    ]);
  });

  test('タスクは本番の順（Eメール／要約 → 意見論述）', () => {
    expect(tasksOf({ tasks: { opinion: {}, email: {} } })).toEqual(['email', 'opinion']);
  });
});
