import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export const logStudyEvent = async (userId, payload) => {
  if (!userId || !payload) return;
  try {
    await addDoc(collection(db, 'users', userId, 'logs'), {
      timestamp: serverTimestamp(),
      ...payload,
    });
  } catch (error) {
    console.error('Failed to log study event:', error);
  }
};
