import React from 'react';
import { FaHome, FaBookOpen, FaLayerGroup, FaChartLine } from 'react-icons/fa';
import BrandLogo from '../brand/BrandLogo';
import UserMenu from './UserMenu';
import './StudentShell.css';

/**
 * 生徒向けの共通シェル。
 * DESIGN_IMPLEMENTATION_PLAN.md 5章 / Phase UI-2。
 *
 * ヘッダー（ロゴ・現在のユーザー・ログアウト）と下部ナビをここに集約し、
 * 画面ごとに組み直さない。中身だけを children で受け取る。
 */

export const STUDENT_TABS = [
  { id: 'home', label: 'ホーム', Icon: FaHome },
  { id: 'free-study', label: 'えらぶ', Icon: FaLayerGroup },
  { id: 'story', label: '長文', Icon: FaBookOpen },
  { id: 'analytics', label: 'きろく', Icon: FaChartLine },
];

export function StudentHeader({ userName, avatarUrl, onLogout }) {
  return (
    <header className="student-header">
      <BrandLogo placement="student-header" priority decorative />
      {/* ロゴ画像が読めない環境でも製品名が分かるようにする */}
      <h1 className="visually-hidden">つくたん</h1>

      <UserMenu userName={userName} avatarUrl={avatarUrl} onLogout={onLogout} />
    </header>
  );
}

/**
 * 下部ナビ。
 * 以前はラベルだけで、選択中を色だけで示していた。
 * アイコンを添え、選択中は太字と下線でも分かるようにする（計画書13.3）。
 */
export function StudentBottomNav({ activeTab, onChange, tabs = STUDENT_TABS }) {
  return (
    <nav className="tab-bar" aria-label="画面切り替え">
      {tabs.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            className={`tab-item ${isActive ? 'active' : ''}`}
            onClick={() => onChange(id)}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon className="tab-icon" aria-hidden="true" />
            <span className="tab-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function StudentShell({ userName, onLogout, activeTab, onTabChange, tabs, children }) {
  return (
    <div className="student-shell">
      <StudentHeader userName={userName} onLogout={onLogout} />
      <main className="student-shell__main">{children}</main>
      {activeTab && <StudentBottomNav activeTab={activeTab} onChange={onTabChange} tabs={tabs} />}
    </div>
  );
}
