/**
 * **単語のレベル（1〜7）がルールCで付け直されたままであること**（2026-09-24）。
 *
 * もとは高校英語をファイルの並び順だけで 5/6/7 に振り分けていて、レベル7が
 * レベル6よりやさしかった（英検の平均 4.87 < 4.95）。規則の正本は scripts/lib/relevel.js。
 * 赤くなったら：`npm run build:levels`（付け直し → 単語帳 → 目録）
 */
const fs = require('fs');
const path = require('path');
const { relevelAll, easiestEiken } = require('../../scripts/lib/relevel');

const ROOT = path.join(__dirname, '..', '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

const master = read('public/data/words-master.json');
const osaka = read('public/data/words-osaka.json');
const highschool = read('public/data/words-highschool.json');
const origin = read('data-sources/firestore-textbooks.json');

test('**いまのレベルは規則どおり**（付け直しを流しても1語も変わらない）', () => {
  const levels = relevelAll({
    master,
    highschoolIds: new Set(highschool.map((w) => w.id)),
    osakaIds: new Set(osaka.map((w) => w.id)),
    highschoolOrigin: origin['highschool-english'],
    osakaOrigin: [...read('public/words.json'), ...origin['osaka-koukou-nyuushi']],
  });
  const off = master.filter((w) => levels.get(w.id).level !== w.level).map((w) => w.word);
  expect(off).toEqual([]);
});

test('**教材ファイルのレベルは単語データと同じ**（大阪府の自由学習は教材ファイルを読む）', () => {
  const byId = new Map(master.map((w) => [w.id, w.level]));
  for (const list of [osaka, highschool]) {
    const off = list.filter((w) => byId.has(w.id) && byId.get(w.id) !== w.level).map((w) => w.word);
    expect(off).toEqual([]);
  }
});

test('**細かい段（subLevel）は残っていない**（ファイルの並び順で付いた値だった）', () => {
  for (const list of [master, osaka, highschool]) {
    expect(list.filter((w) => 'subLevel' in w)).toHaveLength(0);
  }
});

test('**レベルが上がるほど英検の級も上がる**（レベル7がレベル6よりやさしくならない）', () => {
  const SCORE = { 5: 1, 4: 2, 3: 3, pre2: 4, 2: 5, pre1: 6, 1: 7 };
  const means = [1, 2, 3, 4, 5, 6, 7].map((level) => {
    const scores = master.filter((w) => w.level === level).map(easiestEiken).filter((e) => e != null).map((e) => SCORE[e]);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  });
  for (let i = 1; i < means.length; i += 1) expect(means[i]).toBeGreaterThan(means[i - 1]);
});
