/**
 * 復習単語の定着ぐあいを、間隔（次にいつ出すか）で3つに分ける。
 *
 * SM-2 では、覚えるほど次に出るまでの間隔が伸びる。つまり間隔は
 * そのまま「どれくらい定着したか」の目安になる。回数ではなく間隔で
 * 見るのは、正解しても「迷った」なら伸びが抑えられるため。
 *
 * 3週間（21日）は、間隔反復で「短期記憶を抜けた」とされる目安。
 *
 * 移行前の古い文書（migratedTo つき）は数えない。新旧が二重に
 * 入っていて、そのまま数えると語数が倍近くになる。
 */

export const RETENTION_BUCKETS = [
  { id: 'learning', label: '覚えかけ', description: '次に出るまで6日以内', color: '#fca5a5' },
  { id: 'settling', label: 'なじんできた', description: '次に出るまで7〜20日', color: '#fde047' },
  { id: 'retained', label: '定着', description: '次に出るまで21日以上', color: '#a3e635' },
  { id: 'graduated', label: '卒業', description: '復習リストから外した語', color: '#4ade80' },
];

const bucketIdOf = (word) => {
  if (word?.status === 'mastered') return 'graduated';
  const interval = Number(word?.interval) || 0;
  if (interval < 7) return 'learning';
  if (interval < 21) return 'settling';
  return 'retained';
};

/**
 * @param {Array} reviewWords users/{uid}/reviewWords の中身
 * @returns {{total:number, buckets:Array<{id,label,description,color,count,percent}>}}
 */
export const retentionBreakdown = (reviewWords = []) => {
  const counts = { learning: 0, settling: 0, retained: 0, graduated: 0 };

  for (const word of reviewWords) {
    if (!word || word.migratedTo) continue;
    counts[bucketIdOf(word)] += 1;
  }

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return {
    total,
    buckets: RETENTION_BUCKETS.map((bucket) => ({
      ...bucket,
      count: counts[bucket.id],
      percent: total > 0 ? (counts[bucket.id] / total) * 100 : 0,
    })),
  };
};

/**
 * **目標までの内訳**（2026-09-26）。復習リスト（習った語）だけだと、始めたばかりの生徒は
 * 帯がほとんど出ず、目標まであとどれくらいかが見えなかった。
 * 分母を目標の語数（progress.targetVocabulary）にして、はじめから全体を見せる。
 *
 * - 習った語（覚えかけ〜卒業）はそのまま
 * - テストで分かっている（推定）… 到達語数（progress.currentVocabulary）のうち、習った語で数えていないぶん。
 *   テストの見込みと習った語は重なるので、**重なりは習った語の側に数える**（多めに出さない）
 * - まだ … 目標までにこれから覚える語
 * 習った語とテストのぶんで目標を超えていれば、分母はその合計にする（はみ出さない）
 *
 * @param {{ total: number, buckets: Array }} breakdown retentionBreakdown の結果
 * @param {{ target?: number, reached?: number }} goal
 * @returns 目標が無ければ breakdown をそのまま
 */
export const retentionTowardGoal = (breakdown, { target, reached } = {}) => {
  if (!breakdown || !Number.isFinite(target) || target <= 0) return breakdown;
  const learned = breakdown.total;
  const known = Math.max(0, Math.round(Number(reached) || 0) - learned);
  const total = Math.max(target, learned + known);
  const notYet = total - learned - known;
  const byId = Object.fromEntries(breakdown.buckets.map((b) => [b.id, b]));
  const order = ['graduated', 'retained', 'settling', 'learning'];
  const extra = [
    { id: 'known', label: 'テストで分かっている', description: '単語力チェックテストから見て、もう知っていそうな語（推定）', color: '#bae6fd', count: known },
    { id: 'notYet', label: 'まだ', description: '目標までに、これから覚える語', color: '#e5e7eb', count: notYet },
  ];
  return {
    total,
    target,
    learnedTotal: learned,
    buckets: [...order.map((id) => byId[id]), ...extra].map((bucket) => ({
      ...bucket,
      percent: total > 0 ? (bucket.count / total) * 100 : 0,
    })),
  };
};

export default retentionBreakdown;
