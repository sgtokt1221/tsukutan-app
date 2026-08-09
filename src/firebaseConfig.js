import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

/**
 * Firebase の初期化。
 *
 * ここに並ぶ値は秘密ではない。Firebase の web config はクライアントの
 * バンドルへそのまま焼き込まれる公開値で、実際に本番の JS から誰でも
 * 読める。アクセス制御は Firestore Rules と Auth で行っている。
 *
 * 以前はこのファイルを gitignore していたため、リポジトリを clone した
 * 環境ではビルドが通らなかった（Vercel が 314 日間ずっと
 * "Can't resolve './firebaseConfig.js'" で失敗していた）。
 *
 * 別のプロジェクトへ向けたいときは REACT_APP_FIREBASE_* を設定する。
 * 未設定なら下の既定値（本番 tsukutan-58b3f）を使う。
 *
 * なお API キーは GCP のコンソールで参照元（HTTPリファラ）を絞れる。
 * 公開値とはいえ、絞っておくほうが無用な流用を防げる。
 */
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyDe6dktYCspjLfjxVuSsD5uiZ5auUQnbzc',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'tsukutan-58b3f.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'tsukutan-58b3f',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'tsukutan-58b3f.appspot.com',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '115384710973',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:115384710973:web:eed24ac7e942155c643754',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
