import { db } from '../firebaseConfig';
import { doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
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
 * @param {{revealed?: boolean}} [options] 答えを見てから答えたか。
 *   見たうえでの「わかった」は思い出せたことにならないので、記録に残して
 *   後から精度を測れるようにする。
 */
export const updateUserWordProgress = async (
  userId,
  word,
  answer,
  isReviewComplete = false,
  motivationLevel = 'normal',
  { revealed = false } = {}
) => {
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
      // まだ一度も出会っていない語をそのまま卒業させると、単語の中身が
      // 入っていない文書だけが残る（レベルも綴りも無いので、到達語数の
      // 集計にも定着の内訳にも乗らない）。先に中身を書いておく。
      if (isFirstTime) {
        await setDoc(reviewWordRef, { ...wordData, lastReviewed: today }, { merge: true });
      }
      await markWordAsMastered(userId, word.id);
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
      lastAnswerRevealed: revealed,
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
      // 答えを見てから答えたか。分析で「見て正解」を除けるようにする。
      revealed,
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
      // 日次計画は復習単語をIDの配列で持つ（dailyPlanRepository.js）。
      // 以前は単語の中身の配列 reviewWords を持っていたので形が違う。
      await updateDoc(dailyPlanRef, { reviewWordIds: arrayUnion(wordToCache.id) });
      logger.debug(`今日の計画に戻しました: ${wordToCache.word}`);
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
/**
 * 復習完了。文書は消さず status: mastered にする。
 *
 * 以前は削除していたため、習得済みだったという事実まで消えていた。
 * 消えると「学習履歴の無い単語」に戻るので、新規単語として再び出題され、
 * 習得語数の集計からも落ちる（計画書§2.1 / §6.1）。
 *
 * コレクション名は reviewWords のまま。改名は移行が必要なわりに
 * 得られるのは名前だけで、履歴を残すという目的には要らない。
 */
export const markWordAsMastered = async (userId, wordId) => {
  if (!userId || !wordId) return;

  const reviewWordRef = doc(db, 'users', userId, 'reviewWords', wordId);
  const todayStr = getTodayKey();
  const dailyPlanRef = doc(db, 'users', userId, 'dailyPlans', todayStr);

  try {
    await setDoc(reviewWordRef, {
      status: 'mastered',
      masteredAt: new Date(),
      nextReviewDate: null,
    }, { merge: true });

    // 今日の計画からは外す
    const dailyPlanSnap = await getDoc(dailyPlanRef);
    if (dailyPlanSnap.exists()) {
      await updateDoc(dailyPlanRef, { reviewWordIds: arrayRemove(wordId) });
    }

    logger.debug(`単語(ID: ${wordId})を習得済みにしました。`);

    await logStudyEvent(userId, {
      wordId: wordId,
      sessionType: 'review',
      action: 'mastered',
    });
  } catch (error) {
    console.error('習得済みへの更新に失敗しました:', error);
  }
};