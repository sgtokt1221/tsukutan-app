import { fitScale, fitLatin } from './useFitText';

describe('折り返す前に縮める', () => {
  test('入るならそのまま', () => {
    expect(fitScale(100, 150, 0.5)).toEqual({ scale: 1, wrap: false });
  });

  test('下限までに入るなら1行のまま縮める', () => {
    const r = fitScale(200, 150, 0.5);
    expect(r.wrap).toBe(false);
    expect(r.scale).toBeCloseTo(0.75);
  });

  test('下限でも入らなければ、少ない行数でいちばん大きく折り返す', () => {
    const r = fitScale(600, 150, 0.5);
    expect(r.wrap).toBe(true);
    expect(r.lines).toBe(3);
    expect(r.scale).toBeGreaterThanOrEqual(0.5);
    expect(r.scale).toBeLessThanOrEqual(1);
  });

  test('1行目だけ「隠す」のぶん狭い', () => {
    expect(fitScale(120, 150, 0.5, 48).scale).toBeCloseTo(102 / 120);
  });
});

describe('英語は語の途中で切らない', () => {
  test('1語は下限を越えてでも1行に縮め、折り返さない', () => {
    const r = fitLatin('accommodation', 400, 150, 0.8);
    expect(r.wrap).toBe(false);
    expect(r.scale).toBeCloseTo(150 / 400);
  });

  test('句は、いちばん長い語が1行に入る大きさまでしか大きくしない', () => {
    const text = 'environmentally friendly';
    const r = fitLatin(text, 480, 150, 0.9);
    const longest = 480 * (15 / text.length);
    expect(r.scale * longest).toBeLessThanOrEqual(150 + 0.01);
  });
});
