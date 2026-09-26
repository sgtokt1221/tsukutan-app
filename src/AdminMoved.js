import React from 'react';
import { auth } from './firebaseConfig.js';

/**
 * 管理者がつくつくに入ったときの案内。
 *
 * **生徒を見る場所はつくばホームの管理者ポータルに一本化した**（2026-09-23）。
 * つくつく独自の管理画面（AdminDashboard）は、つくばホームから来た生徒が名前なしで並び、
 * 学習時間も新規学習のぶんを数えていなかった。利用状況・小テスト・長文の印刷は
 * すべて管理者ポータルの「つくつく」タブ（`staffStudentMaterials` で教材を読む）へ移した。
 */
export const TSUKUBA_ADMIN_URL = 'https://tsukubamanager-4900b.web.app/admin/';

export default function AdminMoved() {
  return (
    <div className="loading-container">
      <div className="app-status-card">
        <h1 className="app-status-title">管理はつくばホームへ移りました</h1>
        <p className="app-status-message">
          生徒の利用状況、復習の小テストと長文の印刷は、
          つくばホームの管理者ポータルの「つくつく」タブで行います。
        </p>
        <a className="primary-action" href={TSUKUBA_ADMIN_URL}>管理者ポータルを開く</a>
        <p className="app-status-message">
          <button type="button" className="ghost-button" onClick={() => auth.signOut()}>ログアウト</button>
        </p>
      </div>
    </div>
  );
}
