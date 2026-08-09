const test = require('node:test');
const assert = require('node:assert');
const { arpabetToIpa, splitOnset } = require('./arpabetToIpa');

const ipa = (line) => arpabetToIpa(line.split(' '));

test('単音節の語には強勢記号を付けない', () => {
  assert.strictEqual(ipa('K AE1 T'), 'kæt');
  assert.strictEqual(ipa('S T AA1 P'), 'stɑp');
});

test('多音節の語は強勢のある音節の頭に記号が付く', () => {
  assert.strictEqual(ipa('AH0 B AW1 T'), 'əˈbaʊt');
  assert.strictEqual(ipa('W AO1 T ER0'), 'ˈwɔtɚ');
});

test('第二強勢は ˌ になる', () => {
  // understand
  assert.strictEqual(ipa('AH2 N D ER0 S T AE1 N D'), 'ˌʌndɚˈstænd');
});

test('強勢なしの AH は曖昧母音、ER は ɚ', () => {
  assert.strictEqual(ipa('AH0 B AW1 T').startsWith('ə'), true);
  assert.strictEqual(ipa('W AO1 T ER0').endsWith('ɚ'), true);
});

test('二重母音と破擦音を正しく綴る', () => {
  assert.strictEqual(ipa('CH OY1 S'), 'tʃɔɪs'); // choice
  assert.strictEqual(ipa('JH AH1 JH'), 'dʒʌdʒ'); // judge
  assert.strictEqual(ipa('TH IH1 NG K'), 'θɪŋk'); // think
});

test('音節の切れ目は最大オンセット原則に従う', () => {
  // secret: ˈsikrət（kr はまとめて後ろの音節へ）
  assert.strictEqual(ipa('S IY1 K R AH0 T'), 'ˈsikrət');
  // window: ˈwɪndoʊ（nd は頭に立てないので n は前に残す）
  assert.strictEqual(ipa('W IH1 N D OW0'), 'ˈwɪndoʊ');
});

test('splitOnset は頭に立てない連結を前の音節に残す', () => {
  assert.strictEqual(splitOnset(['n', 'd']), 1); // n | d
  assert.strictEqual(splitOnset(['k', 'r']), 0); // | kr
  assert.strictEqual(splitOnset(['t']), 0); // | t
  assert.strictEqual(splitOnset(['k', 's', 't', 'r']), 1); // k | str（extreme）
});

test('知らない音素が混ざったら null', () => {
  assert.strictEqual(ipa('K AE1 XX'), null);
  assert.strictEqual(arpabetToIpa([]), null);
});
