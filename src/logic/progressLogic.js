import { db } from '../firebaseConfig';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { loadWordMaster } from './wordMaster';
import { achievementPercentage, reachedWordCount } from './vocabularyCount';
import { estimateLevel } from './estimatedLevel';
import logger from './logger';

/**
 * ユーザーの目標達成度（パーセンテージ）を計算し、Firestoreのユーザーデータを更新します。
 * @param {string} userId 更新対象のユーザーID
 */
export const updateProgressPercentage = async (userId) => {
  if (!userId) return;

  try {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error("ユーザーデータが見つかりません。");
      return;
    }

    const userData = userDoc.data();
    const goal = userData.goal;
    const progress = userData.progress;

    // 目標が設定されていない、または現在の語彙数がなければ計算不可
    if (!goal || !goal.targets || goal.targets.length === 0 || !progress) {
      logger.debug("進捗計算に必要なデータ（目標または現在の語彙数）がありません。");
      await updateDoc(userDocRef, { 'progress.percentage': 0 });
      return;
    }

    // 1. 目標の語彙数を計算する
    const goalIds = goal.targets.map(t => t.goalId);
    if (goalIds.length === 0) {
        await updateDoc(userDocRef, { 'progress.percentage': 0 });
        return;
    }

    const goalsMasterRef = collection(db, 'goalsMaster');
    const goalsSnapshot = await getDocs(goalsMasterRef);
    const goalsMasterData = goalsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const targetVocabularies = goalIds.map(id => {
        const masterGoal = goalsMasterData.find(g => g.id === id);
        return masterGoal ? masterGoal.requiredVocabulary : 0;
    });

    const targetVocabulary = Math.max(...targetVocabularies);
    
    // 2. 到達語数を数え直す。
    //    足し算ではなく和集合。実力テストの判定範囲と、そこから外れた
    //    復習完了語だけを足す（二重加算をやめる）。
    const assessedLevel = userData.level || 0;
    const [master, reviewSnapshot] = await Promise.all([
      loadWordMaster().catch(() => []),
      getDocs(collection(db, 'users', userId, 'reviewWords')),
    ]);
    const reviewWords = reviewSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const reached = reachedWordCount({ master, reviewWords, assessedLevel });

    // 3. パーセンテージを計算
    const percentage = achievementPercentage(reached.total, targetVocabulary);

    // 4. Firestoreを更新
    // 復習の卒業ぐあいから見たレベル。測った値（level）は動かさない。
    // ここは master と reviewWords を既に読んでいるので、ついでに出す。
    const { estimated, nextRatio } = estimateLevel({ master, reviewWords });

    await updateDoc(userDocRef, {
      'progress.estimatedLevel': estimated,
      'progress.estimatedNextRatio': nextRatio,
      'progress.percentage': percentage,
      'progress.targetVocabulary': targetVocabulary, // 目標語彙数も保存しておく
      'progress.currentVocabulary': reached.total,
      // 内訳も残す。表示と検証のため。
      'progress.assessedVocabulary': reached.assessed,
      'progress.masteredBeyondAssessment': reached.masteredBeyond,
      'progress.assessedLevel': assessedLevel,
    });

    logger.debug(
      `進捗を更新しました: ${percentage}% `
      + `(到達:${reached.total} = テスト範囲${reached.assessed} + 復習完了${reached.masteredBeyond} / 目標:${targetVocabulary})`
    );

  } catch (error) {
    console.error("進捗率の更新に失敗しました:", error);
  }
};
