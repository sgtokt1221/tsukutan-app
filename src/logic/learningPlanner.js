import { estimateNeededWords } from './vocabularyEstimator';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

/**
 * ユーザーの学習計画を計算し、その日の学習タスク（新規・復習）を生成します。
 * @param {object} userData - Firestoreから取得したユーザーのドキュメントデータ
 * @param {string} userId - ログインしているユーザーのID
 * @returns {Promise<object>} 今日の学習タスクリスト { newWords: [], reviewWords: [] }
 */
export const generateDailyPlan = async (userData, userId) => {
  const neededWordsCount = await estimateNeededWords(userData);

  // ▼▼▼ 【バグ修正】 'userData.goal' が存在しない場合でも安全に処理する ▼▼▼
  const targetDateStr = userData.goal?.targetDate;
  if (!targetDateStr) {
    console.log("目標日が設定されていないため、計画を生成できません。");
    return { newWords: [], reviewWords: [] }; // 目標日がなければ空の計画を返す
  }
  // ▲▲▲ 修正完了 ▲▲▲

  const today = new Date();
  const targetDate = new Date(targetDateStr);
  const remainingDays = Math.max(1, Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)));
  
  const dailyNewWordsQuota = Math.ceil(neededWordsCount / remainingDays);

  const newWords = await getNewWords(userId, dailyNewWordsQuota, userData.progress?.currentVocabulary || 0);
  const reviewWords = await getReviewWords(userId);

  console.log(`残り日数: ${remainingDays}, 今日の新規ノルマ: ${dailyNewWordsQuota}語`);
  
  return {
    newWords: newWords,
    reviewWords: reviewWords,
  };
};

/**
 * まだ学習していない単語の中から、新規学習対象を取得します。
 */
const getNewWords = async (userId, quota, currentVocabulary) => {
  // ... (この関数は変更なし)
  try {
    const allWordsCollection = collection(db, 'words');
    const q = query(allWordsCollection, orderBy('level'), limit(quota + 20));
    const querySnapshot = await getDocs(q);
    const words = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return words.slice(0, quota);
  } catch (error) {
    console.error("新規単語の取得エラー:", error);
    return [];
  }
};

/**
 * 忘却曲線に基づき、今日復習すべき単語のリストを取得します。
 */
const getReviewWords = async (userId) => {
  // ... (この関数は変更なし)
  const today = new Date();
  try {
    const userWordsCollection = collection(db, 'userWords');
    const q = query(
      userWordsCollection, 
      where("userId", "==", userId), 
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