import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';

/**
 * 新しい単語を復習リストに追加します。
 * @param {string} userId ユーザーID
 * @param {object} word 追加する単語オブジェクト
 */
export const addWordToReview = async (userId, word) => {
  if (!userId || !word || !word.id) return;

  const reviewWordRef = doc(db, 'users', userId, 'reviewWords', word.id);
  const today = new Date();

  const newReviewWord = {
    ...word,
    lastReviewed: today,
    nextReviewDate: today, // ★変更: 即時復習対象とする
    interval: 1, // 次回正解した場合は1日後
    easeFactor: 2.5,
    repetitions: 0,
  };

  try {
    await setDoc(reviewWordRef, newReviewWord);
    console.log(`単語 "${word.word}" を復習リストに追加しました。`);
    // ★キャッシュにも追加
    await addWordToDailyCache(userId, newReviewWord);
  } catch (error) {
    console.error('復習リストへの単語追加に失敗しました:', error);
  }
};

/**
 * ユーザーの単語学習進捗（復習）を更新します。
 * @param {string} userId ユーザーID
 * @param {object} word 対象の単語オブジェクト
 * @param {boolean} isCorrect 正解したかどうか
 */
export const updateUserWordProgress = async (userId, word, isCorrect) => {
  if (!userId || !word || !word.id) return;

  const reviewWordRef = doc(db, 'users', userId, 'reviewWords', word.id);

  try {
    const docSnap = await getDoc(reviewWordRef);
    let wordData;

    if (docSnap.exists()) {
      wordData = docSnap.data();
    } else {
      // もし何らかの理由で復習リストにない単語が来た場合、新規追加の処理を行う
      await addWordToReview(userId, word);
      return;
    }

    const today = new Date();
    let { interval, repetitions, easeFactor } = wordData;

    if (isCorrect) {
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.ceil(interval * easeFactor);
      }
      repetitions += 1;
    } else {
      // ★変更: 不正解の場合は即時復習
      interval = 0;
      repetitions = 0;
    }
    
    // 新しいEase Factorの計算 (SM-2アルゴリズム)
    // qは回答の質(0-5)。ここでは単純な正誤(isCorrect)を質に変換する。
    // 正解: 5, 不正解: 2 とする
    const q = isCorrect ? 5 : 2;
    easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3; // 最低E-Factor

    const nextReviewDate = new Date(today);
    nextReviewDate.setDate(today.getDate() + interval);

    await setDoc(reviewWordRef, {
      ...wordData,
      lastReviewed: today,
      nextReviewDate,
      interval,
      easeFactor,
      repetitions,
    }, { merge: true });

    // ★不正解の場合はキャッシュにも追加/復帰させる
    if (!isCorrect) {
      await addWordToDailyCache(userId, { ...wordData, id: word.id });
    }

  } catch (error) {
    console.error('単語の進捗更新に失敗しました:', error);
  }
};

/**
 * ★新規追加：今日の学習プランキャッシュに単語を追加する
 * @param {string} userId ユーザーID
 * @param {object} wordToCache 追加する単語オブジェクト
 */
const addWordToDailyCache = async (userId, wordToCache) => {
  if (!userId || !wordToCache) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const dailyPlanRef = doc(db, 'users', userId, 'dailyPlans', todayStr);

  try {
    const dailyPlanSnap = await getDoc(dailyPlanRef);

    if (dailyPlanSnap.exists()) {
      const currentPlan = dailyPlanSnap.data();
      const reviewWords = currentPlan.reviewWords || [];
      
      const isAlreadyInList = reviewWords.some(w => w.id === wordToCache.id);

      if (!isAlreadyInList) {
        const updatedReviewWords = [...reviewWords, wordToCache];
        await updateDoc(dailyPlanRef, { reviewWords: updatedReviewWords });
        console.log(`キャッシュを更新しました: ${wordToCache.word}`);
      }
    }
    // キャッシュが存在しない場合は何もしない。
    // 次回generateDailyPlanが呼ばれたときに、この単語を含んだ正しいプランが生成・キャッシュされるため。
  } catch (error) {
    console.error("日次キャッシュの更新に失敗しました:", error);
  }
};

/**
 * ★新規追加：復習リストと日次キャッシュから単語を完全に削除する
 * @param {string} userId ユーザーID
 * @param {string} wordId 削除する単語のID
 */
export const removeWordFromReview = async (userId, wordId) => {
  if (!userId || !wordId) return;

  const reviewWordRef = doc(db, 'users', userId, 'reviewWords', wordId);
  const todayStr = new Date().toISOString().split('T')[0];
  const dailyPlanRef = doc(db, 'users', userId, 'dailyPlans', todayStr);

  try {
    // トランザクションを使用して、複数のドキュメント操作の原子性を保証
    await runTransaction(db, async (transaction) => {
      // 1. 復習リストから削除
      transaction.delete(reviewWordRef);

      // 2. 今日のキャッシュからも削除
      const dailyPlanSnap = await transaction.get(dailyPlanRef);
      if (dailyPlanSnap.exists()) {
        const currentPlan = dailyPlanSnap.data();
        const updatedReviewWords = currentPlan.reviewWords.filter(w => w.id !== wordId);
        transaction.update(dailyPlanRef, { reviewWords: updatedReviewWords });
      }
    });
    console.log(`単語(ID: ${wordId})が正常に削除されました。`);
  } catch (error) {
    console.error("単語の完全削除(トランザクション)に失敗しました:", error);
  }
};
