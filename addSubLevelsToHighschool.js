const fs = require('fs');

// words.jsonを読み込み
const words = JSON.parse(fs.readFileSync('words.json', 'utf8'));

console.log('=== 高校英語の単語にサブレベルを追加 ===');

// 高校英語の単語を取得（レベル5-7）
const highschoolWords = words.filter(word => word.level >= 5 && word.level <= 7);

console.log(`高校英語の単語数: ${highschoolWords.length}語`);

// 各レベルの単語数を確認
const levelCounts = {};
highschoolWords.forEach(word => {
  const level = word.level;
  levelCounts[level] = (levelCounts[level] || 0) + 1;
});

console.log('レベル別単語数:');
Object.keys(levelCounts).sort((a, b) => a - b).forEach(level => {
  console.log(`  レベル${level}: ${levelCounts[level]}語`);
});

// 各レベル内でサブレベル（A, B, C）を追加
const updatedWords = words.map(word => {
  if (word.level >= 5 && word.level <= 7) {
    // 高校英語の単語にサブレベルを追加
    const subLevels = ['A', 'B', 'C'];
    const levelWords = highschoolWords.filter(w => w.level === word.level);
    const wordIndex = levelWords.findIndex(w => w.word === word.word);
    
    if (wordIndex !== -1) {
      // 単語の順序に基づいてサブレベルを決定
      const subLevelIndex = Math.floor((wordIndex / levelWords.length) * 3);
      const subLevel = subLevels[Math.min(subLevelIndex, 2)]; // A, B, Cのいずれか
      
      return {
        ...word,
        subLevel: `${word.level}${subLevel}` // 例: 5A, 5B, 5C, 6A, 6B, 6C, 7A, 7B, 7C
      };
    }
  }
  return word;
});

// サブレベル別の単語数を確認
console.log('\\n=== サブレベル別単語数 ===');
const subLevelCounts = {};
updatedWords.forEach(word => {
  if (word.subLevel) {
    subLevelCounts[word.subLevel] = (subLevelCounts[word.subLevel] || 0) + 1;
  }
});

Object.keys(subLevelCounts).sort().forEach(subLevel => {
  console.log(`  ${subLevel}: ${subLevelCounts[subLevel]}語`);
});

// 更新されたwords.jsonを保存
fs.writeFileSync('words.json', JSON.stringify(updatedWords, null, 2));
console.log('\\n✅ words.jsonを更新しました');

// src/wordsData.jsonも更新
fs.writeFileSync('src/wordsData.json', JSON.stringify(updatedWords, null, 2));
console.log('✅ src/wordsData.jsonを更新しました');

console.log('\\n=== サンプル単語（サブレベル付き） ===');
const sampleWords = updatedWords.filter(word => word.subLevel).slice(0, 10);
sampleWords.forEach(word => {
  console.log(`  ${word.word} - レベル${word.level}${word.subLevel} - ${word.meaning || ''}`);
});

