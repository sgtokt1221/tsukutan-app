import { abilityHistory, weeklyStudy, nextAction } from './recordSummary';
import { scoreFromAbility, scoreFromLegacyLevel } from './rankLogic';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

describe('力の伸び', () => {
  test('テストだけを古い順に。力があれば力から、無ければレベルの代表値', () => {
    const logs = [
      { sessionType: 'placement_test', finalLevel: 4, ability: 4.6, timestamp: at(2026, 9, 20) },
      { sessionType: 'learning_session', duration: 60000, timestamp: at(2026, 9, 19) },
      { sessionType: 'placement_test', finalLevel: 3, timestamp: at(2026, 8, 1) },
    ];
    const history = abilityHistory(logs);
    expect(history.map((p) => p.score)).toEqual([scoreFromLegacyLevel(3), scoreFromAbility(4.6)]);
  });
});

describe('直近7日の勉強量', () => {
  const now = at(2026, 9, 26, 20);

  test('時間は学習の記録から、語数は1語ごとの記録から', () => {
    const logs = [
      { sessionType: 'learning_session', duration: 5 * 60000, timestamp: at(2026, 9, 26, 9) },
      { sessionType: 'review_session', duration: 3 * 60000, timestamp: at(2026, 9, 26, 10) },
      { eventType: 'study', action: 'correct', timestamp: at(2026, 9, 26, 9) },
      { eventType: 'study', action: 'incorrect', timestamp: at(2026, 9, 26, 9) },
      { eventType: 'study', action: 'added', timestamp: at(2026, 9, 26, 9) }, // 答えではない
      { sessionType: 'placement_test', duration: 999999, timestamp: at(2026, 9, 26, 9) }, // テストは数えない
      { sessionType: 'learning_session', duration: 60000, timestamp: at(2026, 9, 18) }, // 8日前は入らない
    ];
    const week = weeklyStudy(logs, now);
    expect(week).toHaveLength(7);
    const today = week[6];
    expect(today).toMatchObject({ label: '今日', minutes: 8, words: 2, isToday: true });
    expect(week.slice(0, 6).every((d) => d.minutes === 0 && d.words === 0)).toBe(true);
  });
});

describe('次にやるとよいこと', () => {
  const now = at(2026, 9, 26);

  test('テストを受けていなければテスト', () => {
    expect(nextAction({ now }).action).toBe('test');
  });

  test('ひと月以上たっていればテスト', () => {
    expect(nextAction({ history: [{ date: at(2026, 8, 1), score: 400 }], now }).action).toBe('test');
  });

  test('覚えかけが半分以上なら復習から', () => {
    const retention = { total: 10, buckets: [{ id: 'learning', count: 6 }] };
    expect(nextAction({ history: [{ date: at(2026, 9, 20), score: 400 }], retention, now }).text).toMatch(/復習/);
  });
});

describe('力を記録していない古いテスト（2026-09-27）', () => {
  const { abilityHistory } = require('./recordSummary');
  const { abilityFromVocabulary, expectedVocabulary } = require('./abilityEstimate');
  const words = Array.from({ length: 700 }, (_, i) => ({ id: `w${i}`, level: (i % 7) + 1 }));

  test('推定語数から力を逆に求める（expectedVocabulary の逆）', () => {
    const theta = 4.3;
    const v = expectedVocabulary(words, theta);
    expect(Math.abs(abilityFromVocabulary(v, words) - theta)).toBeLessThan(0.05);
  });

  test('**力の無いテストも、力の有るテストと同じものさしで描く**（判定レベルの代表値に落とさない）', () => {
    const v = expectedVocabulary(words, 5.5);
    const [old, now] = abilityHistory([
      { sessionType: 'placement_test', timestamp: new Date('2026-09-26T02:00:00Z'), finalLevel: 6, estimatedVocabulary: v },
      { sessionType: 'placement_test', timestamp: new Date('2026-09-27'), finalLevel: 6, ability: 5.5 },
    ], words);
    expect(Math.abs(old.score - now.score)).toBeLessThanOrEqual(2);
  });

  test('**推定の仕方が変わる前のテストは逆に求めない**（全部の語＝上限に張り付く）', () => {
    const { scoreFromLegacyLevel } = require('./rankLogic');
    const [p] = abilityHistory([{ sessionType: 'placement_test', timestamp: new Date('2026-09-20'), finalLevel: 7, estimatedVocabulary: 700 }], words);
    expect(p.score).toBe(scoreFromLegacyLevel(7));
  });

  test('単語データが無ければ判定レベルで描く（落ちない）', () => {
    const [p] = abilityHistory([{ sessionType: 'placement_test', timestamp: new Date('2026-09-20'), finalLevel: 6, estimatedVocabulary: 100 }]);
    expect(Number.isFinite(p.score)).toBe(true);
  });
});
