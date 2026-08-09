import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import logger from './logger';

/**
 * 日次計画の保存と読み出し。
 *
 * users/{uid}/dailyPlans/{YYYY-MM-DD}
 *
 * 以前は画面を開くたびに新規単語を抽選し直していた（getNewWords が
 * Math.random でシャッフルする）。途中で抜けて戻ると別の単語が並び、
 * 1日の新規語数も上限を超えて増えていた。
 *
 * 単語の中身も保存する。IDだけだと再開のたびに教材コレクションを
 * 引き直すことになり、読み取りが増えるうえ、教材が差し替わると
 * その日の計画が崩れる。
 */

/** 計画の形を変えたら上げる。上げると既存の計画は作り直される。 */
export const PLAN_VERSION = 1;

/**
 * 計画を作り直すべきかを決める署名。
 * 目標・達成日・やる気・レベルが変わったら、その日の計画も作り直す。
 */
export const planSignature = (userData) => [
  (userData?.goal?.targets || []).map((t) => t?.goalId || t).sort().join(','),
  userData?.goal?.targetDate || '',
  userData?.goal?.motivationLevel || 'normal',
  String(userData?.level ?? ''),
].join('|');

/** 保存済み計画がそのまま使えるか */
export const isStoredPlanUsable = (stored, signature) =>
  Boolean(stored)
  && stored.planVersion === PLAN_VERSION
  && stored.signature === signature
  && Array.isArray(stored.newWords);

export const loadDailyPlan = async (userId, dateKey) => {
  if (!userId || !dateKey) return null;
  try {
    const snapshot = await getDoc(doc(db, 'users', userId, 'dailyPlans', dateKey));
    return snapshot.exists() ? snapshot.data() : null;
  } catch (error) {
    // 読めなくても学習は続けられる。作り直しになるだけ。
    logger.warn('日次計画を読み込めませんでした', error);
    return null;
  }
};

export const saveDailyPlan = async (userId, dateKey, payload) => {
  if (!userId || !dateKey) return;
  try {
    await setDoc(doc(db, 'users', userId, 'dailyPlans', dateKey), {
      dateKey,
      planVersion: PLAN_VERSION,
      generatedAt: new Date(),
      answeredNewWordIds: [],
      ...payload,
    });
  } catch (error) {
    logger.warn('日次計画を保存できませんでした', error);
  }
};

/**
 * 回答した新規単語を記録する。
 * 1語ずつ書くのは、途中でブラウザを閉じても取りこぼさないため。
 */
export const markNewWordAnswered = async (userId, dateKey, wordId) => {
  if (!userId || !dateKey || !wordId) return;
  try {
    await updateDoc(doc(db, 'users', userId, 'dailyPlans', dateKey), {
      answeredNewWordIds: arrayUnion(wordId),
    });
  } catch (error) {
    logger.warn('日次計画の回答記録に失敗しました', error);
  }
};

/** 回答済みを除いた残りを返す。順番は保存時のまま保つ。 */
export const remainingWords = (words = [], answeredIds = []) => {
  const answered = new Set(answeredIds);
  return words.filter((word) => !answered.has(word?.id));
};
