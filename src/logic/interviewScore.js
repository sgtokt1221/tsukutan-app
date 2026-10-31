/**
 * 面接練習の結果を点にする。
 *
 * 面接の途中では点を出さない。本番の面接委員は途中で講評しないし、
 * 1問ごとに点が出ると、そこで気持ちが切れて最後まで通せない。
 * 通し終わってから、この計算でまとめて見せる。
 *
 * 音読は「読み飛ばさずに読めたか」、質問は「質問に答えられたか」。
 * 発音は測らない（採点できるサービスを使っていない）。
 */

/** 答えの判定を点に。3段階しかないので、そのまま 100 / 50 / 0。 */
export const ANSWER_POINTS = { good: 100, partial: 50, 'off-target': 0 };

/** 点を判定の3段階に寄せる。音読のカバー率にも色を付けるため。 */
export const toneOf = (score) => {
  if (score >= 80) return 'good';
  if (score >= 50) return 'partial';
  return 'off-target';
};

/**
 * その場面の点。まだ判定が返っていない・失敗した場合は null。
 *
 * @param {object} entry EikenInterview が貯めた1場面ぶん
 * @returns {number|null} 0〜100
 */
export const scoreOf = (entry) => {
  const review = entry?.review;
  if (!review) return null;

  if (entry.mode === 'scripted') {
    // 読むべき英文の異なり語数が分母。サーバーが数えた値を使う（同じ
    // 正規化をこちらで書き直すと、ずれても気づけない）。
    if (!review.total) return null;
    const read = Math.max(0, review.total - (review.missing?.length || 0));
    return Math.round((read / review.total) * 100);
  }

  const verdict = review.content?.verdict;
  return verdict in ANSWER_POINTS ? ANSWER_POINTS[verdict] : null;
};

/**
 * 全体をまとめる。
 *
 * 声を出す場面の一覧（places）を渡すと、答えなかった場面も 0点として
 * 分母に入れる。渡さないと録音した場面だけで平均するので、飛ばすほど
 * 点が高く出る。
 *
 * 「答えていない」と「採点が失敗した」は分ける。前者は本人が黙ったのだから
 * 0点。後者は通信の問題なので平均から外す（0点として引っぱると、電波が
 * 悪かっただけで下手に見える）。
 *
 * @param {Array} entries 録音した場面（EikenInterview の answers）
 * @param {Array} [places] 声を出す場面すべて [{ key, label, mode }]。
 *                         key は beat.key（枝は含まない）
 */
export const summarize = (entries = [], places = null) => {
  const answered = new Map();
  for (const entry of entries) {
    // 枝（Yes / No）を選び直しても場面はひとつ。最後の録音を採る。
    answered.set(entry.beatKey || entry.key, entry);
  }

  const rows = places && places.length > 0
    ? places.map((place) => ({ place, entry: answered.get(place.key) || null }))
    : entries.map((entry) => ({ place: null, entry }));

  const items = rows.map(({ place, entry }) => {
    const score = entry ? scoreOf(entry) : 0;
    return {
      key: entry?.key || place.key,
      label: entry?.label || place.label,
      mode: entry?.mode || place?.mode || null,
      score,
      tone: score === null ? null : toneOf(score),
      answered: Boolean(entry),
    };
  });

  // 答えなかった場面（score 0）は平均に入れる。採点が返らなかった場面
  // （score null）だけを外す。
  const scored = items.filter((item) => item.score !== null);
  const counts = { good: 0, partial: 0, 'off-target': 0 };
  for (const entry of entries) {
    const verdict = entry.review?.content?.verdict;
    if (verdict in counts) counts[verdict] += 1;
  }

  return {
    items,
    counts,
    unanswered: items.filter((item) => !item.answered).length,
    overall: scored.length === 0
      ? null
      : Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length),
  };
};

/** 点に添える一言。数字だけだと、次に何をすればいいか分からない。 */
export const commentFor = (overall) => {
  if (overall === null || overall === undefined) return '今回は判定が取れませんでした。通信を確かめて、もう一度やってみてください。';
  if (overall >= 80) return 'よく答えられています。この調子で他のカードもやってみましょう。';
  if (overall >= 50) return 'あと一歩です。答えたあとに理由をひとつ足すと、ぐっと良くなります。';
  return 'まずは質問の意味をつかむところから。見本を聞いて、まねして言ってみましょう。';
};
