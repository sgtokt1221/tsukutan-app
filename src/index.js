import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { enableOfflineCache } from './logic/firestorePersistence';
import { startVersionCheck } from './logic/versionCheck';

// 起動の内訳を測れるようにする。logger.debug と同じで本番では静かだが、
// performance.getEntriesByType('mark') で後から見られる。
performance.mark('boot');

// Firestore の読み書きより先に呼ぶ。描画のあとだと手遅れになる。
enableOfflineCache();

// 開いたままの画面を新しい版へ（ホーム画面から開いたままの生徒に、直したものが届かなかった）
startVersionCheck();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();