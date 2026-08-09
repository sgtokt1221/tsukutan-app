const fs = require('fs');

// highschool.jsonを読み込み
const highschoolData = JSON.parse(fs.readFileSync('highschool.json', 'utf8'));

console.log('=== 高校英語単語の再分類開始 ===');
console.log(`総単語数: ${highschoolData.length}語`);

// 現在のレベル分布を確認
const currentDistribution = {};
highschoolData.forEach(word => {
  const level = word.level || 1;
  currentDistribution[level] = (currentDistribution[level] || 0) + 1;
});

console.log('現在のレベル分布:');
Object.keys(currentDistribution).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
  console.log(`レベル${level}: ${currentDistribution[level]}語`);
});

// 高校英語として適切なレベル分布に再分類
// レベル5（英検2級レベル）: 20%
// レベル6（英検準1級レベル）: 50%  
// レベル7（英検準1級〜1級レベル）: 30%

const reclassifiedData = highschoolData.map((word, index) => {
  const ratio = index / highschoolData.length;
  
  let newLevel;
  if (ratio < 0.2) {
    newLevel = 5; // 英検2級レベル
  } else if (ratio < 0.7) {
    newLevel = 6; // 英検準1級レベル
  } else {
    newLevel = 7; // 英検準1級〜1級レベル
  }
  
  return {
    ...word,
    level: newLevel
  };
});

// 再分類後のレベル分布を確認
const newDistribution = {};
reclassifiedData.forEach(word => {
  const level = word.level || 1;
  newDistribution[level] = (newDistribution[level] || 0) + 1;
});

console.log('\n再分類後のレベル分布:');
Object.keys(newDistribution).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
  console.log(`レベル${level}: ${newDistribution[level]}語`);
});

// 更新されたhighschool.jsonを保存
fs.writeFileSync('highschool.json', JSON.stringify(reclassifiedData, null, 2));

console.log('\n=== 再分類完了 ===');
console.log('highschool.jsonが更新されました');

// サンプル単語を表示
console.log('\n各レベルのサンプル単語:');
[5, 6, 7].forEach(level => {
  const sampleWords = reclassifiedData
    .filter(word => word.level === level)
    .slice(0, 5)
    .map(word => word.word);
  console.log(`レベル${level}: ${sampleWords.join(', ')}`);
});