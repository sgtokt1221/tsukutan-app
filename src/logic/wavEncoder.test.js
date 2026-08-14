import { downmixToMono, encodeWavBuffer, resample, TARGET_SAMPLE_RATE } from './wavEncoder';

const readWav = (samples) => new DataView(encodeWavBuffer(samples));
const ascii = (view, offset, length) => Array.from(
  { length }, (unused, i) => String.fromCharCode(view.getUint8(offset + i))
).join('');

test('チャンネルは平均でならす', () => {
  const left = Float32Array.from([1, 0, -1]);
  const right = Float32Array.from([0, 0, 1]);
  expect(Array.from(downmixToMono([left, right]))).toEqual([0.5, 0, 0]);
});

test('モノラルはそのまま返す', () => {
  const mono = Float32Array.from([0.25, 0.5]);
  expect(downmixToMono([mono])).toBe(mono);
});

test('標本化周波数を半分にすると長さも半分になる', () => {
  const samples = Float32Array.from([0, 1, 0, -1, 0, 1, 0, -1]);
  expect(resample(samples, 32000, 16000)).toHaveLength(4);
});

test('同じ周波数なら何もしない', () => {
  const samples = Float32Array.from([0.1, 0.2]);
  expect(resample(samples, 16000, 16000)).toBe(samples);
});

test('線形補間の中間値', () => {
  // 2標本を3倍に伸ばすと、間が埋まる
  const out = resample(Float32Array.from([0, 1]), 16000, 32000);
  expect(out[0]).toBeCloseTo(0);
  expect(out[1]).toBeCloseTo(0.5);
});

test('WAV のヘッダーが 16kHz モノラル 16bit になっている', () => {
  const view = readWav(Float32Array.from([0, 0.5, -0.5]));

  expect(ascii(view, 0, 4)).toBe('RIFF');
  expect(ascii(view, 8, 4)).toBe('WAVE');
  expect(view.getUint16(20, true)).toBe(1);                     // リニアPCM
  expect(view.getUint16(22, true)).toBe(1);                     // モノラル
  expect(view.getUint32(24, true)).toBe(TARGET_SAMPLE_RATE);
  expect(view.getUint16(34, true)).toBe(16);                    // 16bit
  expect(view.getUint32(40, true)).toBe(3 * 2);                 // data の大きさ
  expect(view.byteLength).toBe(44 + 3 * 2);
});

test('範囲外の値は歪ませずに丸める', () => {
  const view = readWav(Float32Array.from([2, -2]));
  expect(view.getInt16(44, true)).toBe(0x7fff);
  expect(view.getInt16(46, true)).toBe(-0x8000);
});
