/**
 * 読みもののデータに入れた「区切りごとの訳」を見張る。
 *
 * **区切りはあるのに訳が無い、を作らない。** スラッシュ読みは訳を見ながら
 * 前から意味を取る練習なので、訳の無い `/` は練習にならない。
 * 画面では気づけない（英語だけ並んで、下が空になるだけ）。
 *
 * 訳は `scripts/slash-translate.mjs` が作る。切る位置を変えたら作り直すこと。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { slashUnits, slashPiecesFor } from './slashReading';

const DIR = join(process.cwd(), 'public/reading');

const files = readdirSync(DIR)
  .flatMap((grade) => {
    let entries = [];
    try { entries = readdirSync(join(DIR, grade)); } catch { return []; }
    return entries
      .filter((name) => name.endsWith('.json'))
      .map((name) => ({ id: `${grade}/${name}`, path: join(DIR, grade, name) }));
  });

const readings = files.map((file) => ({
  ...file,
  data: JSON.parse(readFileSync(file.path, 'utf8')),
}));

const allChunks = readings.flatMap((r) => (r.data.sentences || []).flatMap(
  (sentence, si) => sentence.chunks.map((chunk, ci) => ({ chunk, where: `${r.id} 文${si + 1} 区切り${ci + 1}` })),
));

test('読みものを読み込めている', () => {
  expect(readings.length).toBeGreaterThan(10);
  expect(allChunks.length).toBeGreaterThan(500);
});

test('**切れるチャンクには必ず `slash` が入っている**（入れ忘れると区切りが消える）', () => {
  const missing = allChunks
    .filter(({ chunk }) => slashPiecesFor(chunk).length > 1 && !Array.isArray(chunk.slash))
    .map(({ where }) => where);
  expect(missing).toEqual([]);
});

test('**`slash` は今の切り方と一致している**（規則を変えたら作り直す）', () => {
  const stale = allChunks
    .filter(({ chunk }) => Array.isArray(chunk.slash))
    .filter(({ chunk }) => {
      const pieces = slashPiecesFor(chunk);
      return chunk.slash.length !== pieces.length
        || chunk.slash.some((p, i) => p.en !== pieces[i]);
    })
    .map(({ where }) => where);
  expect(stale).toEqual([]);
});

test('**小片をつなぐと元の英語に戻る**（語を落としていない）', () => {
  const broken = allChunks
    .filter(({ chunk }) => Array.isArray(chunk.slash))
    .filter(({ chunk }) => chunk.slash.map((p) => p.en).join(' ') !== chunk.en)
    .map(({ where }) => where);
  expect(broken).toEqual([]);
});

test('**どの区切りにも訳がある**', () => {
  const empty = [];
  for (const reading of readings) {
    (reading.data.sentences || []).forEach((sentence, si) => {
      slashUnits(sentence.chunks).forEach((unit, ui) => {
        if (!String(unit.ja || '').trim()) empty.push(`${reading.id} 文${si + 1} まとまり${ui + 1}`);
      });
    });
  }
  expect(empty).toEqual([]);
});

test('訳に余計な記号を入れない（文末の句点・改行）', () => {
  const odd = allChunks
    .filter(({ chunk }) => Array.isArray(chunk.slash))
    .filter(({ chunk }) => chunk.slash.some((p) => /[。\n]/.test(p.ja)))
    .map(({ where }) => where);
  expect(odd).toEqual([]);
});
