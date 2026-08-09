import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { THEMES, buildThemeGroups, themeLabels, themeDescriptions } from './themeMatcher';

// テーマの正本は src/config/themes.json（themeMatcher が読む）。
// 以前はここと StudentDashboard.js に同じ定義が2つあり、片方だけ直すとずれた。
export { THEMES as THEME_DEFINITIONS, buildThemeGroups, themeLabels, themeDescriptions };

const normalizeWord = (word) => (word || '').toLowerCase().trim();



export const computeKnowledgeMap = async (userId) => {
  if (!userId) return { learned: new Set(), struggling: new Set(), recentNew: new Set() };

  const learned = new Set();
  const struggling = new Set();
  const recentNew = new Set();

  try {
    const logsColRef = collection(db, 'users', userId, 'logs');
    const logsSnapshot = await getDocs(query(logsColRef, orderBy('timestamp', 'desc'), limit(200)));

    logsSnapshot.forEach((logDoc) => {
      const data = logDoc.data();
      if (!data?.word) return;
      const surface = normalizeWord(data.word);
      if (data.correct === false) {
        struggling.add(surface);
      } else if (data.correct === true) {
        learned.add(surface);
      }
      if (data.sessionType === 'new') {
        recentNew.add(surface);
      }
    });
  } catch (error) {
    console.error('Failed to calculate knowledge map:', error);
  }

  return { learned, struggling, recentNew };
};

export const getKnowledgeGaps = (themeGroups, knowledgeMap) => {
  if (!themeGroups || !knowledgeMap) return [];
  const gaps = [];

  Object.entries(themeGroups).forEach(([themeId, { label, words }]) => {
    if (!words || words.length === 0) return;

    let strugglingCount = 0;
    let pristineCount = 0;
    const sampleWords = [];

    words.forEach((word) => {
      const surface = normalizeWord(word.word);
      if (knowledgeMap.struggling.has(surface)) {
        strugglingCount += 1;
        if (sampleWords.length < 3) sampleWords.push(word.word);
      } else if (!knowledgeMap.learned.has(surface)) {
        pristineCount += 1;
      }
    });

    if (strugglingCount > 0 || pristineCount > 0) {
      gaps.push({
        themeId,
        label,
        strugglingCount,
        pristineCount,
        sampleWords,
      });
    }
  });

  gaps.sort((a, b) => (b.strugglingCount + b.pristineCount) - (a.strugglingCount + a.pristineCount));
  return gaps;
};
