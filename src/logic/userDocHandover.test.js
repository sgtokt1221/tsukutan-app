import { handOverUserDoc, takeUserDoc, dropUserDoc, MAX_AGE_MS } from './userDocHandover';

const withGoal = { name: 'A', goal: { isSet: true, targetDate: '2027-02-01' } };

afterEach(() => dropUserDoc());

describe('App からダッシュボードへの users 文書の受け渡し', () => {
  test('最初の1回だけ渡す。2回目からはサーバから読み直させる（null）', () => {
    handOverUserDoc('u1', withGoal, 1000);
    expect(takeUserDoc('u1', 1500)).toBe(withGoal);
    expect(takeUserDoc('u1', 1600)).toBeNull();
  });

  test('目標が未設定のときは渡さない（目標設定のあとで来るので古い）', () => {
    handOverUserDoc('u1', { goal: { isSet: false } }, 1000);
    expect(takeUserDoc('u1', 1000)).toBeNull();
    handOverUserDoc('u1', { name: 'B' }, 1000);
    expect(takeUserDoc('u1', 1000)).toBeNull();
  });

  test('別の生徒のもの・古すぎるもの・取り消したものは使わない', () => {
    handOverUserDoc('u1', withGoal, 1000);
    expect(takeUserDoc('u2', 1000)).toBeNull();

    handOverUserDoc('u1', withGoal, 1000);
    expect(takeUserDoc('u1', 1000 + MAX_AGE_MS + 1)).toBeNull();

    handOverUserDoc('u1', withGoal, 1000);
    dropUserDoc();
    expect(takeUserDoc('u1', 1000)).toBeNull();
  });
});
