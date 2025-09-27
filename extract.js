const fs = require('fs');

// ファイル名を指定
const targetFile = 'words.json'; // 'words.json' に変えてもう一度実行

// JSONファイルを読み込む
const rawData = fs.readFileSync(targetFile);
const wordsArray = JSON.parse(rawData);

// "word"の値だけを抜き出す
const wordList = wordsArray.map(item => item.word);

// 結果を改行で区切って表示
console.log(wordList.join('\n'));