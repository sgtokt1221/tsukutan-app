/**
 * 勉強時間の測り方。
 *
 * つくばホームの受験サポートに「勉強時間」として送るので、**数え間違いは
 * そのまま生徒の記録になる**。裏に回した時間・放置・タブを閉じたときの3つは、
 * どれも画面では気づけない形でずれるので、ここで止める。
 */

// Firebase には触らない。測り方だけを見る
// 送った中身を見たいので、呼び出しを覚えておく
const sentCalls = [];
/** 向こうの返事。テストごとに差し替える */
let mockReply = {};
/** 呼び先のURLと、付いたヘッダ。**つくばホーム側**でなければならない */
let mockCalledUrl = '';
let mockHeaders = {};
/*
  **callable SDK を使わない**ので、`fetch` を差し替えて見る。
  SDK は ID トークンを `Authorization` に自動で付けてしまい、
  向こうの枠組みに 401 で弾かれる（2026-09-22 に本番のログで確認）。
*/
/**
 * **毎回入れ直す。** CRA の Jest は `resetMocks: true` で、テストごとに
 * モックの中身まで消える（module 直下で1度だけ入れると2件目から空になる）。
 */
const installFetch = () => {
  global.fetch = jest.fn(async (url, init) => {
    mockCalledUrl = String(url);
    mockHeaders = (init && init.headers) || {};
    sentCalls.push(JSON.parse(init.body).data);
    return { ok: true, status: 200, json: async () => ({ result: mockReply }) };
  });
};
jest.mock('firebase/auth', () => ({ signInWithCustomToken: jest.fn() }));
jest.mock('../firebaseConfig.js', () => ({ auth: { currentUser: null }, db: {} }));

/** ログイン中の生徒。`getIdToken` が入場券を返す */
const signedIn = { uid: 'u1', getIdToken: async () => 'ID-TOKEN' };

import { auth } from '../firebaseConfig.js';
import {
  startStudySession,
  endStudySession,
  noteActivity,
  noteAloud,
  setStudyRank,
  sendStudyRank,
  flushStudySessions,
  activeMsOf,
  toPayload,
  resumeAndFlush,
  IDLE_MS,
  MIN_MS,
  _reset,
  _current,
} from './studySession';

/**
 * 積まれた非同期処理を流し切る。
 * **`await Promise.resolve()` を数えない**——await の数が変わるたびにテストが
 * 壊れる（実際、入場券を取る await を足したときに落ちた）。
 */
const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

/** いまの時刻を操る。`visibilitychange` も手で起こす */
let nowMs;
const advance = (ms) => { nowMs += ms; };

beforeEach(() => {
  installFetch();
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

/**
 * **ランクはつくつくが決め、つくばホームは受け取って見せるだけ。**
 * 1件ずつの記録ではなく「いまの状態」なので、送るときに1つだけ添える。
 */
describe('ランクを添えて送る', () => {
  // **ログインしていないと送らない**（既定のモックは currentUser が null）
  beforeEach(() => { sentCalls.length = 0; auth.currentUser = signedIn; });
  afterEach(() => { auth.currentUser = null; });

  test('覚えたランクが呼び出しに乗る', async () => {
    setStudyRank('B');
    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    await flushStudySessions();
    expect(sentCalls[0].rank).toBe('B');
  });

  test('**未測定なら欄ごと出さない。** 空を送ると向こうの測定値を消しに行く', async () => {
    setStudyRank(null);
    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    await flushStudySessions();
    expect(sentCalls[0]).not.toHaveProperty('rank');
  });

  test('小文字で渡しても大文字で送る（向こうの許可値に合わせる）', async () => {
    setStudyRank('ss');
    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    await flushStudySessions();
    expect(sentCalls[0].rank).toBe('SS');
  });
});

/**
 * **起動時だけでは遅い**（2026-09-22）。勉強しても次にアプリを開き直すまで
 * つくばホームに届かず、管理画面は「まだ使っていない」のままだった。
 */
describe('測り終えたら、その場で送る', () => {
  beforeEach(() => { sentCalls.length = 0; auth.currentUser = signedIn; });
  afterEach(() => { auth.currentUser = null; });

  test('**締めた時点で送る。** 次の起動を待たない', async () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();

    // 返事は待たないので、積んだ処理が流れるのを待ってから見る
    await settle();
    expect(sentCalls).toHaveLength(1);
    expect(sentCalls[0].sessions).toHaveLength(1);
  });

  test('**短すぎて積まれなかった回では通信しない**', async () => {
    startStudySession();
    advance(10_000);          // 1分に満たない
    noteActivity('new');
    endStudySession();

    await settle();
    expect(sentCalls).toHaveLength(0);
  });

  /*
    タブを閉じて終わったときは `endStudySession` を通らない。
    **積んだものは消さない**ので、次に開いたときに送れる。
  */
  test('送れなくても積んだものは残る（次の起動で送る）', async () => {
    auth.currentUser = null;   // ログインし直す前
    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();

    await settle();
    expect(sentCalls).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('tsukutan.study.pending'))).toHaveLength(1);
  });
});

/**
 * **弾かれたぶんを黙って捨てない**（2026-09-22）。向こうは理由つきで返すのに
 * 返事を見ずに全部消していたため、本番で「1件も記録が無い」になっても
 * 手がかりが残らなかった。
 */
describe('通らなかった記録', () => {
  beforeEach(() => { sentCalls.length = 0; auth.currentUser = signedIn; mockReply = {}; });
  afterEach(() => { auth.currentUser = null; mockReply = {}; });

  test('理由を返してもらい、外へ出す', async () => {
    mockReply = { recorded: 0, rejected: [{ startedAt: 'x', reason: '短すぎます' }] };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    const got = await flushStudySessions();

    expect(got.rejected).toEqual([{ startedAt: 'x', reason: '短すぎます' }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  /*
    **積み直さない。** 弾かれる理由（短すぎる・時刻が読めない）は何度送っても
    変わらないので、残すと毎回同じものを送り続けることになる。
  */
  test('弾かれたものを積み直さない（同じものを送り続けない）', async () => {
    mockReply = { recorded: 0, rejected: [{ startedAt: 'x', reason: '短すぎます' }] };
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    await flushStudySessions();

    expect(JSON.parse(localStorage.getItem('tsukutan.study.pending'))).toBeNull();
    console.warn.mockRestore();
  });
});

/**
 * **ランクは勉強に相乗りさせない**（2026-09-22）。実力テストを受けただけで
 * まだ勉強していない生徒の紋章が、つくばホームにいつまでも出なかった。
 */
describe('ランクだけを送る', () => {
  beforeEach(() => { sentCalls.length = 0; auth.currentUser = signedIn; mockReply = {}; });
  afterEach(() => { auth.currentUser = null; mockReply = {}; });

  test('**勉強が1件も無くても送る**（記録は空で、ランクだけ）', async () => {
    setStudyRank('B');
    await settle();

    expect(sentCalls).toHaveLength(1);
    expect(sentCalls[0]).toEqual({ sessions: [], rank: 'B', idToken: 'ID-TOKEN' });
  });

  test('**同じランクを何度も送らない**（画面が描き直すたびに通信しない）', async () => {
    setStudyRank('B');
    await settle();
    await sendStudyRank();
    setStudyRank('B');
    await Promise.resolve();

    expect(sentCalls).toHaveLength(1);
  });

  test('上がったら送り直す', async () => {
    setStudyRank('B');
    await settle();
    setStudyRank('A');
    await settle();

    expect(sentCalls.map((c) => c.rank)).toEqual(['B', 'A']);
  });

  test('未測定なら送らない', async () => {
    setStudyRank(null);
    await settle();
    expect(sentCalls).toHaveLength(0);
  });

  /*
    送れなければ印を付けない。次に呼ばれたときにもう一度試す
    （起動時の `resumeAndFlush` が拾う）。
  */
  test('送れなければ、次に呼ばれたときにもう一度試す', async () => {
    auth.currentUser = null;
    setStudyRank('B');
    await settle();
    expect(sentCalls).toHaveLength(0);

    auth.currentUser = signedIn;
    await sendStudyRank();
    expect(sentCalls).toHaveLength(1);
  });

  test('勉強と一緒に送れたぶんは、あらためて送らない', async () => {
    setStudyRank('B');
    await settle();
    sentCalls.length = 0;

    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    await flushStudySessions();
    const before = sentCalls.length;
    await sendStudyRank();

    expect(sentCalls).toHaveLength(before);
  });
});

/**
 * **呼び先はつくばホーム。** `httpsCallable(getFunctions(), ...)` だと自分の
 * プロジェクトを指すので、そこに無い関数を呼び続けることになる。
 * 2026-09-22 まで一度も届いていなかった（向こうの記録が0件だった）。
 */
describe('どこへ送るか', () => {
  beforeEach(() => { sentCalls.length = 0; mockCalledUrl = ''; auth.currentUser = signedIn; mockReply = {}; });
  afterEach(() => { auth.currentUser = null; });

  test('**つくばホームの受け口を呼ぶ**（自分のプロジェクトではない）', async () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    await flushStudySessions();

    expect(mockCalledUrl).toContain('tsukubamanager-4900b');
    expect(mockCalledUrl).toContain('asia-northeast1');
    expect(mockCalledUrl).toMatch(/recordTsukutanStudy$/);
  });

  /*
    生徒は**つくつくのプロジェクト**にサインインしているので、この ID トークンは
    向こうの `onCall` では認証として通らない。**中身として渡して向こうで検証**する。
  */
  test('**入場券を中身に載せる**（向こうで検証してもらう）', async () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    await flushStudySessions();

    expect(sentCalls[0].idToken).toBe('ID-TOKEN');
  });

  test('ランクだけの呼び出しにも入場券を載せる', async () => {
    setStudyRank('B');
    await settle();

    expect(sentCalls[0]).toEqual({ sessions: [], rank: 'B', idToken: 'ID-TOKEN' });
  });
});

/**
 * **`Authorization` を付けない。**
 *
 * Firebase の callable SDK（`httpsCallable` / `httpsCallableFromURL`）は
 * こちらの ID トークンを自動で付ける。向こうの `onCall` は自分のプロジェクトの
 * トークンしか受け付けないので、**こちらの処理に入る前に 401 で弾かれる**
 * （2026-09-22 に本番のログで確認：`incorrect "aud" claim`）。
 */
describe('送り方', () => {
  beforeEach(() => { sentCalls.length = 0; mockHeaders = {}; auth.currentUser = signedIn; mockReply = {}; });
  afterEach(() => { auth.currentUser = null; });

  test('**Authorization ヘッダを付けない**（付けると 401 で弾かれる）', async () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    await flushStudySessions();

    expect(Object.keys(mockHeaders)).toEqual(['Content-Type']);
  });

  test('callable と同じ形（`{ data: ... }`）で投げる', async () => {
    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    await flushStudySessions();

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(Object.keys(body)).toEqual(['data']);
    expect(body.data.sessions).toHaveLength(1);
  });

  test('**断られたら積んだものを消さない**（理由も出す）', async () => {
    // **`Once` にしない。** 締めた時点で1回送るので、そこで使い切ってしまう
    global.fetch.mockImplementation(async () => ({
      ok: false, status: 401, json: async () => ({ error: { message: 'ログインが必要です。' } }),
    }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    startStudySession();
    advance(120_000);
    noteActivity('new');
    endStudySession();
    await settle();

    expect(JSON.parse(localStorage.getItem('tsukutan.study.pending'))).toHaveLength(1);
    expect(await flushStudySessions()).toMatchObject({ sent: 0, kept: 1 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

/**
 * **短い長文を落とさない**（2026-09-22）。英検5級の長文は30秒で読み終わる。
 * 勉強時間の下限（1分）で丸ごと落とすと、短い長文ばかり読んでいる生徒が
 * 「音読していない」ことになる。
 */
describe('1分に満たない音読', () => {
  beforeEach(() => { sentCalls.length = 0; auth.currentUser = signedIn; mockReply = {}; });
  afterEach(() => { auth.currentUser = null; });

  test('**音読していれば、1分未満でも送る**', async () => {
    startStudySession();
    advance(35_000);            // 35秒で読み終わった
    noteAloud('Short Story');
    const { payload } = endStudySession();

    expect(payload).not.toBeNull();
    expect(payload.aloud).toEqual({ count: 1, title: 'Short Story' });
  });

  test('音読していなければ、これまでどおり送らない', () => {
    startStudySession();
    advance(35_000);
    noteActivity('new');
    expect(endStudySession().payload).toBeNull();
  });

  test('実際の長さのまま送る（時間を水増ししない）', () => {
    startStudySession();
    advance(35_000);
    noteAloud('Short Story');
    const { payload } = endStudySession();

    const ms = Date.parse(payload.endedAt) - Date.parse(payload.startedAt);
    expect(ms).toBe(35_000);
  });
});
