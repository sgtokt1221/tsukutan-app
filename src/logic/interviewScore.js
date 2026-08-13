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
 * 全体をまとめる。点が付かなかった場面は平均から外す（0点として
 * 引っぱると、通信が失敗しただけで下手に見える）。
 */
export const summarize = (entries = []) => {
  const items = entries.map((entry) => {
    const score = scoreOf(entry);
    return {
      key: entry.key,
      label: entry.label,
      mode: entry.mode,
      score,
      tone: score === null ? null : toneOf(score),
    };
  });

  const scored = items.filter((item) => item.score !== null);
  const counts = { good: 0, partial: 0, 'off-target': 0 };
  for (const entry of entries) {
    const verdict = entry.review?.content?.verdict;
    if (verdict in counts) counts[verdict] += 1;
  }

  return {
    items,
    counts,
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
