/**
 * 学習モードごとの決まり。**正本はここだけ。**
 *
 * 単語カードは5つの入口（今日の新規・おかわり・自由学習・毎日みる単語・復習）が
 * 同じ部品を使う。モードごとの違いを部品の中に if で散らすと、どのモードで
 * 何が起きるのかを誰も言えなくなる（2026-09-23 に「自分でもよくわからない」）。
 *
 * ## 上スワイプ（swipeUp）
 * 以前は全部のモードで「もう覚えた＝二度と出さない」になっていた。
 * 新規学習で指が少し上に流れただけで、まだ覚えていない語が消えていた。
 * **知っている語を素早く飛ばしたい復習と自由学習だけ**に残す（2026-09-23 に決めた）。
 * それ以外はボタンで外す。
 *
 * ## 外す（remove）
 * - `graduate`   … もう覚えた。どこからも出題されなくなる
 * - `unbookmark` … 毎日みる単語から外すだけ（★を外すのと同じ）。
 *   毎日みる単語は「この語は覚えてしまいたい」ために生徒が自分で選んだもの。
 *   覚えたら外す。**覚えた記録にはしない**（以前は下のボタンが「リストから削除」と
 *   書いてあるのに、実際は語そのものを卒業させていた）
 */

/*
 * ## 新規と復習の違い（2026-09-23 に部品を1つにまとめたときに表へ寄せた）
 * - `activity`   … つくばホームへ送る数の分かれ目（新規語数／復習語数）。`noteActivity` に渡す
 * - `shuffle`    … 並びを混ぜるか。新規は教材の順（前回の続きから再開するため）、復習は毎回混ぜる
 * - `logSchema`  … 途中で終了したときの記録の形。**2種類あるのは今の管理画面に合わせたまま**
 *                  （→ `studyLog.js`。直すと管理画面の数字が変わるので別の判断）
 * - `storageKey` … 単語帳の続き位置を読む localStorage キーの頭
 * - `emptyText`  … 出す語が無いときの文
 */
const NEW_WORDS = {
  activity: 'new',
  shuffle: false,
  logSchema: 'learning',
  storageKey: 'wordbook_progress',
  emptyText: '学習する単語がありません。',
};

const MODES = {
  daily: { ...NEW_WORDS, swipeUp: false, remove: 'graduate' },
  extra: { ...NEW_WORDS, swipeUp: false, remove: 'graduate' },
  free: { ...NEW_WORDS, swipeUp: true, remove: 'graduate' },
  bookmark: { ...NEW_WORDS, swipeUp: false, remove: 'unbookmark' },
  review: {
    activity: 'review',
    shuffle: true,
    logSchema: 'review',
    storageKey: 'wordbook_progress_review',
    emptyText: '復習する単語がありません。',
    swipeUp: true,
    remove: 'graduate',
  },
};

/** 知らないモードは上スワイプを切る（消える方に倒さない） */
const FALLBACK = { ...NEW_WORDS, swipeUp: false, remove: 'graduate' };

const REMOVE_TEXT = {
  graduate: {
    label: 'もう覚えた',
    short: 'もう覚えた',
    hint: 'もう出題されなくなります',
    // 初めてカードを開いたときの案内（真ん中のボタンを光らせて出す）
    coach: '覚えた語は、このボタンで外す',
  },
  unbookmark: {
    label: '覚えた（毎日みるから外す）',
    // 中央のボタンは3つ並ぶので短く（読み上げと長押しの説明には label と hint を使う）
    short: '覚えた',
    hint: '毎日みる単語から外します',
    coach: '覚えたら、このボタンで毎日みるから外す',
  },
};

/**
 * @param {string} mode 'daily' | 'extra' | 'free' | 'bookmark' | 'review'
 * @returns {{ swipeUp: boolean, remove: 'graduate'|'unbookmark', removeLabel: string, removeHint: string,
 *   activity: 'new'|'review', shuffle: boolean, logSchema: 'learning'|'review', storageKey: string, emptyText: string }}
 */
export function studyModePolicy(mode) {
  const policy = MODES[mode] || FALLBACK;
  const text = REMOVE_TEXT[policy.remove];
  return {
    ...policy,
    removeLabel: text.label,
    removeShort: text.short,
    // 上スワイプの札・案内に出す。「上にスワイプしても同じ」を付けない版
    removePlainHint: text.hint,
    removeCoach: policy.swipeUp ? `上へ払うかわりに、このボタンでも「${text.short}」` : text.coach,
    // 上スワイプが効くモードでは、ボタンと同じだと書き添える
    removeHint: policy.swipeUp ? `${text.hint}（上にスワイプしても同じ）` : text.hint,
  };
}

/**
 * 画面の見出し。**いまどのモードにいるかを出す。**
 * 以前は自由学習（英検や本の範囲）でも「新規学習」と出ていた。
 *
 * @param {string} mode
 * @param {{ textbookId?: string, filterValue?: string }} [sessionInfo]
 */
export function sessionTitle(mode, sessionInfo) {
  switch (mode) {
    case 'daily': return '今日の新規';
    case 'extra': return 'おかわり学習';
    case 'bookmark': return '毎日みる単語';
    case 'review': return '復習';
    case 'free': {
      const parts = [sessionInfo?.textbookId, sessionInfo?.filterValue]
        .map((part) => String(part || '').trim())
        .filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : '自由学習';
    }
    default: return '単語';
  }
}
