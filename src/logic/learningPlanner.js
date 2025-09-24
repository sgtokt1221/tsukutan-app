import { estimateNeededWords } from './vocabularyEstimator';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';

// ▼▼▼【修正点1】テキストブックの定義を追加▼▼▼
// どのテキストブックから単語を探すかを定義します
const textbooks = {
  'osaka-koukou-nyuushi': '大阪府公立入試英単語',
  'target-1900': 'ターゲット1900'
};
// ▲▲▲▲▲▲

/**
 * ユーザーの学習計画を計算し、その日の学習タスク（新規・復習）を生成します。
 */
export const generateDailyPlan = async (userData, userId) => {
  // --- 既存のロジック ---
  const neededWordsCount = await estimateNeededWords(userData);
  const targetDateStr = userData.goal?.targetDate;
  if (!targetDateStr) {
    return { newWords: [], reviewWords: [] };
  }
  const today = new Date();
  const targetDate = new Date(targetDateStr);
  const remainingDays = Math.max(1, Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)));
  const dailyNewWordsQuota = Math.ceil(neededWordsCount / remainingDays);

  const allReviewWordsSnapshot = await getDocs(collection(db, 'users', userId, 'reviewWords'));
  const learnedWordIds = new Set(allReviewWordsSnapshot.docs.map(doc => doc.id));
  const userLevel = userData.level || 1;
  const newWords = await getNewWords(userId, dailyNewWordsQuota, userLevel, learnedWordIds);

  // --- 新規ロジック：隣接レベルの単語を追加 ---
  let adjacentWords = [];
  if (userData.goal && userData.goal.targets && userData.goal.targets.length > 0) {
    adjacentWords = await getAdjacentLevelWords(userData.goal.targets, learnedWordIds);
  }

  // --- 復習単語の結合 ---
  const scheduledReviewWords = await getReviewWords(userId);
  
  // adjacentWordsがscheduledReviewWordsに既に含まれていないことを確認
  const scheduledIds = new Set(scheduledReviewWords.map(w => w.id));
  const uniqueAdjacentWords = adjacentWords.filter(w => !scheduledIds.has(w.id));
  
  const finalReviewWords = [...scheduledReviewWords, ...uniqueAdjacentWords];

  return {
    newWords: newWords,
    reviewWords: finalReviewWords,
  };
};

/**
 * ★新規追加：目標の隣接（下位）レベルから未学習の単語を取得します
 */
const getAdjacentLevelWords = async (targets, learnedWordIds) => {
  const ADJACENT_WORDS_QUOTA = 10;
  try {
    // 1. マスターデータから全目標を取得
    const goalsMasterRef = collection(db, 'goalsMaster');
    const goalsSnapshot = await getDocs(goalsMasterRef);
    const goalsMasterData = goalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2. ユーザーの目標の最大レベルを特定
    let maxGoalLevel = 0;
    targets.forEach(target => {
      const masterGoal = goalsMasterData.find(g => g.id === target.goalId);
      if (masterGoal && masterGoal.level > maxGoalLevel) {
        maxGoalLevel = masterGoal.level;
      }
    });

    if (maxGoalLevel <= 1) return [];

    // 3. 隣接レベル（目標-1）の単語を取得
    const adjacentLevel = maxGoalLevel - 1;
    let candidateWords = [];
    const promises = Object.keys(textbooks).map(id => 
      getDocs(query(collection(db, 'textbooks', id, 'words'), where("level", "==", adjacentLevel)))
    );
    const snapshots = await Promise.all(promises);

    snapshots.forEach(snapshot => {
      snapshot.forEach(doc => {
        if (!learnedWordIds.has(doc.id)) {
          candidateWords.push({ id: doc.id, ...doc.data(), isAdjacent: true }); // 復習単語だとわかるようにフラグを立てる
        }
      });
    });

    // 4. ランダムに10個選択
    candidateWords.sort(() => Math.random() - 0.5);
    return candidateWords.slice(0, ADJACENT_WORDS_QUOTA);

  } catch (error) {
    console.error("隣接レベル単語の取得エラー:", error);
    return [];
  }
};

/**
 * ユーザーのレベルに基づき、まだ学習していない新規単語を取得します。
 */
const getNewWords = async (userId, quota, userLevel, learnedWordIds) => {
  if (quota <= 0) return [];

  try {
    // ユーザーの現在のレベルと次のレベルの単語を対象とする
    const targetLevels = [userLevel, userLevel + 1].filter(l => l <= 10);

    let candidateWords = [];
    const promises = Object.keys(textbooks).map(id => 
      getDocs(query(collection(db, 'textbooks', id, 'words'), where("level", "in", targetLevels)))
    );
    const snapshots = await Promise.all(promises);

    snapshots.forEach(snapshot => {
      snapshot.docs.forEach(doc => {
        // 既に学習リスト（復習リスト）にある単語は除外
        if (!learnedWordIds.has(doc.id)) {
          candidateWords.push({ id: doc.id, ...doc.data() });
        }
      });
    });

    // 候補の中からランダムにシャッフルして、ノルマ数だけ選択
    candidateWords.sort(() => Math.random() - 0.5);
    
    return candidateWords.slice(0, quota);

  } catch (error) {
    console.error("新規単語の取得エラー:", error);
    return [];
  }
};

/**
 * 忘却曲線に基づき、今日復習すべき単語のリストを取得します。
 */
const getReviewWords = async (userId) => {
  const today = new Date();
  try {
    // このコレクション名は 'userWords' で正しいか確認してください
    const userWordsCollection = collection(db, 'users', userId, 'reviewWords');
    const q = query(
      userWordsCollection, 
      where("nextReviewDate", "<=", today),
      orderBy("nextReviewDate")
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("復習単語の取得エラー:", error);
    return [];
  }
};