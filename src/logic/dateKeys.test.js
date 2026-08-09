import {
  getTokyoDateKey,
  getTokyoMonthKey,
  parseLocalDate,
  daysBetweenLocalDates,
} from './dateKeys';

describe('getTokyoDateKey', () => {
  test('UTCの前日夜は日本時間の当日になる', () => {
    // 2026-08-08T23:00Z = 2026-08-09 08:00 JST
    expect(getTokyoDateKey(new Date('2026-08-08T23:00:00Z'))).toBe('2026-08-09');
  });

  test('日本時間の 00:00 ちょうど', () => {
    // 2026-08-08T15:00Z = 2026-08-09 00:00 JST
    expect(getTokyoDateKey(new Date('2026-08-08T15:00:00Z'))).toBe('2026-08-09');
  });

  test('日本時間の 23:59', () => {
    // 2026-08-09T14:59Z = 2026-08-09 23:59 JST
    expect(getTokyoDateKey(new Date('2026-08-09T14:59:00Z'))).toBe('2026-08-09');
  });

  test('Firestore Timestamp 風のオブジェクトを受け付ける', () => {
    const timestamp = { toDate: () => new Date('2026-08-08T23:00:00Z') };
    expect(getTokyoDateKey(timestamp)).toBe('2026-08-09');
  });

  test('不正な値は null', () => {
    expect(getTokyoDateKey('これは日付ではない')).toBeNull();
  });
});

describe('getTokyoMonthKey', () => {
  test('月末深夜のUTCは翌月の日本時間になる', () => {
    // 2026-08-31T15:00Z = 2026-09-01 00:00 JST
    expect(getTokyoMonthKey(new Date('2026-08-31T15:00:00Z'))).toBe('2026-09');
  });

  test('月初の日本時間', () => {
    expect(getTokyoMonthKey(new Date('2026-08-01T09:00:00Z'))).toBe('2026-08');
  });
});

describe('parseLocalDate', () => {
  test('YYYY-MM-DD は日本時間0時になる', () => {
    expect(parseLocalDate('2026-08-09').toISOString()).toBe('2026-08-08T15:00:00.000Z');
  });

  test('空文字は null', () => {
    expect(parseLocalDate('')).toBeNull();
    expect(parseLocalDate(null)).toBeNull();
  });
});

describe('daysBetweenLocalDates', () => {
  test('同じ日は0', () => {
    expect(daysBetweenLocalDates('2026-08-09', '2026-08-09')).toBe(0);
  });

  test('翌日は1', () => {
    expect(daysBetweenLocalDates('2026-08-09', '2026-08-10')).toBe(1);
  });

  test('月をまたいでも数えられる', () => {
    expect(daysBetweenLocalDates('2026-08-09', '2026-09-08')).toBe(30);
  });

  test('過去向きは負になる', () => {
    expect(daysBetweenLocalDates('2026-08-10', '2026-08-09')).toBe(-1);
  });

  test('時刻を含んでいても暦日で数える', () => {
    // 2026-08-09 23:00 JST → 2026-08-10 01:00 JST は暦日で1日
    const from = new Date('2026-08-09T14:00:00Z');
    const to = new Date('2026-08-09T16:00:00Z');
    expect(daysBetweenLocalDates(from, to)).toBe(1);
  });
});
