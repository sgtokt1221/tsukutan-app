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
 * E-Factor の上限。
 * 以前は上限が無く、しかも毎回答 easeFactorMultiplier を掛けていたため、
 * 「そこそこ」(1.2) では12回正解で 27 まで発散し、間隔が 21,378,739日
 * （約58,000年）になっていた。逆に「やる気満々」(0.8) では4回で下限に
 * 張り付き、成績に関係なく3日間隔で回り続けていた。
 */
const MAX_EASE_FACTOR = 3.0;

/**
 * 間隔の上限（日）。
 * 上限が無いと、一度離れた単語が事実上二度と出てこなくなる。
 */
const MAX_INTERVAL_DAYS = 365;

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
 * @param {{intervalMultiplier:number}} config やる気レベルの設定
 *
 * intervalMultiplier は逆向きの係数であることに注意。
 * そこそこ=1.5 / 普通=1 / やる気満々=0.7 で、やる気が高いほど間隔が
 * 短くなる（＝復習が多く回ってくる）。
 */
export const nextSchedule = (state, quality, config) => {
  const intervalMultiplier = config?.intervalMultiplier ?? 1;

  const currentInterval = Number.isFinite(state?.interval) ? state.interval : 0;
  const currentRepetitions = Number.isFinite(state?.repetitions) ? state.repetitions : 0;
  // 保存済みのEase Factorが壊れている場合に備えて読み取り時に丸める。
  // 上の不具合で 27 まで膨らんだ値や、下限に張り付いた値が既に入っている。
  const storedEase = Number.isFinite(state?.easeFactor) ? state.easeFactor : 2.5;
  const currentEase = Math.min(MAX_EASE_FACTOR, Math.max(MIN_EASE_FACTOR, storedEase));

  let interval;
  let repetitions;

  if (quality >= ANSWER_QUALITY.hard) {
    if (currentRepetitions === 0) {
      interval = 1;
    } else if (currentRepetitions === 1) {
      interval = Math.ceil(6 * intervalMultiplier);
    } else {
      // やる気の反映は intervalMultiplier だけに任せる。
      // easeFactorMultiplier も掛けると、やる気の効きが二重になっていた。
      interval = Math.ceil(currentInterval * currentEase * intervalMultiplier);
    }
    // 「迷った」は覚えきれていないので、伸ばし方を抑える
    if (quality === ANSWER_QUALITY.hard) {
      interval = Math.max(1, Math.ceil(interval * HARD_INTERVAL_RATIO));
    }
    if (interval > MAX_INTERVAL_DAYS) interval = MAX_INTERVAL_DAYS;
    repetitions = currentRepetitions + 1;
  } else {
    // 覚えていないものは間隔を空けない。今日のうちにもう一度出す。
    interval = 0;
    repetitions = 0;
  }

  // Ease Factor は回答の質だけで動かす。やる気設定で掛けない。
  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  let easeFactor = currentEase + delta;
  if (easeFactor < MIN_EASE_FACTOR) easeFactor = MIN_EASE_FACTOR;
  if (easeFactor > MAX_EASE_FACTOR) easeFactor = MAX_EASE_FACTOR;

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
