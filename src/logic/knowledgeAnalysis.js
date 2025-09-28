import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const normalizeWord = (word) => (word || '').toLowerCase().trim();

export const THEME_DEFINITIONS = [
  {
    id: 'seeing',
    label: '見る',
    keywords: ['see', 'watch', 'look', 'view', 'glance', 'observe', 'glimpse', 'peek', 'stare', 'scan', 'survey', '見', '視', '観', '眺']
  },
  {
    id: 'opinion',
    label: '意見・考える',
    keywords: ['think', 'believe', 'opine', 'suppose', 'consider', 'reckon', 'idea', '意見', '考', '思']
  },
  {
    id: 'emotion',
    label: '感情',
    keywords: ['love', 'like', 'admire', 'hate', 'dislike', 'fear', 'worry', 'enjoy', 'emotion', '感情', '好き', '嫌', '恐']
  },
  {
    id: 'movement',
    label: '移動',
    keywords: ['go', 'come', 'move', 'travel', 'run', 'walk', 'ride', 'fly', 'depart', 'arrive', '移動', '進', '歩']
  },
  {
    id: 'effort',
    label: '学ぶ・努力',
    keywords: ['study', 'learn', 'practice', 'train', 'review', 'prepare', '努力', '学ぶ', '練習', '復習']
  },
];

export const buildThemeGroups = (words = []) => {
  const groups = {};
  if (!Array.isArray(words)) return groups;

  words.forEach((word) => {
    const surface = normalizeWord(word.word);
    const combinedMeaning = [word.meaning, word.japanese]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    THEME_DEFINITIONS.forEach((theme) => {
      const matches = theme.keywords.some((keyword) => {
        const normalized = keyword.toLowerCase();
        return surface.includes(normalized) || combinedMeaning.includes(normalized);
      });

      if (matches) {
        if (!groups[theme.id]) {
          groups[theme.id] = { label: theme.label, words: [] };
        }
        const exists = groups[theme.id].words.some(entry => entry.id === word.id);
        if (!exists) {
          groups[theme.id].words.push(word);
        }
      }
    });
  });

  return groups;
};

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
