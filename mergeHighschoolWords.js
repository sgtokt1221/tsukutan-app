const fs = require('fs');

// 既存のwords.jsonを読み込み
const wordsData = JSON.parse(fs.readFileSync('words.json', 'utf8'));
console.log(`既存のwords.json: ${wordsData.length}語`);

// highschool.jsonを読み込み
const highschoolData = JSON.parse(fs.readFileSync('highschool.json', 'utf8'));
console.log(`highschool.json: ${highschoolData.length}語`);

// 既存の単語のwordプロパティのセットを作成（重複チェック用）
const existingWords = new Set(wordsData.map(word => word.word));
console.log(`既存の単語数（重複チェック用）: ${existingWords.size}`);

// 追加する単語をフィルタリング
const wordsToAdd = [];
const skippedWords = [];

for (const word of highschoolData) {
    // 既存の単語と重複しないもののみ追加
    if (!existingWords.has(word.word)) {
        // 単語にIDを追加（既存のIDと重複しないように）
        const newWord = {
            ...word,
            id: `highschool_${word.word}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        wordsToAdd.push(newWord);
    } else {
        skippedWords.push(word.word);
    }
}

console.log(`追加する単語数: ${wordsToAdd.length}語`);
console.log(`スキップした単語数（重複）: ${skippedWords.length}語`);

// 英検級別の追加単語数を表示
const eikenCounts = {};
for (const word of wordsToAdd) {
    const eikenLevels = word.eikenLevels || [];
    for (const level of eikenLevels) {
        eikenCounts[level] = (eikenCounts[level] || 0) + 1;
    }
}

console.log('\n=== 追加される英検級別単語数 ===');
for (const [level, count] of Object.entries(eikenCounts)) {
    console.log(`英検${level}級: +${count}語`);
}

// 既存の単語と新しい単語を結合
const mergedWords = [...wordsData, ...wordsToAdd];
console.log(`\n結合後の総単語数: ${mergedWords.length}語`);

// 結合後の英検級別単語数を表示
const mergedEikenCounts = {};
for (const word of mergedWords) {
    const eikenLevels = word.eikenLevels || [];
    for (const level of eikenLevels) {
        mergedEikenCounts[level] = (mergedEikenCounts[level] || 0) + 1;
    }
}

console.log('\n=== 結合後の英検級別単語数 ===');
for (const [level, count] of Object.entries(mergedEikenCounts)) {
    console.log(`英検${level}級: ${count}語`);
}

// バックアップを作成
fs.writeFileSync('words_backup_before_merge.json', JSON.stringify(wordsData, null, 2));
console.log('\nバックアップファイルを作成: words_backup_before_merge.json');

// 結合したデータをwords.jsonに保存
fs.writeFileSync('words.json', JSON.stringify(mergedWords, null, 2));
console.log('words.jsonを更新しました');

// src/wordsData.jsonも更新
fs.writeFileSync('src/wordsData.json', JSON.stringify(mergedWords, null, 2));
console.log('src/wordsData.jsonも更新しました');

console.log('\n=== 完了 ===');
console.log(`元の単語数: ${wordsData.length}語`);
console.log(`追加した単語数: ${wordsToAdd.length}語`);
console.log(`最終的な単語数: ${mergedWords.length}語`);

