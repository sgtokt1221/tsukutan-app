/**
 * 勉強した時間を測る。**測るのはここ1か所だけ。**
 *
 * つくばホームの受験サポートに「勉強時間」として送るので、
 * 2か所で測ると**どちらが本当か決められなくなる**（つくたんの管理画面が
 * `durationInSeconds` だけを読んでいて、完走したぶんが丸ごと0として
 * 落ちていたのも、測り方が2つあったせい）。
 *
 * ## 裏に回っているあいだは数えない
 * タブを裏に回したまま放置した時間は勉強ではない。`visibilitychange` で止め、
 * 戻ったら続ける。**対応の有無ではなく、いま見えているか**を見る。
 *
 * ## タブを閉じても消えない
 * 閉じる瞬間に通信はできない（`await` が返る前にページが死ぬ）。
 * **測っている状態を localStorage に書き続け、次に開いたときに締めて送る。**
 * 締める時刻は「最後に手を動かした時刻」——閉じたあとの時間を数えない。
 *
 * ## 送るのは開始時刻と「動いていた長さ」
 * 終了時刻は `開始 + 動いていた長さ` にする。止めていたぶんを含めた実時刻を
 * 送ると、裏に回していた時間まで勉強時間になる。**開始は実時刻**なので、
 * 「何時に勉強しているか」の集計には使える。
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../firebaseConfig.js';

/** 測っている最中のもの。**閉じられても残るように localStorage に置く** */
const CURRENT_KEY = 'tsukutan.study.current';
/** 送れていないもの。**電波が無くても消さない** */
const PENDING_KEY = 'tsukutan.study.pending';
/**
 * いまのランク。**つくばホームの一覧に出すために送る。**
 *
 * ランクは勉強の記録ではなく「いまの状態」なので、1件ずつの記録には乗せず
 * **送るときに1つだけ添える**。localStorage に置くのは、送る処理（起動直後）と
 * ランクを知っている画面（ホーム）が別のタイミングで動くため。
 */
const RANK_KEY = 'tsukutan.study.rank';

/**
 * 手が止まってから、勉強が終わったとみなすまで（ミリ秒）。
 *
 * **5分。** 単語カードは1枚に数秒〜十数秒なので、5分空いたら席を立っている。
 * 長くすると、閉じ忘れた端末の放置がそのまま勉強時間になる。
 */
export const IDLE_MS = 5 * 60 * 1000;

/** 1分未満は送らない（つくばホーム側も受け取らない） */
export const MIN_MS = 60 * 1000;

/** 貯めておく上限。**溢れたら古いほうから捨てる**（無限に貯めない） */
export const MAX_PENDING = 50;

function read(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? null : JSON.parse(raw);
    } catch (e) {
        // 壊れていたら捨てる。**残すと毎回同じ失敗をする**
        try { localStorage.removeItem(key); } catch (e2) { /* 使えなくても本体は動く */ }
        return null;
    }
}

function write(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        // localStorage が使えなくても勉強はできる。**そこで止めない**
    }
}

/** いま測っているもの（メモリ側）。localStorage と同じ中身を持つ */
let current = null;
let listening = false;

function now() { return Date.now(); }

function save() {
    write(CURRENT_KEY, current);
}

/**
 * 動いていた長さ（ミリ秒）。**見えていた時間だけ足す。**
 * @param {object} s
 * @returns {number}
 */
export function activeMsOf(s) {
    if (!s) return 0;
    const running = s.visibleSince === null ? 0 : Math.max(0, (s.lastAt || now()) - s.visibleSince);
    return Math.max(0, (s.accumulatedMs || 0) + running);
}

/**
 * 測り終えたものを、送る形にする。
 *
 * @param {object} s
 * @returns {{ startedAt: string, endedAt: string, newWords: number, reviewWords: number,
 *   aloud?: { count: number, title: string|null } }|null} 短すぎるときは null
 */
export function toPayload(s) {
    const ms = activeMsOf(s);
    if (ms < MIN_MS) return null;
    const start = Number(s.startedAtMs);
    if (!Number.isFinite(start)) return null;
    return {
        startedAt: new Date(start).toISOString(),
        // **止めていたぶんを含めない。** 開始＋動いていた長さ
        endedAt: new Date(start + ms).toISOString(),
        newWords: Math.max(0, Number(s.newWords) || 0),
        reviewWords: Math.max(0, Number(s.reviewWords) || 0),
        /*
          **音読は「やったか」だけ送る。** つくばホームは頻度で見る
          （2026-09-22「取り組む頻度だね」）ので、読めた割合や速さは送らない。
          **題名は最後の1本**——全部送ると向こうの利用状況の doc が膨らむ。

          **0本のときは欄ごと出さない。** 送る中身が増えると、貯めてある
          古い記録（欄が無い形）と混ざったときに読み分けが要る。
        */
        ...(Number(s.aloudCount) > 0
            ? { aloud: { count: Math.floor(Number(s.aloudCount)), title: s.aloudTitle || null } }
            : {}),
    };
}

function enqueue(payload) {
    if (!payload) return;
    const list = Array.isArray(read(PENDING_KEY)) ? read(PENDING_KEY) : [];
    // 同じ開始時刻のものは1つだけ（二重に積まない。向こうも同じIDで弾くが、手前で減らす）
    const rest = list.filter((x) => x && x.startedAt !== payload.startedAt);
    rest.push(payload);
    write(PENDING_KEY, rest.slice(-MAX_PENDING));
}

/**
 * いまのランクを覚える。**送るときに添える。**
 *
 * **ランクそのものはつくつくが決める**（実力テストの点から `rankLogic` が出す）。
 * つくばホームは受け取って見せるだけなので、判定の式を向こうへ持っていかない。
 *
 * @param {string|null} rankId `null` なら未測定として何も送らない
 */
export function setStudyRank(rankId) {
    const clean = String(rankId || '').trim().toUpperCase();
    write(RANK_KEY, clean === '' ? null : clean);
}

/**
 * 貯まっているぶんを送る。**送れたものだけ消す。**
 *
 * 返事を待たずに消すと、電波が悪いときに勉強した事実が消える。
 *
 * @returns {Promise<{ sent: number, kept: number, recorded?: number, rejected?: object[] }>}
 */
export async function flushStudySessions() {
    const list = Array.isArray(read(PENDING_KEY)) ? read(PENDING_KEY) : [];
    if (list.length === 0) return { sent: 0, kept: 0 };
    if (!auth.currentUser) return { sent: 0, kept: list.length };
    try {
        const call = httpsCallable(getFunctions(), 'recordTsukutanStudy');
        const rank = read(RANK_KEY);
        // **未測定なら欄ごと出さない。** 向こうは「届いたときだけ書く」作りなので、
        // 空を送ると測ってあるランクを消しに行くことになる
        const { data } = await call(rank ? { sessions: list, rank } : { sessions: list });
        write(PENDING_KEY, null);

        /*
          **弾かれたぶんを黙って捨てない**（2026-09-22）。向こうは通らなかった
          記録を理由つきで返してくれる（短すぎる・時刻が読めない など）のに、
          こちらは返事を見ずに全部消していた。**送れたつもりで消える**ので、
          本番で「1件も記録が無い」になっても手がかりが残らなかった。

          積み直しはしない——弾かれる理由は何度送っても変わらないので、
          残すと毎回同じものを送り続けることになる。**見えるようにするだけ。**
        */
        const rejected = (data && data.rejected) || [];
        if (rejected.length > 0) {
            console.warn('[つくつく] 通らなかった記録', rejected);
        }
        return { sent: list.length, kept: 0, recorded: (data && data.recorded) || 0, rejected };
    } catch (e) {
        // **消さない。** 次に開いたときに送る
        console.warn('[つくたん] 勉強時間を送れませんでした（次回まとめて送ります）', e);
        return { sent: 0, kept: list.length };
    }
}

/**
 * 測り始める。**すでに測っていたら、先に締める。**
 *
 * 締めずに始めると、前のぶんが宙に浮いて消える。
 */
export function startStudySession() {
    if (current) endStudySession();
    const t = now();
    current = {
        startedAtMs: t,
        // 見え始めた時刻。裏に回っていたら null
        visibleSince: isVisible() ? t : null,
        accumulatedMs: 0,
        lastAt: t,
        newWords: 0,
        reviewWords: 0,
        // 音読した本数と、最後に読んだものの題名
        aloudCount: 0,
        aloudTitle: null,
    };
    save();
    listen();
}

/** 1語答えた、めくった、など。**放置の判定と、閉じたときの締め時刻に使う** */
export function noteActivity(kind) {
    if (!current) return;
    const t = now();
    // **手が止まっていたぶんは数えない。** 放置してから戻ってきた場合
    if (t - current.lastAt > IDLE_MS) {
        endStudySession();
        startStudySession();
        if (kind === 'new') current.newWords += 1;
        if (kind === 'review') current.reviewWords += 1;
        save();
        return;
    }
    current.lastAt = t;
    if (kind === 'new') current.newWords += 1;
    if (kind === 'review') current.reviewWords += 1;
    save();
}

/**
 * 音読を1本読み終えた。**測っていなければ、そこから測り始める。**
 *
 * 長文タブは単語カードと違って「始める」ボタンが無い。**黙って数えないと、
 * 音読だけしている生徒がつくばホームから見えない**（いちばん見たいのがそこ）。
 *
 * @param {string} [title] 読んだものの題名。**最後の1本だけ持つ**
 */
export function noteAloud(title) {
    if (!current) startStudySession();
    const t = now();
    // 手が止まっていたぶんは数えない（`noteActivity` と同じ作法）
    if (t - current.lastAt > IDLE_MS) {
        endStudySession();
        startStudySession();
    }
    // **読んだ時刻まで数える。** 締め時刻は「最後に手を動かした時刻」なので、
    // ここを動かさないと音読したぶんが長さ0になって落ちる
    current.lastAt = t;
    current.aloudCount = (Number(current.aloudCount) || 0) + 1;
    const clean = String(title || '').trim();
    if (clean) current.aloudTitle = clean.slice(0, 60);
    save();
}

/**
 * 測り終える。**積んで、その場で送る。**
 *
 * **起動時だけでは遅い**（2026-09-22）。もとは `resumeAndFlush()` でしか
 * 送っていなかったので、勉強しても**次にアプリを開き直すまで**つくばホームに
 * 何も届かなかった。塾が管理画面を見ても「まだ使っていない」のまま
 * （実際、テストで使っている生徒の記録が本番に1件も無かった）。
 *
 * **積むのをやめるわけではない。** 送れなくても localStorage に残り、
 * 次に開いたときに `resumeAndFlush()` が送る。タブを閉じて終わったときは
 * そもそもここを通らないので、その受け皿も要る。
 *
 * **返事は待たない。** 待つと、学習を終えて画面が切り替わるのが通信ぶん遅れる。
 * 失敗しても積んだものは消えない（`flushStudySessions` は送れたものだけ消す）。
 *
 * **測った長さも返す。** つくたん自身のログ（`users/{uid}/logs`）にも同じ値を
 * 書くため。片方だけ別に測ると、つくばホームと数字が食い違う。
 *
 * @returns {{ activeMs: number, payload: object|null }} `payload` は短すぎれば null
 */
export function endStudySession() {
    if (!current) return { activeMs: 0, payload: null };
    // 見えている最中なら、そこまでを足してから止める
    pauseCounting();
    const activeMs = activeMsOf(current);
    const payload = toPayload(current);
    enqueue(payload);
    current = null;
    write(CURRENT_KEY, null);
    // **積めたときだけ送る。** 短すぎて積まれなかった回で通信しない
    if (payload) void flushStudySessions();
    return { activeMs, payload };
}

function isVisible() {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function pauseCounting() {
    if (!current || current.visibleSince === null) return;
    // **止める時刻は「最後に手を動かした時刻」まで。** 見ていただけの時間を数えない
    const until = Math.max(current.visibleSince, Math.min(current.lastAt, now()));
    current.accumulatedMs += Math.max(0, until - current.visibleSince);
    current.visibleSince = null;
    save();
}

function resumeCounting() {
    if (!current || current.visibleSince !== null) return;
    const t = now();
    // **戻ってきた時刻から数え直す。** 裏にあった時間は入れない
    current.visibleSince = t;
    current.lastAt = t;
    save();
}

function onVisibility() {
    if (!current) return;
    if (isVisible()) resumeCounting();
    else pauseCounting();
}

/** 閉じられる直前。**通信はできないので、状態を残すだけ** */
function onPageHide() {
    if (!current) return;
    pauseCounting();
    save();
}

function listen() {
    if (listening || typeof document === 'undefined') return;
    listening = true;
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
}

/**
 * 起動時に1度だけ呼ぶ。
 *
 * 前回タブを閉じて宙に浮いた記録を締めて、貯まっているぶんと一緒に送る。
 *
 * @returns {Promise<{ sent: number, kept: number }>}
 */
export async function resumeAndFlush() {
    const left = read(CURRENT_KEY);
    if (left && Number.isFinite(Number(left.startedAtMs))) {
        // **閉じたあとの時間を数えない。** 最後に手を動かしたところで締める
        const closed = { ...left, visibleSince: null };
        enqueue(toPayload(closed));
        write(CURRENT_KEY, null);
    }
    return flushStudySessions();
}

/** テスト用。**覚えている状態を捨てる**（本番の経路では呼ばない） */
export function _reset() {
    current = null;
    write(CURRENT_KEY, null);
    write(PENDING_KEY, null);
    write(RANK_KEY, null);
}

/** テスト用。いま測っているものを覗く */
export function _current() {
    return current;
}
