/**
 * 勉強時間の測り方。
 *
 * つくばホームの受験サポートに「勉強時間」として送るので、**数え間違いは
 * そのまま生徒の記録になる**。裏に回した時間・放置・タブを閉じたときの3つは、
 * どれも画面では気づけない形でずれるので、ここで止める。
 */

// Firebase には触らない。測り方だけを見る
jest.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: () => jest.fn(async () => ({ data: {} })),
}));
jest.mock('firebase/auth', () => ({ signInWithCustomToken: jest.fn() }));
jest.mock('../firebaseConfig.js', () => ({ auth: { currentUser: null }, db: {} }));

import {
  startStudySession,
  endStudySession,
  noteActivity,
  noteAloud,
  activeMsOf,
  toPayload,
  resumeAndFlush,
  IDLE_MS,
  MIN_MS,
  _reset,
  _current,
} from './studySession';

/** いまの時刻を操る。`visibilitychange` も手で起こす */
let nowMs;
const advance = (ms) => { nowMs += ms; };

beforeEach(() => {
  localStorage.clear();
  _reset();
  nowMs = Date.parse('2026-09-20T19:00:00+09:00');
  jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const hide = () => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};
const show = () => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('動いていた長さ', () => {
  test('答えたところまでを数える（見ていただけの時間は数えない）', () => {
    startStudySession();
    advance(60_000);
    noteActivity('new');
    advance(30_000);   // 答えずに眺めていた30秒
    const { activeMs } = endStudySession();
    expect(activeMs).toBe(60_000);
  });

  test('**裏に回しているあいだは数えない。** 放置がそのまま勉強時間にならないように', () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    hide();
    advance(600_000);  // 10分裏に置いた
    show();
    advance(60_000);
    noteActivity('new');
    const { activeMs } = endStudySession();
    expect(activeMs).toBe(180_000);
  });

  test('**手が止まったら切る。** 席を立ったぶんを数えない', () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    advance(IDLE_MS + 60_000);   // 6分空いた
    noteActivity('new');          // 戻ってきた
    // 前のぶんは締められ、新しいセッションが始まっている
    expect(_current().newWords).toBe(1);
    expect(activeMsOf(_current())).toBe(0);
  });
});

describe('送る形', () => {
  test('**終了時刻は「開始＋動いていた長さ」。** 止めていたぶんを含めない', () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    hide();
    advance(600_000);
    show();
    advance(60_000);
    noteActivity('review');
    const { payload } = endStudySession();
    expect(payload.startedAt).toBe('2026-09-20T10:00:00.000Z');   // JST 19:00
    expect(Date.parse(payload.endedAt) - Date.parse(payload.startedAt)).toBe(180_000);
    expect(payload.newWords).toBe(1);
    expect(payload.reviewWords).toBe(1);
  });

  test('**1分に満たないものは送らない**（押し間違い）', () => {
    startStudySession();
    advance(30_000);
    noteActivity('new');
    const { payload, activeMs } = endStudySession();
    expect(activeMs).toBe(30_000);
    expect(payload).toBeNull();
    expect(MIN_MS).toBe(60_000);
  });

  test('壊れたものを送る形にしない', () => {
    expect(toPayload(null)).toBeNull();
    expect(toPayload({ startedAtMs: 'きのう', accumulatedMs: 999_999 })).toBeNull();
  });
});

describe('タブを閉じたとき', () => {
  test('**測っている状態が残る。** 閉じても勉強した事実が消えない', () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    window.dispatchEvent(new Event('pagehide'));
    const left = JSON.parse(localStorage.getItem('tsukutan.study.current'));
    expect(left).not.toBeNull();
    expect(left.startedAtMs).toBeDefined();
  });

  test('**次に開いたとき、最後に手を動かしたところで締める。** 閉じたあとの時間を数えない', async () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    window.dispatchEvent(new Event('pagehide'));
    // 端末を閉じたまま3時間経った
    advance(3 * 60 * 60 * 1000);
    await resumeAndFlush();
    const pending = JSON.parse(localStorage.getItem('tsukutan.study.pending')) || [];
    expect(pending).toHaveLength(1);
    expect(Date.parse(pending[0].endedAt) - Date.parse(pending[0].startedAt)).toBe(120_000);
  });
});

describe('送れなかったとき', () => {
  test('**消さない。** 電波が無くても勉強した事実を残す', async () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    // `auth.currentUser` が null なので送れない
    const r = await resumeAndFlush();
    expect(r.sent).toBe(0);
    expect(r.kept).toBe(1);
    expect(JSON.parse(localStorage.getItem('tsukutan.study.pending'))).toHaveLength(1);
  });

  test('同じ開始時刻のものを二重に積まない', () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    const first = endStudySession().payload;
    // 同じ状態をもう一度積んでも増えない（resume と end が重なった場合）
    localStorage.setItem('tsukutan.study.current', JSON.stringify({
      startedAtMs: Date.parse(first.startedAt), visibleSince: null,
      accumulatedMs: 120_000, lastAt: Date.parse(first.startedAt) + 120_000,
      newWords: 1, reviewWords: 0,
    }));
    void resumeAndFlush();
    expect(JSON.parse(localStorage.getItem('tsukutan.study.pending'))).toHaveLength(1);
  });
});

describe('測り方は1か所', () => {
  test('**前のぶんを宙に浮かせない。** 締めてから次を始める', () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    startStudySession();   // 締めずにもう一度始めた
    const pending = JSON.parse(localStorage.getItem('tsukutan.study.pending')) || [];
    expect(pending).toHaveLength(1);
  });
});

/**
 * **音読は「やったか」だけ送る**（2026-09-22「取り組む頻度だね」）。
 * つくばホームは日数で見るので、読めた割合や速さは送らない。
 */
describe('音読', () => {
  test('数と、最後に読んだ題名が乗る', () => {
    startStudySession();
    advance(120_000);
    noteAloud('The Blue Bird');
    noteAloud('A Letter');
    const { payload } = endStudySession();
    expect(payload.aloud).toEqual({ count: 2, title: 'A Letter' });
  });

  test('**測っていなくても数える。** 長文タブには「始める」ボタンが無い', () => {
    noteAloud('The Blue Bird');
    advance(120_000);
    noteActivity('new');
    const { payload } = endStudySession();
    expect(payload.aloud.count).toBe(1);
  });

  test('**音読していなければ欄ごと出さない**（古い記録と混ざらない）', () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    const { payload } = endStudySession();
    expect(payload.aloud).toBeUndefined();
  });

  test('**放置してから読んだら、別の記録にする**（間の放置を勉強時間にしない）', () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    advance(IDLE_MS + 1000);
    noteAloud('A Letter');
    advance(120_000);
    noteActivity('new');
    const { payload } = endStudySession();
    // 放置の前後で2つに分かれ、**音読は後ろのほうに乗る**
    const pending = JSON.parse(localStorage.getItem('tsukutan.study.pending'));
    expect(pending).toHaveLength(2);
    expect(pending[0].aloud).toBeUndefined();
    expect(payload.aloud).toEqual({ count: 1, title: 'A Letter' });
  });

  test('題名は長すぎるものを切る（向こうの doc を膨らませない）', () => {
    startStudySession();
    advance(120_000);
    noteAloud('あ'.repeat(200));
    const { payload } = endStudySession();
    expect(payload.aloud.title).toHaveLength(60);
  });
});
