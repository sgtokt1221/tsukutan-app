import React, { useEffect, useRef, useState } from 'react';
import { FaUser, FaSignOutAlt } from 'react-icons/fa';
import './UserMenu.css';

/**
 * ヘッダー右上のユーザーメニュー。
 * DESIGN_POLISH_PLAN.md 12.3「ログアウトは常時強調せず、ユーザーメニュー内へ寄せる」。
 *
 * 名前とログアウトを横並びにすると、主導線と競合して幅も食う。
 * アイコン1つに畳み、開いたときだけ名前と操作を出す。
 *
 * avatarUrl は後から設定できるようにするための入口。
 * 未設定のときは既定のアイコンを出す。
 */
export default function UserMenu({ userName, avatarUrl, onLogout }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        className="user-menu__trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={userName ? `${userName} のメニュー` : 'アカウントメニュー'}
      >
        {avatarUrl
          ? <img className="user-menu__avatar" src={avatarUrl} alt="" width="32" height="32" />
          : <FaUser aria-hidden="true" />}
      </button>

      {open && (
        <div className="user-menu__panel" role="menu">
          {userName && <p className="user-menu__name">{userName}</p>}
          {onLogout && (
            <button type="button" className="user-menu__item" role="menuitem" onClick={onLogout}>
              <FaSignOutAlt aria-hidden="true" /> ログアウト
            </button>
          )}
        </div>
      )}
    </div>
  );
}
