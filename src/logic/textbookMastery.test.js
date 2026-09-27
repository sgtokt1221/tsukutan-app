import { orderForPicker, textbookBreakdown } from './textbookMastery';

jest.mock('firebase/functions', () => ({ getFunctions: jest.fn(), httpsCallable: jest.fn() }));

const entry = (id, counts, total) => ({ id, title: id, total, counts: { unlearned: 0, known: 0, learning: 0, settling: 0, retained: 0, graduated: 0, ...counts } });

test('学んだ語が多い教材から並べ、語の無い教材は出さない', () => {
  const list = orderForPicker([
    entry('a', { unlearned: 100 }, 100),
    entry('b', { learning: 3, unlearned: 97 }, 100),
    entry('empty', {}, 0),
    entry('c', { retained: 10, unlearned: 90 }, 100),
  ]);
  expect(list.map((m) => m.id)).toEqual(['c', 'b', 'a']);
  expect(list[0].learned).toBe(10);
});

test('1冊の内訳：分母はその教材の語数。まだ＝未学習、テストで分かっている＝推定', () => {
  const b = textbookBreakdown(entry('LEAP', { graduated: 5, retained: 10, settling: 20, learning: 15, known: 30, unlearned: 20 }, 100));
  expect(b.total).toBe(100);
  expect(b.buckets.map((x) => [x.id, x.count])).toEqual([
    ['graduated', 5], ['retained', 10], ['settling', 20], ['learning', 15], ['known', 30], ['notYet', 20],
  ]);
  expect(b.buckets.reduce((s, x) => s + x.percent, 0)).toBeCloseTo(100);
  expect(b.caption).toContain('学んだ語 50 語');
});

test('語が無ければ何も出さない', () => {
  expect(textbookBreakdown(entry('x', {}, 0))).toBeNull();
});
