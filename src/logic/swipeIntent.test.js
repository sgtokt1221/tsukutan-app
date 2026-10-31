import { swipeIntentAt, testIntentAt, nextIntervalDays, reviewGaps, intentText, daysText } from './swipeIntent';
import { flashcardGesture, TEST_SWIPE } from './cardGestures';
import { studyModePolicy } from './studyMode';

describe('離すとどうなるかの札', () => {
  it('少ししか動かしていなければ出さない（タップのぶれ）', () => {
    expect(swipeIntentAt(5, 3, true)).toBeNull();
  });

  it('右＝わかった／左＝もう一度', () => {
    expect(swipeIntentAt(50, 0, false).kind).toBe('good');
    expect(swipeIntentAt(-50, 0, false).kind).toBe('again');
  });

  it('**上は、上スワイプが効くモードのときだけ**', () => {
    expect(swipeIntentAt(0, -80, true).kind).toBe('remove');
    expect(swipeIntentAt(0, -80, false)).toBeNull();
  });

  it('**「決まり」は、離したときの判定と必ず一致する**', () => {
    for (const allow of [true, false]) {
      for (let dx = -160; dx <= 160; dx += 20) {
        for (let dy = -160; dy <= 160; dy += 20) {
          const intent = swipeIntentAt(dx, dy, allow);
          const gesture = flashcardGesture(dx, dy, allow);
          if (intent?.locked) expect(gesture).toBe(intent.kind);
          if (gesture === 'good' || gesture === 'again' || gesture === 'remove') {
            expect(intent?.kind).toBe(gesture);
            expect(intent.locked).toBe(true);
          }
        }
      }
    }
  });

  it('決まるまでは円を満たさない', () => {
    expect(swipeIntentAt(60, 0, false).progress).toBeLessThan(1);
    expect(swipeIntentAt(150, 0, false).progress).toBe(1);
  });
});

describe('次は何日後', () => {
  it('記録の無い語（はじめて）は明日', () => {
    expect(nextIntervalDays(null)).toBe(1);
    expect(daysText(1)).toBe('明日また出る');
  });

  it('**記録を読み終えるまでは日数を言わない**', () => {
    expect(daysText(null)).toBe('次に出るまでの間があく');
    expect(intentText('good', { days: null, policy: studyModePolicy('free') }).detail).toBe('次に出るまでの間があく');
  });

  it('記録があれば、その記録から計算する（3回目のわかったは17日後）', () => {
    expect(nextIntervalDays({ interval: 6, repetitions: 2, easeFactor: 2.7 })).toBe(17);
    expect(intentText('good', { days: 17, policy: studyModePolicy('free') }).detail).toBe('17日後にまた出る');
  });

  it('2回目のわかったは6日後（実際に書く計算と同じ）', () => {
    expect(nextIntervalDays({ interval: 1, repetitions: 1, easeFactor: 2.6 })).toBe(6);
  });

  it('続けて覚えると間が伸びる', () => {
    expect(reviewGaps(4)).toEqual([1, 6, 17, 48]);
  });
});

describe('札の文言', () => {
  it('上スワイプの札には「上にスワイプしても同じ」を付けない', () => {
    const text = intentText('remove', { policy: studyModePolicy('review') });
    expect(text.title).toBe('もう覚えた');
    expect(text.detail).toBe('もう出題されなくなります');
  });
});

describe('単語力チェックテストの札', () => {
  it('**「決まり」は答えになる距離（TEST_SWIPE）と一致する**', () => {
    expect(testIntentAt(TEST_SWIPE - 1).locked).toBe(false);
    expect(testIntentAt(TEST_SWIPE).locked).toBe(true);
    expect(testIntentAt(-TEST_SWIPE).kind).toBe('again');
    expect(testIntentAt(5)).toBeNull();
  });
});

describe('やる気のペースで間隔が変わる（2026-09-26 まで全員「普通」だった）', () => {
  it('3回目のわかった：そこそこ37日・普通17日・やる気満々10日', () => {
    const third = { interval: 6, repetitions: 2, easeFactor: 2.7 };
    expect(nextIntervalDays({ ...third, interval: 9 }, 'low')).toBe(37);
    expect(nextIntervalDays(third, 'normal')).toBe(17);
    expect(nextIntervalDays({ ...third, interval: 5 }, 'high')).toBe(10);
  });

  it('続けて覚えたときの伸び方', () => {
    expect(reviewGaps(4, 'low')).toEqual([1, 9, 37, 156]);
    expect(reviewGaps(4, 'high')).toEqual([1, 5, 10, 20]);
  });

  it('**学習カードは採点に生徒のペースを渡す**（渡し忘れは黙って「普通」になる）', () => {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'StudyFlashcard.js'), 'utf8');
    const calls = source.match(/updateUserWordProgress\(uid, word, quality[^)]*\)/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    calls.forEach((call) => expect(call).toContain('motivationLevel'));
    const dashboard = fs.readFileSync(path.join(__dirname, '..', 'StudentDashboard.js'), 'utf8');
    const opened = dashboard.match(/<StudyFlashcard[\s\S]*?\/>/g) || [];
    expect(opened.length).toBeGreaterThan(0);
    opened.forEach((tag) => expect(tag).toContain('motivationLevel='));
  });
});
