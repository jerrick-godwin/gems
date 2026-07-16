import { LogOut } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import type { AdminSession } from "@gems/api-client";
import { ThemeSwitcher, useOutsideClick, type ThemePreference } from "@gems/ui";

function AdminProfileMenu({ admin, handleLogout, theme, setTheme }: { admin: AdminSession, handleLogout: () => void, theme: ThemePreference, setTheme: (theme: ThemePreference) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(menuRef, () => setIsOpen(false), isOpen);

  return (
    <div className="profile-menu-container" ref={menuRef}>
      <button
        className="avatar-button admin-avatar-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Profile menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
      >
        {admin.email.slice(0, 1).toUpperCase()}
      </button>
      
      {isOpen && (
        <div className="profile-dropdown admin-profile-dropdown" id={menuId}>
          <div className="admin-profile-header">
            <div className="admin-profile-title">Admin</div>
            <div className="admin-profile-email">{admin.email}</div>
          </div>
          <div className="admin-profile-theme-row">
            <span>Theme</span>
            <ThemeSwitcher theme={theme} setTheme={setTheme} />
          </div>
          <div className="profile-menu-divider" />
          <div className="admin-profile-actions">
            <button
              className="menu-item"
              onClick={() => { handleLogout(); setIsOpen(false); }}
            >
              <LogOut size={18} /> Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



export function AdminShell({ admin, handleLogout, theme, setTheme, children }: { admin: AdminSession; handleLogout: () => void; theme: ThemePreference; setTheme: (theme: ThemePreference) => void; children: ReactNode }) {
  return (
    <div className="app-shell admin-shell">
      <header className="topbar admin-topbar">
        <div className="topbar-inner admin-topbar-inner">
          <div className="brand" aria-label="gemslanka.lk">
            <span className="brand-mark">
              <img src="/assets/gemslanka-logo.png" alt="" />
            </span>
            <span className="brand-wordmark" aria-label="gemslanka.lk">
              <span className="brand-wordmark-main" aria-hidden="true">
                <span>GEMSLANKA</span>
                <span className="brand-wordmark-domain">.LK</span>
              </span>
            </span>
          </div>
          <div className="admin-session">
            <AdminProfileMenu admin={admin} handleLogout={handleLogout} theme={theme} setTheme={setTheme} />
          </div>
        </div>
      </header>
      <main className="app-main"><div className="app-main-inner">{children}</div></main>
    </div>
  );
}
