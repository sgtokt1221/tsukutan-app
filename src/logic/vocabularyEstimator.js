import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

/**
 * ユーザーの目標と現在の語彙力から、不足している語彙数を推定します。
 * @param {object} userData - Firestoreから取得したユーザーのドキュメントデータ
 * @returns {Promise<number>} 不足していると推定される語彙数
 */
export const estimateNeededWords = async (userData) => {
  if (!userData || !userData.goal || !userData.goal.targets || userData.goal.targets.length === 0) {
    console.error("ユーザーデータに目標が設定されていません。");
    return 0;
  }

  try {
    let maxRequiredVocabulary = 0;
    for (const target of userData.goal.targets) {
      const goalDocRef = doc(db, 'goalsMaster', target.goalId);
      const goalDoc = await getDoc(goalDocRef);

      if (goalDoc.exists()) {
        const requiredVocab = goalDoc.data().requiredVocabulary;
        if (requiredVocab > maxRequiredVocabulary) {
          maxRequiredVocabulary = requiredVocab;
        }
      }
    }

    // ▼▼▼ 【バグ修正】 'userData.progress' が存在しない場合でも安全に処理する ▼▼▼
    const currentVocabulary = userData.progress?.currentVocabulary || 0;
    // ▲▲▲ 修正完了 ▲▲▲

    const neededWords = Math.max(0, maxRequiredVocabulary - currentVocabulary);
    
    console.log(`目標語彙数: ${maxRequiredVocabulary}, 現在の語彙数: ${currentVocabulary}, 不足語彙数: ${neededWords}`);

    return neededWords;

  } catch (error) {
    console.error("不足語彙数の推定中にエラーが発生しました:", error);
    return 0;
  }
};