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

const MODES = {
  daily: { swipeUp: false, remove: 'graduate' },
  extra: { swipeUp: false, remove: 'graduate' },
  free: { swipeUp: true, remove: 'graduate' },
  bookmark: { swipeUp: false, remove: 'unbookmark' },
  review: { swipeUp: true, remove: 'graduate' },
};

/** 知らないモードは上スワイプを切る（消える方に倒さない） */
const FALLBACK = { swipeUp: false, remove: 'graduate' };

const REMOVE_TEXT = {
  graduate: {
    label: 'もう覚えた',
    hint: 'もう出題されなくなります',
  },
  unbookmark: {
    label: '覚えた（毎日みるから外す）',
    hint: '毎日みる単語から外します',
  },
};

/**
 * @param {string} mode 'daily' | 'extra' | 'free' | 'bookmark' | 'review'
 * @returns {{ swipeUp: boolean, remove: 'graduate'|'unbookmark', removeLabel: string, removeHint: string }}
 */
export function studyModePolicy(mode) {
  const policy = MODES[mode] || FALLBACK;
  const text = REMOVE_TEXT[policy.remove];
  return {
    ...policy,
    removeLabel: text.label,
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
