import { estimateNeededWords } from './vocabularyEstimator';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { buildThemeGroups, computeKnowledgeMap, getKnowledgeGaps } from './knowledgeAnalysis';
import { getMotivationConfig, getTargetLevel, toGoalIds, getRecommendedTextbooks } from '../config';
import { parseLocalDate, getTodayKey } from './dateKeys';
import {
  planSignature,
  isStoredPlanUsable,
  loadDailyPlan,
  saveDailyPlan,
  remainingWords,
} from './dailyPlanRepository';
import {
  computeNewWordsQuota,
  computeRemainingDays,
  dedupeAcross,
  splitIntoSessions,
  sortReviewCandidates,
  REVIEW_SESSION_SIZE,
} from './dailyPlanMath';

// Firestore に実体がある教材だけを引く。
// 以前は英検コース名（eiken-5 など）もここに並んでいたが、
// textbooks/{id}/words が存在しないため7回分の空クエリを投げていた。
const TEXTBOOK_IDS = ['osaka-koukou-nyuushi', 'highschool-english'];

const SECONDS_PER_NEW_WORD = 60;
const SECONDS_PER_REVIEW_WORD = 15;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAILY_LEARNING_GOAL_MINUTES = 30;

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

  return {
    ...word,
    lastReviewed,
    nextReviewDate,
    daysSinceLast,
    daysUntilNext,
    forgettingScore: forgettingRatio + overdueFactor,
    isOverdue: daysUntilNext != null && daysUntilNext <= 0,
  };
};

/** 目標が未設定など、計画を立てる材料が無いときに返す形 */
const emptyPlan = (reason) => ({
  newWords: [],
  reviewWords: [],
  reviewSessions: [],
  extraNewWords: [],
  dailyTarget: 0,
  preferredNewWords: 0,
  requiredNewWords: 0,
  plannedNewWords: 0,
  isFeasible: true,
  remainingDays: 0,
  remainingWords: 0,
  knowledgeHints: [],
  reason,
});

/**
 * その日の学習タスク（新規・復習）を生成する。
 *
 * Firestore の読み込みに失敗した場合は例外を投げる。
 * 空配列を返して「学習する単語がありません」と誤表示させないため（計画書10.2.9）。
 */
export const generateDailyPlan = async (userData, userId) => {
  const targetDateStr = userData?.goal?.targetDate;
  const motivationLevel = userData?.goal?.motivationLevel || 'normal';
  const motivation = getMotivationConfig(motivationLevel);

  if (!targetDateStr) {
    return emptyPlan('no-target-date');
  }

  const today = parseLocalDate(getTodayKey());
  const remainingDays = computeRemainingDays(today, parseLocalDate(targetDateStr));
  if (remainingDays == null) {
    return emptyPlan('invalid-target-date');
  }

  // 必要語数・復習単語・保存済みの計画は互いに関係が無い。
  // 順番に待つと往復のぶんだけ今日のタスクが出るのが遅くなる。
  const dateKey = getTodayKey();
  const [remainingWordsCount, reviewSnapshot, stored] = await Promise.all([
    estimateNeededWords(userData),
    getDocs(collection(db, 'users', userId, 'reviewWords')),
    loadDailyPlan(userId, dateKey),
  ]);

  // 期限由来の必要語数と、やる気レベルの希望語数の両方を出す（計画書10.2.3）
  const quota = computeNewWordsQuota({
    remainingWords: remainingWordsCount,
    remainingDays,
    preferredNewWords: motivation.newWordsQuota,
  });

  //--------------------------------------------------------------------------
  // 復習対象
  //--------------------------------------------------------------------------
  // 永続IDへ移行済みの旧文書は二重に出さない
  const allProgressEntries = reviewSnapshot.docs
    .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }))
    .filter((entry) => !entry.migratedTo);

  // 一度でも学習した単語は新規に出さない。習得済みも含める。
  // ここを復習候補から作ると、習得済みの単語が新規単語として
  // 出題し直されてしまう。
  const learnedWordIds = new Set(allProgressEntries.map((entry) => entry.id));

  // 復習候補。習得済み（status: mastered）は履歴として残しているだけなので外す。
  const enrichedReviewEntries = allProgressEntries
    .filter((entry) => entry.status !== 'mastered')
    .map((entry) => enrichReviewWord(entry, today));

  const dueForReview = sortReviewCandidates(
    enrichedReviewEntries.filter(
      (entry) =>
        entry.isOverdue ||
        (entry.daysSinceLast != null && entry.daysSinceLast >= Math.max(3, entry.interval || 1))
    )
  );

  //--------------------------------------------------------------------------
  // 保存済みの計画があればそれを使う（その日のうちは並びを変えない）
  //--------------------------------------------------------------------------
  const signature = planSignature(userData);

  if (isStoredPlanUsable(stored, signature)) {
    // 復習単語はIDだけ保存してある。今日の reviewWords から引き直す。
    // 途中で習得完了になった単語は消えるので、その分だけ減る。
    const byId = new Map(enrichedReviewEntries.map((entry) => [entry.id, entry]));
    const storedReviewWords = (stored.reviewWordIds || [])
      .map((id) => byId.get(id))
      .filter(Boolean);

    const answered = stored.answeredNewWordIds || [];
    const restoredNewWords = remainingWords(stored.newWords, answered);

    return {
      ...emptyPlan(null),
      newWords: restoredNewWords,
      reviewWords: storedReviewWords,
      reviewSessions: splitIntoSessions(storedReviewWords, REVIEW_SESSION_SIZE),
      extraNewWords: remainingWords(stored.extraNewWords || [], answered),
      dailyTarget: (stored.newWords || []).length,
      preferredNewWords: stored.quota?.preferredNewWords ?? 0,
      requiredNewWords: stored.quota?.requiredNewWords ?? 0,
      plannedNewWords: stored.quota?.plannedNewWords ?? 0,
      isFeasible: stored.quota?.isFeasible ?? true,
      remainingDays,
      remainingWords: remainingWordsCount,
      knowledgeHints: stored.knowledgeHints || [],
      dateKey,
      fromStoredPlan: true,
    };
  }

  //--------------------------------------------------------------------------
  // 新規単語
  //--------------------------------------------------------------------------
  const userLevel = userData?.level || 1;
  const goalIds = toGoalIds(userData?.goal?.targets);
  const { words: newWordCandidates, remainingCandidates } = await getNewWords(
    quota.plannedNewWords,
    userLevel,
    learnedWordIds,
    goalIds
  );

  // 時間に余裕があれば「おかわり」分を用意する
  const reviewTimeInSeconds = dueForReview.length * SECONDS_PER_REVIEW_WORD;
  const remainingTimeForNewWords = Math.max(
    0,
    DAILY_LEARNING_GOAL_MINUTES * 60 - quota.plannedNewWords * SECONDS_PER_NEW_WORD - reviewTimeInSeconds
  );
  const extraWordsQuota = Math.floor(remainingTimeForNewWords / SECONDS_PER_NEW_WORD);
  const extraCandidates = remainingCandidates.slice(0, Math.max(0, extraWordsQuota));

  //--------------------------------------------------------------------------
  // 忘却防止の習得済み単語と、隣接レベルの単語
  //--------------------------------------------------------------------------
  const scheduledIds = new Set(dueForReview.map((entry) => entry.id));
  const masteredWords = await getRandomMasteredWords(userId, scheduledIds, motivation);

  const targetLevel = getTargetLevel(goalIds);
  const adjacentWords = targetLevel > 1
    ? await getAdjacentLevelWords(targetLevel, learnedWordIds, motivation, goalIds)
    : [];

  //--------------------------------------------------------------------------
  // 重複排除。優先度は 復習 > 習得済み > 隣接 > 新規 > おかわり（計画書10.2.7）
  //--------------------------------------------------------------------------
  const [scheduled, mastered, adjacent, newWords, extraNewWords] = dedupeAcross(
    dueForReview,
    masteredWords,
    adjacentWords,
    newWordCandidates,
    extraCandidates
  );

  const finalReviewWords = [...scheduled, ...mastered, ...adjacent];
  const reviewSessions = splitIntoSessions(finalReviewWords, REVIEW_SESSION_SIZE);

  const knowledgeMap = await computeKnowledgeMap(userId);
  const themeGroups = buildThemeGroups([...newWords, ...extraNewWords, ...finalReviewWords]);
  const knowledgeHints = getKnowledgeGaps(themeGroups, knowledgeMap).slice(0, 3);

  // その日のうちは同じ計画を返せるように保存する。
  // 復習はIDだけ（reviewWords から引き直せる）、新規と隣接は中身ごと。
  await saveDailyPlan(userId, dateKey, {
    signature,
    newWords,
    extraNewWords,
    reviewWordIds: finalReviewWords.map((word) => word.id),
    knowledgeHints,
    quota: {
      preferredNewWords: quota.preferredNewWords,
      requiredNewWords: quota.requiredNewWords,
      plannedNewWords: quota.plannedNewWords,
      isFeasible: quota.isFeasible,
    },
  });

  return {
    newWords,
    reviewWords: finalReviewWords,
    reviewSessions,
    extraNewWords,
    // 画面が表示する値と、実際に生成した語数を一致させる（計画書10.4）
    dailyTarget: newWords.length,
    preferredNewWords: quota.preferredNewWords,
    requiredNewWords: quota.requiredNewWords,
    plannedNewWords: quota.plannedNewWords,
    isFeasible: quota.isFeasible,
    remainingDays,
    remainingWords: remainingWordsCount,
    knowledgeHints,
    dateKey,
    fromStoredPlan: false,
  };
};

/**
 * 忘却防止のため、習得済みの単語からランダムでいくつか取得する。
 */
const getRandomMasteredWords = async (userId, excludedIds, motivation) => {
  const userWordsCollection = collection(db, 'users', userId, 'reviewWords');
  const snapshot = await getDocs(
    query(userWordsCollection, where('repetitions', '>=', motivation.masteredThreshold))
  );

  const masteredWords = [];
  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data();
    if (excludedIds.has(docSnapshot.id) || data.migratedTo) return;
    // 生徒が自分で「リストから削除」した語（status: mastered）はここでも出さない。
    // 繰り返し回数だけで引いていたので、何回か正解してから削除した語が
    // 忘却防止の枠で戻ってきていた。削除と言いながら出てくるのはおかしい。
    // status を where に足すと複合インデックスが要るので、ここで落とす。
    if (data.status === 'mastered') return;
    masteredWords.push({ id: docSnapshot.id, ...data, isMastered: true });
  });

  masteredWords.sort(() => Math.random() - 0.5);
  return masteredWords.slice(0, motivation.dailyReviewQuota);
};

/**
 * 目標の1つ下のレベルから未学習の単語を取得する。
 *
 * 以前は goalsMaster の `level` フィールドを見ていたが、goalsMaster に level は
 * 存在しないため常に 0 になり、隣接語が一度も出ていなかった。
 * 目標レベルは src/config の targetLevel から引く。
 */
const getAdjacentLevelWords = async (targetLevel, learnedWordIds, motivation, goalIds) => {
  const adjacentLevel = targetLevel - 1;
  const textbookIds = textbooksForGoals(goalIds);

  const snapshots = await Promise.all(
    textbookIds.map((id) =>
      getDocs(query(collection(db, 'textbooks', id, 'words'), where('level', '==', adjacentLevel)))
    )
  );

  const candidateWords = [];
  snapshots.forEach((snapshot) => {
    snapshot.forEach((docSnapshot) => {
      if (learnedWordIds.has(docSnapshot.id)) return;
      candidateWords.push({ id: docSnapshot.id, ...docSnapshot.data(), isAdjacent: true });
    });
  });

  candidateWords.sort(() => Math.random() - 0.5);
  return candidateWords.slice(0, motivation.adjacentWordsQuota);
};

/** 目標に紐づく教材だけを引く。目標が無ければ全教材。 */
const textbooksForGoals = (goalIds) => {
  const recommended = getRecommendedTextbooks(goalIds).filter((id) => TEXTBOOK_IDS.includes(id));
  return recommended.length > 0 ? recommended : TEXTBOOK_IDS;
};

/**
 * ユーザーのレベルに基づき、まだ学習していない新規単語を取得する。
 */
const getNewWords = async (quota, userLevel, learnedWordIds, goalIds) => {
  const safeQuota = Math.max(0, quota);
  // 単語データのレベルは1〜7（計画書11.3）
  const targetLevels = [userLevel, userLevel + 1].filter((level) => level >= 1 && level <= 7);
  if (targetLevels.length === 0) return { words: [], remainingCandidates: [] };

  const textbookIds = textbooksForGoals(goalIds);
  const snapshots = await Promise.all(
    textbookIds.map((id) =>
      getDocs(query(collection(db, 'textbooks', id, 'words'), where('level', 'in', targetLevels)))
    )
  );

  const candidateWords = [];
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((docSnapshot) => {
      if (learnedWordIds.has(docSnapshot.id)) return;
      candidateWords.push({ id: docSnapshot.id, ...docSnapshot.data() });
    });
  });

  candidateWords.sort(() => Math.random() - 0.5);

  return {
    words: candidateWords.slice(0, safeQuota),
    remainingCandidates: candidateWords.slice(safeQuota),
  };
};
