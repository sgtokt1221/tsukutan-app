/**
 * src/logic/dateKeys.js
 *
 * 日次・月次のキーを日本時間で作る。
 *
 * これまでは `new Date().toISOString().slice(0, 10)` を各所で書いていたが、
 * toISOString は UTC を返すため、日本の午前0時〜9時は「前日」のキーになる。
 * 朝に学習した生徒の記録が前日へ入り、その日の日次完了が判定できなくなる。
 *
 * Functions 側にも同じ仕様の実装がある（functions/lib/dateKeys.js）。
 * 片方だけ直すとキーがずれるので、変更するときは両方直すこと。
 */

const TOKYO_TIME_ZONE = 'Asia/Tokyo';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TOKYO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const toDate = (value) => {
  if (value == null) return new Date();
  if (value instanceof Date) return value;
  // Firestore Timestamp
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
};

/** YYYY-MM-DD（日本時間） */
export const getTokyoDateKey = (value) => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return null;
  // en-CA は YYYY-MM-DD 形式で返す
  return formatter.format(date);
};

/** YYYY-MM（日本時間） */
export const getTokyoMonthKey = (value) => {
  const dateKey = getTokyoDateKey(value);
  return dateKey ? dateKey.slice(0, 7) : null;
};

/**
 * `YYYY-MM-DD` を、その日の日本時間0時を指す Date にする。
 * `<input type="date">` の値をそのまま渡せる。
 */
export const parseLocalDate = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, year, month, day] = match;
  // +09:00 を明示して、実行環境のタイムゾーンに左右されないようにする
  return new Date(`${year}-${month}-${day}T00:00:00+09:00`);
};

/**
 * 日本時間の暦日で from から to までの日数。
 * 同じ日なら 0、翌日なら 1。時刻部分は無視する。
 */
export const daysBetweenLocalDates = (from, to) => {
  const fromKey = getTokyoDateKey(from);
  const toKey = getTokyoDateKey(to);
  if (!fromKey || !toKey) return null;

  const fromMs = parseLocalDate(fromKey).getTime();
  const toMs = parseLocalDate(toKey).getTime();
  return Math.round((toMs - fromMs) / 86400000);
};

/** 今日（日本時間）の YYYY-MM-DD。`<input type="date">` の min に使う。 */
export const getTodayKey = () => getTokyoDateKey(new Date());

/** 今月（日本時間）の YYYY-MM。 */
export const getCurrentMonthKey = () => getTokyoMonthKey(new Date());
