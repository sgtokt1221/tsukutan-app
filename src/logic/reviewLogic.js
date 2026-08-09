import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { logStudyEvent } from './studyLogger';
import { MOTIVATION_LEVELS } from '../config';
import { getTodayKey } from './dateKeys';
import logger from './logger';
import { actionForQuality, nextSchedule, shouldRepeatToday, toQuality } from './reviewScheduling';

/**
 * 新しい単語を復習リストに追加します。
 * @param {string} userId ユーザーID
 * @param {object} word 追加する単語オブジェクト
 */
export const addWordToReview = async (userId, word) => {
  if (!userId || !word || !word.id) return;

  const reviewWordRef = doc(db, 'users', userId, 'reviewWords', word.id);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // 時間を正規化

  const newReviewWord = {
    ...word,
    lastReviewed: today,
    nextReviewDate: today,
    interval: 1, // 次回正解した場合は1日後
    easeFactor: 2.5,
    repetitions: 0,
  };

  try {
    await setDoc(reviewWordRef, newReviewWord);
    logger.debug(`単語 "${word.word}" を復習リストに追加しました。`);
    // ★キャッシュにも追加
    await addWordToDailyCache(userId, newReviewWord);
    
    // 学習ログを記録
    await logStudyEvent(userId, {
      word: word.word,
      wordId: word.id,
      sessionType: 'review',
      action: 'added',
    });
  } catch (error) {
    console.error('復習リストへの単語追加に失敗しました:', error);
  }
};

/**
 * ユーザーの単語学習進捗（復習）を更新します。
 *
 * @param {string} userId ユーザーID
 * @param {object} word 対象の単語オブジェクト
 * @param {'again'|'hard'|'good'|boolean} answer 回答。
 *   旧来の真偽値も受け取れる（true=good, false=again）。
 * @param {boolean} isReviewComplete 復習完了（復習リストから除去）するかどうか
 * @param {string} motivationLevel やる気レベル
 */
export const updateUserWordProgress = async (userId, word, answer, isReviewComplete = false, motivationLevel = 'normal') => {
  if (!userId || !word || !word.id) return { created: false, mastered: false };

  const reviewWordRef = doc(db, 'users', userId, 'reviewWords', word.id);

  try {
    const docSnap = await getDoc(reviewWordRef);
    const isFirstTime = !docSnap.exists();

    // 初めて出会う単語も、その回答を反映して状態を作る。
    // 以前はここで addWordToReview して return しており、正解しても
    // 不正解しても同じ状態（interval:1 / repetitions:0）になっていた。
    const wordData = isFirstTime
      ? { ...word, interval: 0, repetitions: 0, easeFactor: 2.5, firstSeenAt: new Date() }
      : docSnap.data();

    const today = new Date();
    today.setHours(0, 0, 0, 0); // 時間を正規化
    // 復習完了の場合は、完全に復習リストから除去
    if (isReviewComplete) {
      await removeWordFromReview(userId, word.id);
      return { created: false, mastered: true };
    }

    const config = MOTIVATION_LEVELS[motivationLevel] || MOTIVATION_LEVELS.normal;
    const quality = toQuality(answer);
    // 間隔の計算は reviewScheduling.js に切り出してある（テスト可能にするため）
    const { interval, repetitions, easeFactor } = nextSchedule(wordData, quality, config);

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

    // 「もう一度」は今日のうちにもう一度出す
    if (shouldRepeatToday(quality)) {
      await addWordToDailyCache(userId, { ...wordData, id: word.id });
    }

    // 学習ログを記録
    await logStudyEvent(userId, {
      word: word.word,
      wordId: word.id,
      sessionType: 'review',
      action: actionForQuality(quality),
      repetitions: repetitions,
      interval: interval,
      easeFactor: easeFactor,
    });

    // 初めて記録した単語かどうかを返す。呼び出し側が習得語数を数える。
    return { created: isFirstTime, mastered: false };
  } catch (error) {
    console.error('単語の進捗更新に失敗しました:', error);
    return { created: false, mastered: false, error };
  }
};

/**
 * ★新規追加：今日の学習プランキャッシュに単語を追加する
 * @param {string} userId ユーザーID
 * @param {object} wordToCache 追加する単語オブジェクト
 */
const addWordToDailyCache = async (userId, wordToCache) => {
  if (!userId || !wordToCache) return;

  const todayStr = getTodayKey();
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
        logger.debug(`キャッシュを更新しました: ${wordToCache.word}`);
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
  const todayStr = getTodayKey();
  const dailyPlanRef = doc(db, 'users', userId, 'dailyPlans', todayStr);

  try {
    // トランザクションを使用して、複数のドキュメント操作の原子性を保証
    await runTransaction(db, async (transaction) => {
      // 1. 最初にすべての読み取り操作を実行
      const dailyPlanSnap = await transaction.get(dailyPlanRef);
      
      // 2. 次に書き込み操作を実行
      // 復習リストから削除
      transaction.delete(reviewWordRef);

      // 今日のキャッシュからも削除
      if (dailyPlanSnap.exists()) {
        const currentPlan = dailyPlanSnap.data();
        const updatedReviewWords = currentPlan.reviewWords.filter(w => w.id !== wordId);
        transaction.update(dailyPlanRef, { reviewWords: updatedReviewWords });
      }
    });
    logger.debug(`単語(ID: ${wordId})が正常に削除されました。`);
    
    // 学習ログを記録
    await logStudyEvent(userId, {
      wordId: wordId,
      sessionType: 'review',
      action: 'removed',
    });
  } catch (error) {
    console.error("単語の完全削除(トランザクション)に失敗しました:", error);
  }
};