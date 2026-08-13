import { getAuth } from 'firebase/auth';
import { toAssessmentWav } from './wavEncoder';
import logger from './logger';

/**
 * 録音を採点に出す。
 *
 * Azure の鍵は Cloud Function 側にある。ここからは Function を叩くだけで、
 * 鍵はクライアントに一切持たない。
 *
 * 鍵がまだ入っていないときは Function が 503 を返す。そのときは
 * `available: false` を返し、画面は「録音して聞き返すだけ」に落ちる。
 * 採点が無くても通しの練習はできるので、そこで止めない。
 */

const ENDPOINT = process.env.REACT_APP_ASSESS_SPEAKING_URL
  || 'https://us-central1-tsukutan-58b3f.cloudfunctions.net/assessSpeaking';

/** ArrayBuffer を base64 に。大きいので一度に spread せず刻む。 */
const toBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000; // 引数の数に上限がある。32KBずつ渡す
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
};

/**
 * @param {Blob} blob 録音した音声（端末まかせの形式でよい）
 * @param {object} options
 * @param {'scripted'|'unscripted'} options.mode 音読なら scripted
 * @param {string} [options.referenceText] 音読で読むべき英文
 * @param {string} [options.question] 質問文（unscripted のとき）
 * @param {string} [options.modelAnswer] 模範解答（あれば）
 * @param {string} [options.grade] '3' | 'pre2' | '2' | 'pre1'
 */
export const assessSpeaking = async (blob, options) => {
  const user = getAuth().currentUser;
  if (!user) return { available: false, reason: 'signed-out' };

  const wav = await toAssessmentWav(blob);
  const idToken = await user.getIdToken();

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio: toBase64(await wav.arrayBuffer()),
      mode: options.mode,
      referenceText: options.referenceText,
      question: options.question,
      modelAnswer: options.modelAnswer,
      grade: options.grade,
    }),
  });

  if (response.status === 503) {
    // 鍵がまだ。採点なしで続けられるようにする
    return { available: false, reason: 'not-configured' };
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    logger.warn('採点に失敗しました', response.status, detail);
    throw new Error(detail.error || '採点できませんでした。もう一度お試しください。');
  }

  return { available: true, ...(await response.json()) };
};

/** 点の帯をどう見せるか。80以上が本番で通る目安。 */
export const scoreBand = (score) => {
  if (typeof score !== 'number') return 'unknown';
  if (score >= 80) return 'good';
  if (score >= 60) return 'fair';
  return 'poor';
};

export const SCORE_LABELS = {
  PronScore: '総合',
  AccuracyScore: '発音',
  FluencyScore: 'なめらかさ',
  CompletenessScore: '読み落とし',
  ProsodyScore: '抑揚',
};

export const VERDICT_LABELS = {
  good: '質問に答えられています',
  partial: 'あと少し足りません',
  'off-target': '質問とずれています',
};
