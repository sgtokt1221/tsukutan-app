// Firebase Admin SDKを初期化
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // ← 後で作成する秘密鍵ファイル

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 登録する全目標データ
const goals = [
  // 英検
  { id: 'eiken_5', data: { displayName: '英検5級 合格', requiredVocabulary: 600, description: '中学初級レベル。英語学習の第一歩、基礎を固めましょう。' } },
  { id: 'eiken_4', data: { displayName: '英検4級 合格', requiredVocabulary: 1300, description: '中学中級レベル。身近なトピックについて話せるようになります。' } },
  { id: 'eiken_3', data: { displayName: '英検3級 合格', requiredVocabulary: 2100, description: '中学卒業レベル。海外旅行での簡単な会話に自信がつきます。' } },
  { id: 'eiken_pre2', data: { displayName: '英検準2級 合格', requiredVocabulary: 3600, description: '高校中級レベル。入試や実用で有利になる英語力の証明です。' } },
  { id: 'eiken_2', data: { displayName: '英検2級 合格', requiredVocabulary: 5100, description: '高校卒業レベル。社会で求められる英語力のスタンダードです。' } },
  { id: 'eiken_pre1', data: { displayName: '英検準1級 合格', requiredVocabulary: 8000, description: '英語で自分の意見を発信できる、高い英語力を示します。' } },
  { id: 'eiken_1', data: { displayName: '英検1級 合格', requiredVocabulary: 12000, description: '英語のエキスパートとして世界で活躍できる最高峰の資格です。' } },
  // 高校入試
  { id: 'hs_45', data: { displayName: '高校入試（偏差値45）合格', requiredVocabulary: 1500, description: 'まずは公立高校入試の基礎となる単語を確実にマスターしましょう。' } },
  { id: 'hs_50', data: { displayName: '高校入試（偏差値50）合格', requiredVocabulary: 2000, description: '公立高校の標準的な入試レベル。長文読解の土台を築きます。' } },
  { id: 'hs_60', data: { displayName: '高校入試（偏差値60）合格', requiredVocabulary: 3000, description: '難関公立・中堅私立高校レベル。応用的な長文にも対応できます。' } },
  { id: 'hs_top', data: { displayName: '高校入試（最難関）合格', requiredVocabulary: 4000, description: '最難関私立・国立高校レベル。他の受験生に差をつけます。' } },
  // 大学入試
  { id: 'uni_50', data: { displayName: '大学入試（偏差値50）合格', requiredVocabulary: 4000, description: '共通テスト・日東駒専レベル。大学受験の標準的な語彙を固めます。' } },
  { id: 'uni_60', data: { displayName: '大学入試（偏差値60）合格', requiredVocabulary: 5500, description: 'GMARCH・関関同立レベル。難関私大の長文読解で合格点をとります。' } },
  { id: 'uni_top', data: { displayName: '大学入試（最難関）合格', requiredVocabulary: 7000, description: '早慶上智・旧帝大レベル。超長文や専門的な文章を読み解きます。' } },
];

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