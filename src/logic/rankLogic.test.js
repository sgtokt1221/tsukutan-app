import {
  RANK_IDS,
  bestRankOf,
  clampToAwardable,
  evaluateRankChange,
  getRank,
  isAwardable,
  nextRank,
  pointsToNextRank,
  progressWithinRank,
  rankForScore,
  scoreFromLegacyLevel,
} from './rankLogic';
import { buildEquivalency, rankRangeLabel, roundToeic } from './examEquivalency';

describe('ランクの定義', () => {
  test('E から SS の順に並んでいる', () => {
    expect(RANK_IDS).toEqual(['E', 'D', 'C', 'B', 'A', 'S', 'SS']);
  });

  test('境界が隙間なく、重ならずに続いている', () => {
    for (let i = 1; i < RANK_IDS.length; i += 1) {
      const prev = getRank(RANK_IDS[i - 1]);
      const curr = getRank(RANK_IDS[i]);
      expect(curr.min).toBe(prev.max + 1);
    }
  });

  test('0から1000までを覆っている', () => {
    expect(getRank('E').min).toBe(0);
    expect(getRank('SS').max).toBe(1000);
  });

  test('計画書3.2の境界値どおりに分類する', () => {
    const cases = [
      [0, 'E'], [149, 'E'], [150, 'D'], [274, 'D'],
      [275, 'C'], [424, 'C'], [425, 'B'], [574, 'B'],
      [575, 'A'], [724, 'A'], [725, 'S'], [849, 'S'],
      [850, 'SS'], [1000, 'SS'],
    ];
    for (const [score, expected] of cases) {
      expect([score, rankForScore(score).id]).toEqual([score, expected]);
    }
  });

  test('範囲外のスコアは端に丸める', () => {
    expect(rankForScore(-50).id).toBe('E');
    expect(rankForScore(5000).id).toBe('SS');
  });

  test('数値でなければ未測定', () => {
    expect(rankForScore(undefined)).toBeNull();
    expect(rankForScore(null)).toBeNull();
    expect(rankForScore(NaN)).toBeNull();
  });
});

describe('SS のロック', () => {
  test('SS は正式判定に使えない（C1問題バンク未整備）', () => {
    expect(isAwardable('SS')).toBe(false);
    expect(getRank('SS').locked).toBe(true);
  });

  test('SS 以外はすべて判定に使える', () => {
    for (const id of ['E', 'D', 'C', 'B', 'A', 'S']) {
      expect([id, isAwardable(id)]).toEqual([id, true]);
    }
  });

  test('SS 相当のスコアでも付与は S までに留める', () => {
    expect(clampToAwardable('SS')).toBe('S');
  });

  test('SS の換算は出さない（英検1級相当を根拠なく見せない）', () => {
    const eq = buildEquivalency({ score: 900 });
    expect(eq.locked).toBe(true);
    expect(eq.eiken).toBeNull();
    expect(eq.toeic).toBeNull();
  });
});

describe('次のランクまでの距離', () => {
  test('計画書3.3の例（518点 → Aまで57）と一致する', () => {
    expect(rankForScore(518).id).toBe('B');
    expect(pointsToNextRank(518)).toBe(57);
  });

  test('境界ちょうどなら0', () => {
    expect(pointsToNextRank(574)).toBe(1);
    expect(pointsToNextRank(575)).toBe(150);
  });

  test('最上位では距離を出さない', () => {
    expect(pointsToNextRank(900)).toBeNull();
  });

  test('現ランク内の進み具合は0〜1に収まる', () => {
    expect(progressWithinRank(425)).toBe(0);
    expect(progressWithinRank(574)).toBe(1);
    expect(progressWithinRank(518)).toBeGreaterThan(0.6);
    expect(progressWithinRank(518)).toBeLessThan(0.7);
  });

  test('nextRank は最上位で null', () => {
    expect(nextRank('SS')).toBeNull();
    expect(nextRank('A').id).toBe('S');
  });
});

describe('昇格・維持・降格', () => {
  test('初回はそのまま付与する', () => {
    const result = evaluateRankChange({ currentRankId: null, score: 500, confidenceLow: 470, confidenceHigh: 530 });
    expect(result).toMatchObject({ rankId: 'B', outcome: 'initial' });
  });

  test('昇格は信頼区間の下限が次の境界を超えたときだけ', () => {
    // 点推定は A 帯だが、下限が B 帯 → 上げない
    const held = evaluateRankChange({ currentRankId: 'B', score: 580, confidenceLow: 540, confidenceHigh: 620 });
    expect(held.outcome).toBe('near-promotion');
    expect(held.rankId).toBe('B');

    const promoted = evaluateRankChange({ currentRankId: 'B', score: 620, confidenceLow: 580, confidenceHigh: 660 });
    expect(promoted).toMatchObject({ rankId: 'A', outcome: 'promoted' });
  });

  test('1回下振れしただけでは降格しない', () => {
    const first = evaluateRankChange({ currentRankId: 'B', score: 400, confidenceLow: 370, confidenceHigh: 420 });
    expect(first).toMatchObject({ rankId: 'B', outcome: 'held-low', consecutiveLowResults: 1 });
  });

  test('2回続けて下回ったら降格する', () => {
    const second = evaluateRankChange({
      currentRankId: 'B', score: 400, confidenceLow: 370, confidenceHigh: 420, consecutiveLowResults: 1,
    });
    expect(second).toMatchObject({ rankId: 'C', outcome: 'demoted', consecutiveLowResults: 0 });
  });

  test('SS へは昇格させない', () => {
    const result = evaluateRankChange({ currentRankId: 'S', score: 900, confidenceLow: 880, confidenceHigh: 950 });
    expect(result.rankId).toBe('S');
    expect(result.outcome).not.toBe('promoted');
  });

  test('信頼区間が無ければ点推定で代用する', () => {
    const result = evaluateRankChange({ currentRankId: 'B', score: 620 });
    expect(result).toMatchObject({ rankId: 'A', outcome: 'promoted' });
  });
});

describe('自己ベスト', () => {
  test('下がっても自己ベストは残る', () => {
    expect(bestRankOf('A', 'C')).toBe('A');
    expect(bestRankOf('C', 'A')).toBe('A');
  });

  test('片方が未設定なら他方', () => {
    expect(bestRankOf(null, 'B')).toBe('B');
    expect(bestRankOf('B', null)).toBe('B');
    expect(bestRankOf(null, null)).toBeNull();
  });
});

describe('英検・TOEIC の参考換算', () => {
  test('TOEIC は5点刻みで丸める', () => {
    expect(roundToeic(387)).toBe(385);
    expect(roundToeic(383)).toBe(385);
    expect(roundToeic(548)).toBe(550);
  });

  test('計画書3.3の例と同じ文言になる', () => {
    const eq = buildEquivalency({ score: 518 });
    expect(eq.eiken).toBe('英検準2級〜準2級プラス相当の目安');
    expect(eq.toeic.label).toBe('TOEIC L&R 385〜545点の参考レンジ');
  });

  test('断定表現を作らない', () => {
    for (const id of ['E', 'D', 'C', 'B', 'A', 'S']) {
      const rank = getRank(id);
      const eq = buildEquivalency({ score: rank.min });
      expect(eq.eiken).toMatch(/相当の目安$/);
      expect(eq.toeic.label).toMatch(/参考レンジ$/);
      expect(eq.eiken).not.toMatch(/合格|公式認定/);
    }
  });

  test('注記と換算表のバージョンが常に付く', () => {
    const eq = buildEquivalency({ score: 300 });
    expect(eq.disclaimer).toMatch(/保証するものではありません/);
    expect(eq.tableVersion).toBeGreaterThan(0);
  });

  test('測っていない技能を明示する', () => {
    expect(buildEquivalency({ score: 300 }).notMeasured).toEqual(['Speaking', 'Writing']);
  });

  test('未測定なら換算も出さない', () => {
    expect(buildEquivalency({ score: undefined })).toBeNull();
  });
});

describe('信頼区間がまたぐときの表示', () => {
  test('区間が同じランク内なら断定する', () => {
    expect(rankRangeLabel({ score: 500, confidenceLow: 480, confidenceHigh: 540 })).toBe('B');
  });

  test('区間が境界をまたぐなら範囲で示す', () => {
    expect(rankRangeLabel({ score: 570, confidenceLow: 540, confidenceHigh: 600 })).toBe('B〜A');
  });

  test('未測定は未測定', () => {
    expect(rankRangeLabel({ score: null })).toBe('未測定');
  });
});

describe('移行期間の level → スコア', () => {
  test('現行の1〜7がすべて写せる', () => {
    for (let level = 1; level <= 7; level += 1) {
      expect([level, Number.isFinite(scoreFromLegacyLevel(level))]).toEqual([level, true]);
    }
  });

  test('レベルが上がるほどスコアも上がる', () => {
    const scores = [1, 2, 3, 4, 5, 6, 7].map(scoreFromLegacyLevel);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  test('現行の最高レベル7は S 止まりで、SS にはならない', () => {
    // levels.json のレベル7は CEFR B2 / 英検準1級。ランクSの定義と一致する。
    // 既存Lv.7を名前だけSSにして英検1級相当と表示しない（計画書2.3）。
    expect(rankForScore(scoreFromLegacyLevel(7)).id).toBe('S');
    expect(rankForScore(scoreFromLegacyLevel(7)).id).not.toBe('SS');
  });

  test('level のCEFRとランクのCEFRが食い違わない', () => {
    const LEVELS = require('../config/levels.json');
    const pairs = LEVELS.map((entry) => [
      entry.cefr,
      rankForScore(scoreFromLegacyLevel(entry.level)).cefr,
    ]);
    // A2 は C/B に、B1 は B/A に分かれるので前方一致で確認する
    for (const [levelCefr, rankCefr] of pairs) {
      const head = levelCefr.split('-')[0];
      expect([levelCefr, rankCefr.startsWith(head)]).toEqual([levelCefr, true]);
    }
  });

  test('未測定(0)は写さない', () => {
    expect(scoreFromLegacyLevel(0)).toBeNull();
    expect(scoreFromLegacyLevel(undefined)).toBeNull();
  });
});
