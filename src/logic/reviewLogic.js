import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc } from 'firebase/firestore';

/**
 * 新しい単語を復習リストに追加します。
 * @param {string} userId ユーザーID
 * @param {object} word 追加する単語オブジェクト
 */
export const addWordToReview = async (userId, word) => {
  if (!userId || !word || !word.id) return;

  const reviewWordRef = doc(db, 'users', userId, 'reviewWords', word.id);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const newReviewWord = {
    ...word,
    lastReviewed: today,
    nextReviewDate: tomorrow,
    interval: 1, // 初回インターバルは1日
    easeFactor: 2.5, // SM-2アルゴリズムの初期値
    repetitions: 0, // 正解回数
  };

  try {
    await setDoc(reviewWordRef, newReviewWord);
    console.log(`単語 "${word.word}" を復習リストに追加しました。`);
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
      // 不正解の場合、インターバルをリセット
      interval = 1;
      repetitions = 0; // 連続正解記録をリセット
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

  } catch (error) {
    console.error('単語の進捗更新に失敗しました:', error);
  }
};
