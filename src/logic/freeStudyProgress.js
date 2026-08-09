import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * 自由学習の進捗を保存します
 * @param {string} userId ユーザーID
 * @param {string} textbookId テキストブックID
 * @param {string|number} level レベル
 * @param {number} lastIndex 最後に学習した単語のインデックス
 */
export const saveFreeStudyProgress = async (userId, textbookId, level, lastIndex) => {
  if (!userId || !textbookId || level === undefined || lastIndex === undefined) return;

  try {
    const levelStr = String(level);
    const progressRef = doc(db, 'users', userId, 'freeStudyProgress', `${textbookId}_${levelStr}`);
    await setDoc(progressRef, {
      textbookId,
      level: levelStr,
      lastIndex,
      lastUpdated: new Date(),
    }, { merge: true });
    console.log('進捗保存成功:', `${textbookId}_${levelStr}`, lastIndex);
  } catch (error) {
    console.error('自由学習進捗の保存に失敗しました:', error);
  }
};

/**
 * 自由学習の進捗を取得します
 * @param {string} userId ユーザーID
 * @param {string} textbookId テキストブックID
 * @param {string|number} level レベル
 * @returns {Promise<number>} 最後に学習した単語のインデックス（0から開始）
 */
export const getFreeStudyProgress = async (userId, textbookId, level) => {
  if (!userId || !textbookId || level === undefined) return 0;

  try {
    const levelStr = String(level);
    const progressRef = doc(db, 'users', userId, 'freeStudyProgress', `${textbookId}_${levelStr}`);
    const progressDoc = await getDoc(progressRef);
    
    if (progressDoc.exists()) {
      const data = progressDoc.data();
      const lastIndex = data.lastIndex || 0;
      console.log('進捗取得成功:', `${textbookId}_${levelStr}`, lastIndex);
      return lastIndex;
    }
    console.log('進捗なし:', `${textbookId}_${levelStr}`);
    return 0;
  } catch (error) {
    console.error('自由学習進捗の取得に失敗しました:', error);
    return 0;
  }
};

/**
 * ユーザーの全自由学習進捗を取得します
 * @param {string} userId ユーザーID
 * @returns {Promise<Object>} 進捗データのオブジェクト
 */
export const getAllFreeStudyProgress = async (userId) => {
  if (!userId) return {};

  try {
    // 個別の進捗ドキュメントを取得するために、コレクション全体を取得
    const progressCollection = collection(db, 'users', userId, 'freeStudyProgress');
    const progressSnapshot = await getDocs(progressCollection);
    
    const progressData = {};
    progressSnapshot.forEach(doc => {
      if (doc.id !== 'all') { // 'all'ドキュメントは除外
        const data = doc.data();
        progressData[doc.id] = data.lastIndex || 0;
        console.log('進捗ドキュメント:', doc.id, data.lastIndex);
      }
    });
    
    console.log('全進捗データ:', progressData);
    return progressData;
  } catch (error) {
    console.error('全自由学習進捗の取得に失敗しました:', error);
    return {};
  }
};

/**
 * 全自由学習進捗を更新します
 * @param {string} userId ユーザーID
 * @param {Object} progressData 進捗データ
 */
export const updateAllFreeStudyProgress = async (userId, progressData) => {
  if (!userId || !progressData) return;

  try {
    const progressRef = doc(db, 'users', userId, 'freeStudyProgress', 'all');
    await setDoc(progressRef, {
      ...progressData,
      lastUpdated: new Date(),
    }, { merge: true });
  } catch (error) {
    console.error('全自由学習進捗の更新に失敗しました:', error);
  }
};
