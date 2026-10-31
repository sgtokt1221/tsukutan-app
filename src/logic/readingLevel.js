/**
 * 長文をどの級で読ませるかを決める。
 *
 * 基本は学年。中1が5級、高3が2級。ただし本人の力がそれより上なら上に寄せ、
 * 目標にもっと上の級があれば、そちらに合わせる。学年だけで決めると、
 * 英検2級を目指している中2に4級の長文を出すことになる。
 *
 * 級は5→1と小さくなるほど難しい。順序の正本は EIKEN_ORDER。
 */

/** やさしい順。長文の級もこの並びで比べる。 */
export const EIKEN_ORDER = ['5', '4', '3', 'pre2', '2', 'pre1'];

export const EIKEN_LABELS = {
  5: '英検5級', 4: '英検4級', 3: '英検3級', pre2: '英検準2級', 2: '英検2級', pre1: '英検準1級',
};

/** 学年から。小学生と中1は同じ5級から始める。 */
const BY_SCHOOL_GRADE = {
  小1: '5', 小2: '5', 小3: '5', 小4: '5', 小5: '5', 小6: '5',
  中1: '5', 中2: '4', 中3: '3',
  高1: 'pre2', 高2: 'pre2', 高3: '2',
};

/** 語彙力チェックのレベル（1〜7）から。levels.json の eiken と揃える。 */
const BY_ABILITY_LEVEL = { 1: '5', 2: '4', 3: '3', 4: 'pre2', 5: '2', 6: '2', 7: 'pre1' };

/** 目標（goalId）から。英検以外の目標は級を決めない。 */
const goalGrade = (goalId = '') => {
  const match = String(goalId).match(/^eiken-(5|4|3|pre2|2|pre1)$/);
  return match ? match[1] : null;
};

const rank = (grade) => EIKEN_ORDER.indexOf(grade);

/** 2つのうち難しいほう。片方が未知ならもう片方。 */
const harder = (a, b) => {
  if (rank(a) < 0) return b;
  if (rank(b) < 0) return a;
  return rank(a) >= rank(b) ? a : b;
};

/**
 * @param {object} params
 * @param {string} params.schoolGrade '中1' など（users/{uid}.grade）
 * @param {number} params.abilityLevel 語彙力チェックの結果（1〜7）
 * @param {Array}  params.goalTargets  goal.targets（[{ goalId }]）
 * @param {Array}  params.available    用意のある級。無い級には寄せない
 * @returns {string} '5' | '4' | '3' | 'pre2' | '2' | 'pre1'
 */
export const readingGradeFor = ({
  schoolGrade, abilityLevel, goalTargets = [], available = EIKEN_ORDER,
} = {}) => {
  let grade = BY_SCHOOL_GRADE[schoolGrade] || '5';

  // 本人の力が学年より上なら、そちらに寄せる（下げはしない。学校の授業に
  // ついていけなくなる）
  const byAbility = BY_ABILITY_LEVEL[abilityLevel];
  if (byAbility) grade = harder(grade, byAbility);

  // 目標がもっと上なら、そちらに合わせる
  for (const target of goalTargets) {
    const byGoal = goalGrade(target?.goalId);
    if (byGoal) grade = harder(grade, byGoal);
  }

  // 用意が無い級に寄せても読むものが出ない。ある中で一番近い（それ以下で
  // 一番難しい）級へ落とす。
  if (available.includes(grade)) return grade;
  const reachable = available.filter((entry) => rank(entry) >= 0 && rank(entry) <= rank(grade));
  if (reachable.length === 0) return available[0] || '5';
  return reachable.reduce(harder);
};
