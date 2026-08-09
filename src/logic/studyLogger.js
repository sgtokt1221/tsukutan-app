import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import logger from './logger';

export const logStudySession = async (userId, payload) => {
  if (!userId || !payload) return;
  try {
    logger.debug('💾 ログ保存開始:', { userId, payload });
    const docRef = await addDoc(collection(db, 'users', userId, 'logs'), {
      timestamp: serverTimestamp(),
      ...payload,
    });
    logger.debug('✅ ログ保存成功:', { docId: docRef.id, sessionType: payload.sessionType });
  } catch (error) {
    console.error('❌ ログ保存失敗:', error);
  }
};

export const logStudyEvent = async (userId, payload) => {
  if (!userId || !payload) return;
  try {
    await addDoc(collection(db, 'users', userId, 'logs'), {
      timestamp: serverTimestamp(),
      eventType: 'study',
      ...payload,
    });
  } catch (error) {
    console.error('Failed to log study event:', error);
  }
};
