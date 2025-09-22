const admin = require('firebase-admin');
const fs = require('fs'); // ← 修正点：ファイルシステムモジュールを追加

// 1. サービスアカウントの秘密鍵ファイルを指定
const serviceAccount = require('./serviceAccountKey.json');

// 2. Firebase Admin SDKを初期化
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const wordsCollection = db.collection('words');

// 3. words.jsonファイルを読み込む
const wordsData = JSON.parse(fs.readFileSync('./words.json', 'utf8'));

// 4. Firestoreにデータをアップロード
const uploadWords = async () => {
  console.log('Firebaseへのアップロードを開始します...');

  // ※ 既存のデータを一度すべて削除したい場合は、この行のコメントを外してください。
  // await deleteCollection(db, 'words', 100); 

  for (const word of wordsData) {
    try {
      // 既存の同じ単語を上書きしたい場合は .doc(word.word).set(word) を使う
      // 新しく追加していきたい場合は .add(word) を使う
      await wordsCollection.add(word); 
      console.log(`追加成功: ${word.word}`);
    } catch (error) {
      console.error(`追加失敗: ${word.word}`, error);
    }
  }
  console.log('すべての単語のアップロードが完了しました。');
};

// 5. 既存コレクション削除用の関数（必要に応じて使用）
async function deleteCollection(db, collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(db, query, resolve) {
  const snapshot = await query.get();

  if (snapshot.size === 0) {
    return resolve();
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

uploadWords();