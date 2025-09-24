import { estimateNeededWords } from './vocabularyEstimator';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

// ▼▼▼【修正点1】テキストブックの定義を追加▼▼▼
// どのテキストブックから単語を探すかを定義します
const textbooks = {
  'osaka-koukou-nyuushi': '大阪府公立入試英単語',
  'target-1900': 'ターゲット1900'
};
// ▲▲▲▲▲▲

/**
 * ユーザーの学習計画を計算し、その日の学習タスク（新規・復習）を生成します。
 */
export const generateDailyPlan = async (userData, userId) => {
  const neededWordsCount = await estimateNeededWords(userData);

  const targetDateStr = userData.goal?.targetDate;
  if (!targetDateStr) {
    console.log("目標日が設定されていないため、計画を生成できません。");
    return { newWords: [], reviewWords: [] };
  }

  const today = new Date();
  const targetDate = new Date(targetDateStr);
  const remainingDays = Math.max(1, Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)));
  
  const dailyNewWordsQuota = Math.ceil(neededWordsCount / remainingDays);

  const currentVocab = userData.progress?.currentVocabulary || 0;
  const newWords = await getNewWords(userId, dailyNewWordsQuota, currentVocab);
  const reviewWords = await getReviewWords(userId);

  console.log(`残り日数: ${remainingDays}, 今日の新規ノルマ: ${dailyNewWordsQuota}語, 取得した新規単語数: ${newWords.length}語`);
  
  return {
    newWords: newWords,
    reviewWords: reviewWords,
  };
};

/**
 * まだ学習していない単語の中から、新規学習対象を取得します。
 */
// ▼▼▼【修正点2】getNewWords関数を全面的に修正▼▼▼
const getNewWords = async (userId, quota, currentVocabulary) => {
  if (quota <= 0) return []; // ノルマが0なら何もしない

  try {
    let combinedWords = [];
    // 定義されたすべてのテキストブックから単語を並行して取得
    const promises = Object.keys(textbooks).map(id => 
      getDocs(collection(db, 'textbooks', id, 'words'))
    );
    const snapshots = await Promise.all(promises);

    snapshots.forEach(snapshot => {
      const wordsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      combinedWords = [...combinedWords, ...wordsData];
    });

    // 重要: 将来的には、ここでユーザーが既に学習した単語を除外する処理が必要です。
    // 現時点では、全ての単語を対象とします。

    // レベル順に並び替え
    combinedWords.sort((a, b) => (a.level || 99) - (b.level || 99));

    // ユーザーの現在の語彙レベルに応じて、学習開始位置を調整
    // (例: 語彙数が1000なら、簡単な最初の1000語はスキップする)
    const startIndex = Math.min(currentVocabulary, combinedWords.length);
    
    return combinedWords.slice(startIndex, startIndex + quota);

  } catch (error) {
    console.error("新規単語の取得エラー:", error);
    return [];
  }
};
// ▲▲▲▲▲▲

/**
 * 忘却曲線に基づき、今日復習すべき単語のリストを取得します。
 */
const getReviewWords = async (userId) => {
  const today = new Date();
  try {
    // このコレクション名は 'userWords' で正しいか確認してください
    const userWordsCollection = collection(db, 'users', userId, 'reviewWords');
    const q = query(
      userWordsCollection, 
      where("nextReviewDate", "<=", today),
      orderBy("nextReviewDate")
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("復習単語の取得エラー:", error);
    return [];
  }
};