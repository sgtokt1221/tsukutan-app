const admin = require('firebase-admin');
const fs = require('fs');

// ▼▼▼ ここで設定を変更 ▼▼▼
// 1. アップロードしたいファイル名を選ぶ
const JSON_FILE_PATH = './target1900.json'; // ★「target1900.json」を指定

// 2. アップロード先のコレクション名を決める
const COLLECTION_NAME = 'target-1900'; // ★「target-1900」を指定
// ▲▲▲ ここまで ▲▲▲


// --- 以下は変更不要です ---

const serviceAccount = require('./serviceAccountKey.json');

// 初期化済みでない場合のみ初期化する
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
// 新しいデータベース構造に合わせて保存場所を指定
const targetCollection = db.collection('textbooks').doc(COLLECTION_NAME).collection('words');

// 指定されたJSONファイルを読み込む
const wordsData = JSON.parse(fs.readFileSync(JSON_FILE_PATH, 'utf8'));

const uploadWords = async () => {
  console.log(`Firebaseの[textbooks/${COLLECTION_NAME}/words]へのアップロードを開始します...`);

  // 既存のデータを削除したい場合は、先に手動でFirebaseコンソールから削除してください。
  // このスクリプトは追加のみ行います。

  for (const word of wordsData) {
    try {
      await targetCollection.add(word);
      console.log(`追加成功: ${word.word}`);
    } catch (error) {
      console.error(`追加失敗: ${word.word}`, error);
    }
  }
  console.log('すべての単語のアップロードが完了しました。');
};

uploadWords();