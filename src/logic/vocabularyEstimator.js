import { db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import logger from './logger';

/**
 * goalsMaster は全員共通で、めったに変わらない。取得したら覚えておく。
 * 目標が複数あると、毎回その数だけ往復していた。
 */
const goalCache = new Map();

const fetchGoal = async (goalId) => {
  if (!goalId) return null;
  if (goalCache.has(goalId)) return goalCache.get(goalId);

  const snapshot = await getDoc(doc(db, 'goalsMaster', goalId));
  const data = snapshot.exists() ? snapshot.data() : null;
  goalCache.set(goalId, data);
  return data;
};

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
    // 目標は複数選べる。1件ずつ順番に待つと、選んだ数だけ往復が増える。
    // まとめて投げて、いちばん多い必要語数を採る。
    const goalDocs = await Promise.all(
      userData.goal.targets.map((target) => fetchGoal(target.goalId)),
    );

    const maxRequiredVocabulary = goalDocs.reduce(
      (max, goal) => Math.max(max, goal?.requiredVocabulary || 0),
      0,
    );

    // ▼▼▼ 【バグ修正】 'userData.progress' が存在しない場合でも安全に処理する ▼▼▼
    const currentVocabulary = userData.progress?.currentVocabulary || 0;
    // ▲▲▲ 修正完了 ▲▲▲

    const neededWords = Math.max(0, maxRequiredVocabulary - currentVocabulary);
    
    logger.debug(`目標語彙数: ${maxRequiredVocabulary}, 現在の語彙数: ${currentVocabulary}, 不足語彙数: ${neededWords}`);

    return neededWords;

  } catch (error) {
    console.error("不足語彙数の推定中にエラーが発生しました:", error);
    return 0;
  }
};