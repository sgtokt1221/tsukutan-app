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
