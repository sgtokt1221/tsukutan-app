const admin = require('firebase-admin');

// --- 設定 ---
// 古いコレクション名
const OLD_COLLECTION_NAME = 'words';
// 新しい教材ID
const TEXTBOOK_ID = 'osaka-koukou-nyuushi';
// --- 設定ここまで ---


// --- 以下は変更不要です ---
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const migrateData = async () => {
  console.log('データベース構造の変更を開始します...');

  const oldCollectionRef = db.collection(OLD_COLLECTION_NAME);
  const newCollectionRef = db.collection('textbooks').doc(TEXTBOOK_ID).collection('words');

  try {
    // 1. 古いコレクションから全データを取得
    console.log(`[1/3] '${OLD_COLLECTION_NAME}' からデータを読み込んでいます...`);
    const snapshot = await oldCollectionRef.get();
    if (snapshot.empty) {
      console.log('読み込むデータがありません。処理を終了します。');
      return;
    }
    const wordsData = snapshot.docs.map(doc => doc.data());
    console.log(`${wordsData.length}件の単語データを読み込みました。`);

    // 2. 新しいコレクションにデータを書き込み
    console.log(`[2/3] 'textbooks/${TEXTBOOK_ID}/words' へデータを書き込んでいます...`);
    const batch = db.batch();
    wordsData.forEach(word => {
      const newDocRef = newCollectionRef.doc(); // 新しいIDでドキュメントを作成
      batch.set(newDocRef, word);
    });
    await batch.commit();
    console.log('データの書き込みが完了しました。');

    // 3. (任意) 古いコレクションを削除
    // 安全のため、この部分は手動で有効にしてください。
    // 完全に移行が確認できた後、下の行のコメント(//)を外して再度実行すると古いデータが消えます。
    // console.log(`[3/3] 古いコレクション '${OLD_COLLECTION_NAME}' を削除します...`);
    // await deleteCollection(db, OLD_COLLECTION_NAME, 100);
    // console.log('古いコレクションの削除が完了しました。');

    console.log('データベースの構造変更が正常に完了しました！');

  } catch (error) {
    console.error('移行中にエラーが発生しました:', error);
  }
};

// コレクション削除用の関数
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

migrateData();