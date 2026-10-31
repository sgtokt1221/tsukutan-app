import { getAuth } from 'firebase/auth';
import { toAssessmentWav } from './wavEncoder';
import logger from './logger';

/**
 * 録音を文字にしてもらう。
 *
 * 文字起こしは Cloud Function 経由で Google Cloud Speech-to-Text に投げる。
 * 同じ GCP プロジェクトなので鍵は要らない（Function のサービスアカウントで通る）。
 * ブラウザから直接叩かないのは、認証情報をクライアントに置かないため。
 *
 * 発音の点は出さない。それには別サービスが要るので、いまは対象外。
 */

const ENDPOINT = process.env.REACT_APP_TRANSCRIBE_URL
  || 'https://us-central1-tsukutan-58b3f.cloudfunctions.net/transcribeSpeaking';

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

/** 生徒本人の証明。サーバーはこれだけを見て、本文の uid は信じない。 */
const post = async (path, body, failureMessage) => {
  const user = getAuth().currentUser;
  if (!user) throw new Error('ログインし直してください。');

  const response = await fetch(`${ENDPOINT}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    logger.warn(failureMessage, response.status, detail);
    throw new Error(detail.error || failureMessage);
  }

  return response.json();
};

/**
 * 録音を文字にするだけ。答えの中身は見ない。
 *
 * 判定を分けてあるのは、生徒が文字起こしを直せるから。直す前の文で
 * 判定してしまうと、認識の間違いのせいで低い点が出る。
 *
 * @param {Blob} blob 録音した音声（端末まかせの形式でよい）
 * @param {object} options
 * @param {'scripted'|'unscripted'} options.mode 音読なら scripted
 * @param {string} [options.referenceText] 音読で読むべき英文。認識のヒントになる
 * @returns {Promise<{transcript: string}>}
 */
export const transcribeSpeaking = async (blob, options) => {
  const wav = await toAssessmentWav(blob);
  return post('', {
    audio: toBase64(await wav.arrayBuffer()),
    mode: options.mode,
    referenceText: options.referenceText,
  }, '文字起こしできませんでした。もう一度お試しください。');
};

/**
 * 文字にした答えを見てもらう。面接を最後まで通してからまとめて呼ぶ。
 *
 * @param {object} options
 * @param {'scripted'|'unscripted'} options.mode
 * @param {string} options.transcript 生徒が直したあとの文
 * @param {string} [options.referenceText] 音読で読むべき英文
 * @param {string} [options.question] 質問文（unscripted のとき）
 * @param {string} [options.modelAnswer] 模範解答（あれば）
 * @param {string} [options.grade] '3' | 'pre2' | '2' | 'pre1'
 * @returns {Promise<{missing: string[], total: number, content: object|null}>}
 */
export const reviewAnswer = async (options) => post('/review', {
  mode: options.mode,
  transcript: options.transcript,
  referenceText: options.referenceText,
  question: options.question,
  modelAnswer: options.modelAnswer,
  grade: options.grade,
}, '答えを見てもらえませんでした。通信を確かめてもう一度お試しください。');

export const VERDICT_LABELS = {
  good: '質問に答えられています',
  partial: 'あと少し足りません',
  'off-target': '質問とずれています',
};
