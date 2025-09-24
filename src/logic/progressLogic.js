import { db } from '../firebaseConfig';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

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
    if (!goal || !goal.targets || goal.targets.length === 0 || !progress || progress.currentVocabulary === undefined) {
      console.log("進捗計算に必要なデータ（目標または現在の語彙数）がありません。");
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
    
    // 2. 現在の語彙数を取得
    const currentVocabulary = progress.currentVocabulary;

    // 3. パーセンテージを計算
    let percentage = 0;
    if (targetVocabulary > 0) {
      // 達成率が100%を超えないようにする
      percentage = Math.min(100, Math.round((currentVocabulary / targetVocabulary) * 100));
    }
    
    // 4. Firestoreを更新
    await updateDoc(userDocRef, {
      'progress.percentage': percentage,
      'progress.targetVocabulary': targetVocabulary // 目標語彙数も保存しておく
    });

    console.log(`進捗を更新しました: ${percentage}% (現在:${currentVocabulary} / 目標:${targetVocabulary})`);

  } catch (error) {
    console.error("進捗率の更新に失敗しました:", error);
  }
};
