import { estimateNeededWords } from './vocabularyEstimator';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { buildThemeGroups, computeKnowledgeMap, getKnowledgeGaps } from './knowledgeAnalysis';

// ▼▼▼【修正点1】テキストブックの定義を追加▼▼▼
// どのテキストブックから単語を探すかを定義します
const textbooks = {
  'osaka-koukou-nyuushi': '大阪府公立入試英単語',
  'highschool-english': '高校英語',
  'eiken-5': '英検5級',
  'eiken-4': '英検4級',
  'eiken-3': '英検3級',
  'eiken-pre2': '英検準2級',
  'eiken-2': '英検2級',
  'eiken-pre1': '英検準1級',
  'eiken-1': '英検1級'
};
// ▲▲▲▲▲▲

/**
 * ユーザーの学習計画を計算し、その日の学習タスク（新規・復習）を生成します。
 */
// 学習時間に関する定数
const DAILY_LEARNING_GOAL_MINUTES = 30; // 1日の学習目標時間（分）
const SECONDS_PER_NEW_WORD = 60;      // 新規単語1つあたりの学習時間（秒）
const SECONDS_PER_REVIEW_WORD = 15;   // 復習単語1つあたりの学習時間（秒）
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const toDateSafe = (possibleTimestamp) => {
  if (!possibleTimestamp) return null;
  return typeof possibleTimestamp.toDate === 'function'
    ? possibleTimestamp.toDate()
    : new Date(possibleTimestamp);
};

const enrichReviewWord = (word, today) => {
  const lastReviewed = toDateSafe(word.lastReviewed);
  const nextReviewDate = toDateSafe(word.nextReviewDate);

  const daysSinceLast = lastReviewed ? Math.max(0, (today - lastReviewed) / MS_PER_DAY) : null;
  const daysUntilNext = nextReviewDate ? (nextReviewDate - today) / MS_PER_DAY : null;
  const interval = word.interval || 1;

  const overdueFactor = daysUntilNext != null ? Math.max(0, -daysUntilNext) : 0;
  const forgettingRatio = daysSinceLast != null ? daysSinceLast / Math.max(1, interval) : 0;
  const forgettingScore = forgettingRatio + overdueFactor;

  return {
    ...word,
    lastReviewed,
    nextReviewDate,
    daysSinceLast,
    daysUntilNext,
    forgettingScore,
    isOverdue: overdueFactor > 0,
  };
};

export const generateDailyPlan = async (userData, userId) => {
  const neededWordsCount = await estimateNeededWords(userData);
  const targetDateStr = userData.goal?.targetDate;

  if (!targetDateStr) {
    return {
      newWords: [],
      reviewWords: [],
      extraNewWords: [],
      dailyTarget: 0,
      remainingDays: 0,
      remainingWords: 0,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. 学習完了期限を計算（目標日の1ヶ月前）
  const targetDate = new Date(targetDateStr);
  const learningDeadline = new Date(targetDate);
  learningDeadline.setMonth(learningDeadline.getMonth() - 1);

  // 期限が過去の場合は目標日を期限とする
  if (learningDeadline < today) {
    learningDeadline.setTime(targetDate.getTime());
  }

  const remainingDays = Math.max(1, Math.ceil((learningDeadline - today) / (1000 * 60 * 60 * 24)));
  
  // 2. 2種類のノルマを計算
  // a) 期限内に終えるためのノルマ
  const deadlineBasedNewWordQuota = Math.ceil(neededWordsCount / remainingDays);

  // b) 締め切りベースのノルマをデフォルトとする
  const finalNewWordsQuota = deadlineBasedNewWordQuota;

  // 3. 単語リストを作成
  const reviewSnapshot = await getDocs(collection(db, 'users', userId, 'reviewWords'));
  const existingReviewEntries = reviewSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const enrichedReviewEntries = existingReviewEntries.map(word => enrichReviewWord(word, today));
  const learnedWordIds = new Set(enrichedReviewEntries.map(word => word.id));
  const userLevel = userData.level || 1;
  
  const { words: newWords, remainingCandidates } = await getNewWords(userId, finalNewWordsQuota, userLevel, learnedWordIds);

  // 4. 追加学習用の単語（巻いちゃう？分）を取得
  // 時間ベースのノルマを計算し、もし時間に余裕があれば追加学習を提案する
  const scheduledReviewWords = await getReviewWords(userId, enrichedReviewEntries); // 今日の復習単語
  const reviewTimeInSeconds = scheduledReviewWords.length * SECONDS_PER_REVIEW_WORD;
  const dailyGoalInSeconds = DAILY_LEARNING_GOAL_MINUTES * 60;
  const remainingTimeForNewWords = Math.max(0, dailyGoalInSeconds - (finalNewWordsQuota * SECONDS_PER_NEW_WORD) - reviewTimeInSeconds);
  const extraWordsQuota = Math.floor(remainingTimeForNewWords / SECONDS_PER_NEW_WORD);
  const extraNewWords = remainingCandidates.slice(0, extraWordsQuota > 0 ? extraWordsQuota : 0);

  // 5. 復習単語リストを最終化
  // a) 忘却防止のため、習得済みの単語をいくつか含める
  const scheduledIds = new Set(scheduledReviewWords.map(w => w.id));
  const masteredWords = await getRandomMasteredWords(userId, scheduledIds);
  
  // b) 隣接レベルの単語を追加
  let adjacentWords = [];
  if (userData.goal && userData.goal.targets && userData.goal.targets.length > 0) {
    const currentLearnedIds = new Set([...learnedWordIds, ...newWords.map(w => w.id), ...extraNewWords.map(w => w.id)]);
    adjacentWords = await getAdjacentLevelWords(userData.goal.targets, currentLearnedIds);
  }
  const uniqueAdjacentWords = adjacentWords.filter(w => !scheduledIds.has(w.id));
  
  // c) 全てを結合
  const finalReviewWords = [...scheduledReviewWords, ...masteredWords, ...uniqueAdjacentWords];

  const knowledgeMap = await computeKnowledgeMap(userId);
  const themeGroups = buildThemeGroups([...newWords, ...extraNewWords, ...finalReviewWords]);
  const knowledgeHints = getKnowledgeGaps(themeGroups, knowledgeMap).slice(0, 3);

  return {
    newWords: newWords,
    reviewWords: finalReviewWords,
    extraNewWords: extraNewWords,
    dailyTarget: deadlineBasedNewWordQuota,
    remainingDays,
    remainingWords: neededWordsCount,
    knowledgeHints,
  };
};

/**
 * ★新規追加：忘却防止のため、習得済みの単語からランダムでいくつか取得します。
 * @param {string} userId ユーザーID
 * @param {Set<string>} excludedIds 除外する単語IDのセット
 * @returns {Promise<object[]>}
 */
const getRandomMasteredWords = async (userId, excludedIds) => {
  const MASTERED_WORDS_QUOTA = 3; // 1日に復習する習得済み単語の数
  const MASTERED_REPETITIONS = 5; // 習得済みと見なす復習回数
  
  try {
    const userWordsCollection = collection(db, 'users', userId, 'reviewWords');
    const q = query(
      userWordsCollection, 
      where("repetitions", ">=", MASTERED_REPETITIONS)
    );
    const querySnapshot = await getDocs(q);

    const masteredWords = [];
    querySnapshot.forEach(doc => {
      // 今日の復習リストに既に含まれている単語は除外
      if (!excludedIds.has(doc.id)) {
        masteredWords.push({ id: doc.id, ...doc.data(), isMastered: true }); // 習得済み単語だとわかるようにフラグを立てる
      }
    });

    // ランダムにシャッフルして、定数で定義した数だけ返す
    masteredWords.sort(() => Math.random() - 0.5);
    return masteredWords.slice(0, MASTERED_WORDS_QUOTA);

  } catch (error) {
    console.error("習得済み単語の取得エラー:", error);
    return [];
  }
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
  if (quota < 0) quota = 0; // クォータが負にならないようにする

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

    // 候補の中からランダムにシャッフル
    candidateWords.sort(() => Math.random() - 0.5);
    
    // ▼▼▼【修正点4】戻り値をオブジェクトに変更▼▼▼
    const selectedWords = candidateWords.slice(0, quota);
    const remainingCandidates = candidateWords.slice(quota);
    
    return {
      words: selectedWords,
      remainingCandidates: remainingCandidates
    };
    // ▲▲▲▲▲▲

  } catch (error) {
    console.error("新規単語の取得エラー:", error);
    return { words: [], remainingCandidates: [] };
  }
};

/**
 * 忘却曲線に基づき、今日復習すべき単語のリストを取得します。
 */
const getReviewWords = async (userId, enrichedReviewEntries) => {
  const today = new Date();
  try {
    const overdue = enrichedReviewEntries.filter(entry => entry.daysUntilNext != null && entry.daysUntilNext <= 0);
    const highForget = enrichedReviewEntries
      .filter(entry => entry.daysSinceLast != null)
      .filter(entry => entry.daysSinceLast >= Math.max(3, entry.interval || 1))
      .filter(entry => !overdue.some(o => o.id === entry.id));

    const merged = [...overdue, ...highForget];
    const uniqueMap = new Map();
    merged.forEach(entry => {
      const existing = uniqueMap.get(entry.id);
      if (!existing || (entry.forgettingScore || 0) > (existing.forgettingScore || 0)) {
        uniqueMap.set(entry.id, entry);
      }
    });

    const sorted = Array.from(uniqueMap.values())
      .sort((a, b) => (b.forgettingScore || 0) - (a.forgettingScore || 0));

    return sorted;
  } catch (error) {
    console.error("復習単語の取得エラー:", error);
    return [];
  }
};