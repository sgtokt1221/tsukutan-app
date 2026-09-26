import { getAuth } from 'firebase/auth';
import logger from './logger';

/**
 * 英検ライティングの採点（functions/index.js の scoreWriting）。
 * 採点は Jev（TypeSafe）。鍵はサーバだけが持つ。結果の保存もサーバがする（点を画面から書き換えられないように）。
 */
const ENDPOINT = process.env.REACT_APP_WRITING_URL
  || 'https://us-central1-tsukutan-58b3f.cloudfunctions.net/scoreWriting';

/**
 * @param {{ grade: string, task: 'opinion'|'email'|'summary', prompt: object, answer: string }} input
 * @returns {Promise<{ scores: object, total: number, max: number, flags: string[], words: number, contractions: string[] }>}
 */
export async function scoreWritingAnswer({ grade, task, prompt, answer }) {
  const user = getAuth().currentUser;
  if (!user) throw new Error('ログインし直してください。');
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ grade, task, prompt, answer }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    logger.warn('ライティングの採点に失敗しました', response.status, detail);
    throw new Error(detail.error || '採点できませんでした。もう一度出してください。');
  }
  return response.json();
}
