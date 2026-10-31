import {
  pagesOf, wordsInPages, pageLabel, pageRangeKey, sunshineTextbookId, gradeOfSunshineId, isSunshineTextbookId,
} from './textbookPages';

const cards = [
  { id: 'a', grade: 1, page: 12, order: 5 },
  { id: 'b', grade: 1, page: 10, order: 2 },
  { id: 'c', grade: 1, page: 10, order: 1 },
  { id: 'd', grade: 1, page: 20, order: 9 },
  { id: 'e', grade: 2, page: 10, order: 3 },
];

test('語のあるページと語数（その学年だけ・ページ順）', () => {
  expect(pagesOf(cards, 1)).toEqual([{ page: 10, count: 2 }, { page: 12, count: 1 }, { page: 20, count: 1 }]);
});

test('**ページ範囲ははじめ〜おわりを含み、ページ→表の順**。逆に選んでも同じ', () => {
  expect(wordsInPages(cards, 1, 10, 12).map((c) => c.id)).toEqual(['c', 'b', 'a']);
  expect(wordsInPages(cards, 1, 12, 10).map((c) => c.id)).toEqual(['c', 'b', 'a']);
  expect(wordsInPages(cards, 2, 10, 10).map((c) => c.id)).toEqual(['e']);
});

test('見出しと進捗の鍵（`_` `〜` を鍵に入れない）', () => {
  expect(pageLabel(10, 12)).toBe('p.10〜12');
  expect(pageLabel(10, 10)).toBe('p.10');
  expect(pageRangeKey(12, 10)).toBe('p10-12');
  expect(sunshineTextbookId(2)).toBe('sunshine-2');
  expect(gradeOfSunshineId('sunshine-3')).toBe(3);
  expect(isSunshineTextbookId('sunshine_1')).toBe(false);
});
