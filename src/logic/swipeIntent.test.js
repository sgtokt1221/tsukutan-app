import { swipeIntentAt, nextIntervalDays, reviewGaps, intentText, daysText } from './swipeIntent';
import { flashcardGesture } from './cardGestures';
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
  it('新しい語は明日', () => {
    expect(nextIntervalDays({ word: 'follow' })).toBe(1);
    expect(daysText(1)).toBe('明日また出る');
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
