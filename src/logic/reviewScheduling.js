/**
 * 復習間隔の計算（SM-2）。
 *
 * Firestore から切り離した純粋関数にしてある。間隔の伸び方は
 * 生徒の学習量に直結するので、書き込み処理と混ぜずに検証できるようにする。
 *
 * 回答は3段階。以前は正誤の二値しか受け取れず、「わかった」と
 * 「迷った」が同じ扱いだった（計画書7.4の3段階が入れられなかった理由）。
 */

/** 回答の質。SM-2 の q(0-5) に対応させる。 */
export const ANSWER_QUALITY = {
  again: 2, // もう一度: すぐ出し直す
  hard: 3,  // 迷った: 進めるが間隔は控えめ
  good: 5,  // わかった
};

/** 「迷った」のとき、通常の伸びをどこまで抑えるか */
const HARD_INTERVAL_RATIO = 0.5;

/** E-Factor の下限。SM-2 の定義どおり。 */
const MIN_EASE_FACTOR = 1.3;

/**
 * 3段階の回答か、旧来の真偽値かを受け取って q に直す。
 * 既存の呼び出し（isCorrect の真偽値）を壊さないため。
 */
export const toQuality = (answer) => {
  if (typeof answer === 'boolean') {
    return answer ? ANSWER_QUALITY.good : ANSWER_QUALITY.again;
  }
  if (typeof answer === 'string' && Object.prototype.hasOwnProperty.call(ANSWER_QUALITY, answer)) {
    return ANSWER_QUALITY[answer];
  }
  // 知らない値は「もう一度」に倒す。覚えている扱いで間隔を空けるより
  // 出し直すほうが害が小さい。
  return ANSWER_QUALITY.again;
};

/**
 * 次回の間隔・繰り返し回数・E-Factor を返す。
 *
 * @param {{interval:number, repetitions:number, easeFactor:number}} state 現在の状態
 * @param {number} quality SM-2 の q(0-5)
 * @param {{intervalMultiplier:number, easeFactorMultiplier:number}} config やる気レベルの設定
 *
 * intervalMultiplier は逆向きの係数であることに注意。
 * そこそこ=1.5 / 普通=1 / やる気満々=0.7 で、やる気が高いほど間隔が
 * 短くなる（＝復習が多く回ってくる）。
 */
export const nextSchedule = (state, quality, config) => {
  const easeFactorMultiplier = config?.easeFactorMultiplier ?? 1;
  const intervalMultiplier = config?.intervalMultiplier ?? 1;

  const currentInterval = Number.isFinite(state?.interval) ? state.interval : 0;
  const currentRepetitions = Number.isFinite(state?.repetitions) ? state.repetitions : 0;
  const currentEase = Number.isFinite(state?.easeFactor) ? state.easeFactor : 2.5;

  let interval;
  let repetitions;

  if (quality >= ANSWER_QUALITY.hard) {
    if (currentRepetitions === 0) {
      interval = 1;
    } else if (currentRepetitions === 1) {
      interval = Math.ceil(6 * intervalMultiplier);
    } else {
      interval = Math.ceil(currentInterval * currentEase * easeFactorMultiplier * intervalMultiplier);
    }
    // 「迷った」は覚えきれていないので、伸ばし方を抑える
    if (quality === ANSWER_QUALITY.hard) {
      interval = Math.max(1, Math.ceil(interval * HARD_INTERVAL_RATIO));
    }
    repetitions = currentRepetitions + 1;
  } else {
    // 覚えていないものは間隔を空けない。今日のうちにもう一度出す。
    interval = 0;
    repetitions = 0;
  }

  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  let easeFactor = (currentEase + delta) * easeFactorMultiplier;
  if (easeFactor < MIN_EASE_FACTOR) easeFactor = MIN_EASE_FACTOR;

  return { interval, repetitions, easeFactor };
};

/** その回答で今日のうちにもう一度出すか */
export const shouldRepeatToday = (quality) => quality < ANSWER_QUALITY.hard;

/** ログに残す行動名 */
export const actionForQuality = (quality) => {
  if (quality >= ANSWER_QUALITY.good) return 'correct';
  if (quality >= ANSWER_QUALITY.hard) return 'hard';
  return 'incorrect';
};
