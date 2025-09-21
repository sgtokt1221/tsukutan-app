// Firebase SDK のコア機能をインポート
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// あなたのFirebaseプロジェクトの設定情報
// ▼▼▼ 以前コピーしたあなた自身のfirebaseConfigをここに貼り付けてください ▼▼▼
const firebaseConfig = {
  apiKey: "AIzaSyDe6dktYCspjLfjxVuSsD5uiZ5auUQnbzc",
  authDomain: "tsukutan-58b3f.firebaseapp.com",
  projectId: "tsukutan-58b3f",
  storageBucket: "tsukutan-58b3f.firebasestorage.app",
  messagingSenderId: "115384710973",
  appId: "1:115384710973:web:eed24ac7e942155c643754",
  measurementId: "G-V58Z3Q2BGT"
};
// ▲▲▲ 以前コピーしたあなた自身のfirebaseConfigをここに貼り付けてください ▲▲▲


// Firebaseアプリを初期化
const app = initializeApp(firebaseConfig);

// 他のファイルから使えるように、認証とFirestoreの機能をエクスポート
export const auth = getAuth(app);
export const db = getFirestore(app);