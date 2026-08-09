// Firebase Admin SDKを初期化
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // ← 後で作成する秘密鍵ファイル

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 登録する全目標データ。正本は src/config/goals.json。
// ここに一覧を手書きしない。goals.json を直せば投入内容も変わる。
const goalsConfig = require('./src/config/goals.json');
const goals = goalsConfig.map((goal) => ({
  id: goal.id,
  data: {
    displayName: goal.displayName,
    requiredVocabulary: goal.requiredVocabulary,
    description: goal.description,
  },
}));

async function setupGoals() {
  console.log('古いコレクションを削除しています...');
  // 大文字・小文字の間違いを両方削除
  await db.collection('Goalsmaster').get().then(snap => snap.forEach(doc => doc.ref.delete()));
  await db.collection('goalsMaster').get().then(snap => snap.forEach(doc => doc.ref.delete()));
  
  console.log('新しいgoalsMasterコレクションを作成し、データを登録しています...');
  const batch = db.batch();
  goals.forEach(goal => {
    const docRef = db.collection('goalsMaster').doc(goal.id);
    batch.set(docRef, goal.data);
  });

  await batch.commit();
  console.log('✅ セットアップが完了しました！');
}

setupGoals().catch(console.error);