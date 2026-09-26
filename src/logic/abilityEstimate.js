/**
 * 単語力チェックテストの答えから「力」を推定する。
 *
 * 力（θ）は「このレベルの語なら半分くらい知っている」というレベル（小数）。
 * レベルが1つ上がるごとに、知っている割合がなだらかに下がると考える（ロジスティック曲線）。
 *
 * **以前は判定レベル以下の語を全部知っている、として語彙数を出していた。**
 * 出る数字は7通りしかなく、力の低い生徒ほど大きく多めに出ていた（2026-09-26 に試算）。
 * ここでは各レベルの語数 × 知っていそうな割合 を足し合わせる。
 *
 * 推定は答え全部を使う（最後のステージだけを見ない）。答えが少ないときや全問正解の
 * ときに力が無限に飛ばないよう、ゆるい事前分布（真ん中あたり）を置く。
 */

/** レベルが1つ上がると、知っている見込みがどれだけ落ちるか（曲線の傾き） */
export const SLOPE = 1.0;

/** 事前分布。中学〜高校の真ん中あたりを中心に、ゆるく */
const PRIOR_MEAN = 3.5;
const PRIOR_SD = 2.5;

const THETA_MIN = 0;
const THETA_MAX = 8.5;
const STEP = 0.01;

/** そのレベルの語を知っている見込み */
export const knowProbability = (level, theta, slope = SLOPE) => 1 / (1 + Math.exp(slope * (level - theta)));

/** 答え1件で使うレベル。出した単語のレベル（無ければそのステージの狙い） */
const levelOfAnswer = (answer) => (Number.isFinite(answer?.wordLevel) ? answer.wordLevel : answer?.level);

/**
 * 答えから力を推定する。
 * @param {Array<{isCorrect: boolean, revealed?: boolean, wordLevel?: number, level?: number}>} answers
 * @returns {{ theta: number, se: number }} 推定値と、その確からしさ（標準誤差。小さいほど確か）
 */
export const estimateAbility = (answers = []) => {
  const usable = answers.filter((a) => a && Number.isFinite(levelOfAnswer(a)));
  const grid = [];
  for (let theta = THETA_MIN; theta <= THETA_MAX + 1e-9; theta += STEP) {
    let logLike = -((theta - PRIOR_MEAN) ** 2) / (2 * PRIOR_SD ** 2);
    for (const answer of usable) {
      const p = knowProbability(levelOfAnswer(answer), theta);
      // 答えを見てから「わかる」は半分だけ知っていた扱い（placementTestEngine の answerScore と同じ）
      const yes = answer.isCorrect ? (answer.revealed ? 0.5 : 1) : 0;
      logLike += yes * Math.log(p) + (1 - yes) * Math.log(1 - p);
    }
    grid.push([theta, logLike]);
  }
  const top = Math.max(...grid.map(([, l]) => l));
  let total = 0;
  let mean = 0;
  for (const [theta, l] of grid) {
    const w = Math.exp(l - top);
    total += w;
    mean += w * theta;
  }
  mean /= total;
  let variance = 0;
  for (const [theta, l] of grid) variance += Math.exp(l - top) * (theta - mean) ** 2;
  variance /= total;
  return { theta: mean, se: Math.sqrt(variance) };
};

/** 力をレベル（1〜7）に丸める */
export const levelOfAbility = (theta, min = 1, max = 7) => Math.min(max, Math.max(min, Math.round(theta)));

/**
 * 力が2つのレベルにまたがっているか（推定の幅 ±se の両端で丸めたレベルが違う）。
 * またがっていれば、もう1ステージ確かめる価値がある。
 */
export const isAmbiguous = ({ theta, se }, margin = 1) => (
  levelOfAbility(theta - se * margin) !== levelOfAbility(theta + se * margin)
);

/** 単語データのうち、知っていそうな語数（各語 × 見込みの和） */
export const expectedVocabulary = (words = [], theta) => {
  if (!Number.isFinite(theta)) return 0;
  const seen = new Set();
  let total = 0;
  for (const word of words) {
    if (!word || !Number.isFinite(word.level)) continue;
    const key = word.id || `${word.word}|${word.partOfSpeech}|${word.meaning}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += knowProbability(word.level, theta);
  }
  return Math.round(total);
};
