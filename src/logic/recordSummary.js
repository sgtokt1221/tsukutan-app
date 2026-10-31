/**
 * 「きろく」タブに出すものを、学習の記録（users/{uid}/logs）から組み立てる（2026-09-26 に作り直した）。
 *
 * 出すのは3つだけ：力の伸び・直近7日の勉強量・次にやるとよいこと。
 * 以前あった「正答率の推移」は外した——単語力チェックテストは正解が続くと難しくなるので、
 * 力に関係なく正答率が5割前後に集まる。伸びても横ばいに見えていた。
 * 「最適な学習時間・曜日」も外した——中身はテストを受けた時刻で、無いときは12時・月曜日の作り物だった。
 */
import { abilityScoreOf } from './rankLogic';
import { abilityFromVocabulary } from './abilityEstimate';
import { getTokyoDateKey } from './dateKeys';

const toDate = (value) => {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * テストごとの力（能力スコア）。古い順。
 * **力（ability）を記録していない古いテストは、推定語数から力を逆に求める**（2026-09-27）。
 * 判定レベルの代表値で描くと、ランク（力から出している）と食い違った（サポート太郎：ランク S 上級なのに線は別の段）。
 * ただし**推定語数を力から出すようになる前（ESTIMATE_BY_ABILITY_SINCE より前）のテストは逆に求めない**。
 * そのころの推定語数は「判定レベル以下の語を全部」数えたもので、逆に求めると上限に張り付く
 * （サポート太郎の 9/20：8,160語＝全部 → SS 上級になった）。そのテストと、単語データ（words）が無いときは、判定レベルの代表値で。
 */
export const ESTIMATE_BY_ABILITY_SINCE = new Date('2026-09-26T00:58:52Z'); // df8391c7（単語力チェックテストの推定を力からに）

export const abilityHistory = (logs = [], words = []) => logs
  .filter((log) => log && log.sessionType === 'placement_test')
  .map((log) => {
    const date = toDate(log.timestamp);
    const ability = Number.isFinite(log.ability)
      ? log.ability
      : (date && date >= ESTIMATE_BY_ABILITY_SINCE ? abilityFromVocabulary(Number(log.estimatedVocabulary), words) : null);
    return {
      date,
      score: abilityScoreOf({ level: log.finalLevel || log.level, ability: Number.isFinite(ability) ? ability : undefined }),
    };
  })
  .filter((point) => point.date && Number.isFinite(point.score))
  .sort((a, b) => a.date - b.date);

/** 1語答えた記録（reviewLogic の logStudyEvent）か */
const isAnswerEvent = (log) => log.eventType === 'study' && ['correct', 'incorrect', 'hard'].includes(log.action);

/** 勉強した時間の記録（studyLog.js の finishedLog / leftLog）か */
const isStudySession = (log) => !log.eventType
  && log.sessionType !== 'placement_test'
  && Number.isFinite(log.duration)
  && log.duration > 0;

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 直近7日（今日を含む）の勉強量。古い順。
 * @returns {Array<{key: string, label: string, minutes: number, words: number, isToday: boolean}>}
 */
export const weeklyStudy = (logs = [], now = new Date()) => {
  const days = [];
  for (let back = 6; back >= 0; back -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - back);
    days.push({
      key: getTokyoDateKey(date),
      label: back === 0 ? '今日' : WEEKDAYS[date.getDay()],
      minutes: 0,
      words: 0,
      isToday: back === 0,
    });
  }
  const byKey = new Map(days.map((day) => [day.key, day]));
  for (const log of logs) {
    if (!log) continue;
    const date = toDate(log.timestamp);
    if (!date) continue;
    const day = byKey.get(getTokyoDateKey(date));
    if (!day) continue;
    if (isStudySession(log)) day.minutes += log.duration / 60000;
    else if (isAnswerEvent(log)) day.words += 1;
  }
  return days.map((day) => ({ ...day, minutes: Math.round(day.minutes) }));
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 次にやるとよいこと（1行）。上から順に当てはまったもの。
 * @param {{ history: Array, retention: {total:number, buckets:Array}|null, weekly: Array, now?: Date }} p
 * @returns {{ text: string, action: 'test'|'home' }}
 */
export const nextAction = ({ history = [], retention = null, weekly = [], now = new Date() }) => {
  const last = history[history.length - 1];
  if (!last) return { text: '単語力チェックテストで、いまのランクを測ろう', action: 'test' };
  if (now - last.date > 30 * DAY_MS) return { text: 'ひと月ぶりにテストを受けて、伸びを確かめよう', action: 'test' };
  const learning = retention?.buckets?.find((b) => b.id === 'learning')?.count || 0;
  if (retention?.total > 0 && learning / retention.total >= 0.5) {
    return { text: '覚えかけの語が半分以上。今日は復習から', action: 'home' };
  }
  if (!weekly.find((day) => day.isToday)?.words) return { text: '今日のタスクから始めよう', action: 'home' };
  return { text: 'この調子。今日のタスクを最後まで', action: 'home' };
};
