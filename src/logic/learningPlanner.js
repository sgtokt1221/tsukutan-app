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

  // 今日の復習単語を取得
  const reviewWords = await getReviewWords(userId);

  // 新規単語を選ぶ際に、現在学習中（復習リストにある全単語）の単語をすべて除外する
  const allReviewWordsSnapshot = await getDocs(collection(db, 'users', userId, 'reviewWords'));
  const learnedWordIds = new Set(allReviewWordsSnapshot.docs.map(doc => doc.id));

  const userLevel = userData.level || 1; // ユーザーレベルがなければ1を仮定
  const newWords = await getNewWords(userId, dailyNewWordsQuota, userLevel, learnedWordIds);

  console.log(`残り日数: ${remainingDays}, 今日の新規ノルマ: ${dailyNewWordsQuota}語, 取得した新規単語数: ${newWords.length}語`);
  
  return {
    newWords: newWords,
    reviewWords: reviewWords,
  };
};

/**
 * ユーザーのレベルに基づき、まだ学習していない新規単語を取得します。
 */
const getNewWords = async (userId, quota, userLevel, learnedWordIds) => {
  if (quota <= 0) return [];

  try {
    // ユーザーの現在のレベルと次のレベルの単語を対象とする
    const targetLevels = [userLevel, userLevel + 1].filter(l => l <= 10);

    let candidateWords = [];
    const promises = Object.keys(textbooks).map(id => 
      getDocs(query(collection(db, 'textbooks', id, 'words'), where("level", "in", targetLevels)))
    );
    const snapshots = await Promise.all(promises);

    snapshots.forEach(snapshot => {
      snapshot.docs.forEach(doc => {
        // 既に学習リスト（復習リスト）にある単語は除外
        if (!learnedWordIds.has(doc.id)) {
          candidateWords.push({ id: doc.id, ...doc.data() });
        }
      });
    });

    // 候補の中からランダムにシャッフルして、ノルマ数だけ選択
    candidateWords.sort(() => Math.random() - 0.5);
    
    return candidateWords.slice(0, quota);

  } catch (error) {
    console.error("新規単語の取得エラー:", error);
    return [];
  }
};

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