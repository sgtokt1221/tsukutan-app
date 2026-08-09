const fs = require('fs');

console.log('=== words.jsonに再分類されたhighschool.jsonを反映 ===');

// words.jsonを読み込み
const wordsData = JSON.parse(fs.readFileSync('words.json', 'utf8'));
console.log(`words.jsonの単語数: ${wordsData.length}語`);

// highschool.jsonを読み込み
const highschoolData = JSON.parse(fs.readFileSync('highschool.json', 'utf8'));
console.log(`highschool.jsonの単語数: ${highschoolData.length}語`);

// 既存のhighschool.jsonの単語をwords.jsonから削除
const existingHighschoolWords = new Set(highschoolData.map(word => word.word));
const filteredWords = wordsData.filter(word => !existingHighschoolWords.has(word.word));
console.log(`既存のhighschool単語を削除後のwords.json: ${filteredWords.length}語`);

// 再分類されたhighschool.jsonの単語をwords.jsonに追加
const updatedWords = [...filteredWords, ...highschoolData];
console.log(`更新後のwords.json: ${updatedWords.length}語`);

// 更新されたwords.jsonを保存
fs.writeFileSync('words.json', JSON.stringify(updatedWords, null, 2));

// src/wordsData.jsonも更新
fs.writeFileSync('src/wordsData.json', JSON.stringify(updatedWords, null, 2));

console.log('=== 更新完了 ===');
console.log('words.jsonとsrc/wordsData.jsonが更新されました');

// 更新後のレベル分布を確認
const levelDistribution = {};
updatedWords.forEach(word => {
  const level = word.level || 1;
  levelDistribution[level] = (levelDistribution[level] || 0) + 1;
});

console.log('\n更新後のレベル分布:');
Object.keys(levelDistribution).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
  console.log(`レベル${level}: ${levelDistribution[level]}語`);
});

// 高校英語単語のレベル分布を確認
const highschoolLevelDistribution = {};
highschoolData.forEach(word => {
  const level = word.level || 1;
  highschoolLevelDistribution[level] = (highschoolLevelDistribution[level] || 0) + 1;
});

console.log('\n高校英語単語のレベル分布:');
Object.keys(highschoolLevelDistribution).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
  console.log(`レベル${level}: ${highschoolLevelDistribution[level]}語`);
});