import {
  GOALS,
  GOAL_IDS,
  MOTIVATION_LEVELS,
  getGoal,
  getGoalsByCategory,
  getRequiredVocabulary,
  getTargetLevel,
  getRecommendedTextbooks,
  getMotivationConfig,
  toGoalIds,
} from './index';

// Firestore に実体がある教材
const KNOWN_TEXTBOOKS = ['osaka-koukou-nyuushi', 'highschool-english'];

describe('goals.json の整合性', () => {
  test('計画書8.2の目標IDが過不足なく揃っている', () => {
    expect([...GOAL_IDS].sort()).toEqual(
      [
        'eiken_1', 'eiken_2', 'eiken_3', 'eiken_4', 'eiken_5', 'eiken_pre1', 'eiken_pre2',
        'hs_45', 'hs_50', 'hs_60', 'hs_top',
        'uni_50', 'uni_60', 'uni_top',
      ].sort()
    );
  });

  test('IDが重複していない', () => {
    expect(new Set(GOAL_IDS).size).toBe(GOAL_IDS.length);
  });

  test('全目標に必要な項目が揃っている', () => {
    for (const goal of GOALS) {
      expect(typeof goal.displayName).toBe('string');
      expect(goal.displayName.length).toBeGreaterThan(0);
      expect(goal.requiredVocabulary).toBeGreaterThan(0);
      expect(goal.targetLevel).toBeGreaterThanOrEqual(1);
      // 単語データの level は 1〜7（計画書11.3）
      expect(goal.targetLevel).toBeLessThanOrEqual(7);
      expect(Array.isArray(goal.recommendedTextbooks)).toBe(true);
      expect(goal.recommendedTextbooks.length).toBeGreaterThan(0);
    }
  });

  test('推奨教材は実体のある教材IDだけを指す', () => {
    for (const goal of GOALS) {
      for (const textbookId of goal.recommendedTextbooks) {
        expect(KNOWN_TEXTBOOKS).toContain(textbookId);
      }
    }
  });

  test('英検の必要語彙数は級が上がるほど増える', () => {
    const order = ['eiken_5', 'eiken_4', 'eiken_3', 'eiken_pre2', 'eiken_2', 'eiken_pre1', 'eiken_1'];
    const values = order.map((id) => getGoal(id).requiredVocabulary);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  test('旧IDは存在しない', () => {
    for (const legacyId of ['hs1', 'hs2', 'hs3', 'hs4', 'hs5', 'uni1', 'uni2', 'uni3']) {
      expect(getGoal(legacyId)).toBeNull();
    }
  });
});

describe('getGoalsByCategory', () => {
  test('英検・高校入試・大学入試の3カテゴリに分かれる', () => {
    expect(getGoalsByCategory().map((entry) => entry.category)).toEqual(['英検', '高校入試', '大学入試']);
  });

  test('全目標がどれかのカテゴリに入る', () => {
    const total = getGoalsByCategory().reduce((sum, entry) => sum + entry.goals.length, 0);
    expect(total).toBe(GOALS.length);
  });
});

describe('選択された目標からの導出', () => {
  test('必要語彙数は最大値を採る', () => {
    expect(getRequiredVocabulary(['eiken_3', 'uni_top'])).toBe(7000);
  });

  test('目標レベルは最大値を採る', () => {
    expect(getTargetLevel(['eiken_5', 'eiken_2'])).toBe(5);
  });

  test('未知のIDは無視する', () => {
    expect(getRequiredVocabulary(['hs1', 'eiken_3'])).toBe(2100);
    expect(getTargetLevel(['なにこれ'])).toBe(0);
  });

  test('空配列は0', () => {
    expect(getRequiredVocabulary([])).toBe(0);
    expect(getTargetLevel([])).toBe(0);
  });

  test('高校入試の目標では大阪府教材が推奨される', () => {
    for (const goalId of ['hs_45', 'hs_50', 'hs_60', 'hs_top']) {
      expect(getRecommendedTextbooks([goalId])).toContain('osaka-koukou-nyuushi');
    }
  });

  test('大学入試の目標では大阪府教材は推奨されない', () => {
    for (const goalId of ['uni_50', 'uni_60', 'uni_top']) {
      expect(getRecommendedTextbooks([goalId])).not.toContain('osaka-koukou-nyuushi');
    }
  });

  test('推奨教材は重複しない', () => {
    const textbooks = getRecommendedTextbooks(['hs_60', 'hs_top']);
    expect(new Set(textbooks).size).toBe(textbooks.length);
  });
});

describe('toGoalIds', () => {
  test('goal.targets の形から goalId を取り出す', () => {
    expect(toGoalIds([{ goalId: 'eiken_3', displayName: '英検3級 合格' }])).toEqual(['eiken_3']);
  });

  test('文字列の配列もそのまま扱える', () => {
    expect(toGoalIds(['eiken_3'])).toEqual(['eiken_3']);
  });

  test('壊れた要素は落とす', () => {
    expect(toGoalIds([null, {}, { goalId: 'hs_45' }])).toEqual(['hs_45']);
  });
});

describe('motivation.json', () => {
  test('3段階が揃っている', () => {
    expect(Object.keys(MOTIVATION_LEVELS)).toEqual(['low', 'normal', 'high']);
  });

  test('やる気が上がるほど新規語数が増える', () => {
    const quotas = ['low', 'normal', 'high'].map((key) => MOTIVATION_LEVELS[key].newWordsQuota);
    expect(quotas).toEqual([...quotas].sort((a, b) => a - b));
  });

  test('全段階に必要な項目が揃っている', () => {
    for (const key of Object.keys(MOTIVATION_LEVELS)) {
      const config = MOTIVATION_LEVELS[key];
      for (const field of [
        'name', 'description', 'newWordsQuota', 'dailyReviewQuota', 'adjacentWordsQuota',
        'masteredThreshold', 'easeFactorMultiplier', 'intervalMultiplier', 'estimatedMinutesPerDay',
      ]) {
        expect(config[field]).toBeDefined();
      }
    }
  });

  test('未知のレベルは normal にフォールバックする', () => {
    expect(getMotivationConfig('なにこれ')).toBe(MOTIVATION_LEVELS.normal);
    expect(getMotivationConfig(undefined)).toBe(MOTIVATION_LEVELS.normal);
  });
});

describe('levels.json', () => {
  const { LEVELS, MAX_WORD_LEVEL, getLevel, clampLevel, getLevelLabel, getLevelEquivalent } = require('./index');

  test('レベルは1〜7の連番', () => {
    expect(LEVELS.map((entry) => entry.level)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(MAX_WORD_LEVEL).toBe(7);
  });

  test('全レベルに表示用の項目が揃っている', () => {
    for (const entry of LEVELS) {
      for (const field of ['label', 'eiken', 'cefr', 'schoolYear', 'wordsRequired', 'color']) {
        expect(entry[field]).toBeTruthy();
      }
    }
  });

  test('必要語彙数はレベルが上がるほど増える', () => {
    const values = LEVELS.map((entry) => entry.wordsRequired);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  test('英検1級を割り当てない（データに1級の単語が無い）', () => {
    expect(LEVELS.some((entry) => entry.eiken === '英検1級')).toBe(false);
  });

  test('範囲外のレベルは null', () => {
    expect(getLevel(0)).toBeNull();
    expect(getLevel(8)).toBeNull();
    expect(getLevel(10)).toBeNull();
    expect(getLevelLabel(8)).toBeNull();
  });

  test('clampLevel は1〜7に収める', () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(10)).toBe(7);
    expect(clampLevel(4)).toBe(4);
    expect(clampLevel(undefined)).toBe(1);
  });

  test('getLevelEquivalent は「英検◯級 / CEFR」形式', () => {
    expect(getLevelEquivalent(2)).toBe('英検4級 / A1');
    expect(getLevelEquivalent(99)).toBe('');
  });

  test('実データのレベルが定義の範囲に収まっている', () => {
    const master = require('../../public/data/words-master.json');
    const levels = [...new Set(master.map((word) => word.level))].sort((a, b) => a - b);
    expect(levels).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('実データに英検1級の単語が存在しない', () => {
    const master = require('../../public/data/words-master.json');
    const eiken = new Set(master.flatMap((word) => word.eikenLevels || []));
    expect(eiken.has(1)).toBe(false);
  });

  test('目標の targetLevel はすべて定義済みレベルを指す', () => {
    for (const goal of GOALS) {
      expect(getLevel(goal.targetLevel)).not.toBeNull();
    }
  });
});
