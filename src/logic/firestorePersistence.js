import { enableIndexedDbPersistence } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import logger from './logger';

/**
 * Firestore の内容を端末に持たせる。
 *
 * 起動のたびに13本ぶんの往復を待っていて、1本目が始まるまでに数秒
 * かかっていた。端末に持っていれば2回目以降は即座に描け、更新は
 * 裏で取りに行く。電波の悪いところでも今日の学習を開ける。
 *
 * 注意
 * - どの読み書きよりも先に呼ぶ必要がある。index.js の描画前に置く。
 * - タブを複数開いていると 'failed-precondition' で失敗する。1枚目の
 *   タブだけが持てる仕組みなので、失敗しても素通りしてよい。
 * - enableIndexedDbPersistence は非推奨。今風の書き方
 *   （initializeFirestore + persistentLocalCache）は getFirestore を
 *   呼ぶ前に設定する必要があり、それは gitignore 済みの
 *   src/firebaseConfig.js の中。あちらを版管理に載せるときに移す。
 */
export const enableOfflineCache = async () => {
  try {
    await enableIndexedDbPersistence(db);
    logger.debug('Firestore の端末保存を有効にしました');
  } catch (error) {
    // 使えなくても学習は続けられる。毎回ネットワークを見に行くだけ。
    if (error?.code === 'failed-precondition') {
      logger.debug('別のタブが先に使っているため、このタブでは端末保存を使いません');
    } else if (error?.code === 'unimplemented') {
      logger.debug('この環境では Firestore の端末保存を使えません');
    } else {
      logger.warn('Firestore の端末保存を有効にできませんでした', error);
    }
  }
};

export default enableOfflineCache;
