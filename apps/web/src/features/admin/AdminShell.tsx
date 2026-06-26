import { LogOut } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { AdminSession } from "@gems/api-client";
import { ThemeSwitcher, useOutsideClick, type ThemePreference } from "@gems/ui";

function AdminProfileMenu({ admin, handleLogout, theme, setTheme }: { admin: AdminSession, handleLogout: () => void, theme: ThemePreference, setTheme: (theme: ThemePreference) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(menuRef, () => setIsOpen(false), isOpen);

  return (
    <div className="profile-menu-container" ref={menuRef} style={{ position: "relative" }}>
      <button 
        className="avatar-button" 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "var(--emerald-subtle)",
          color: "var(--emerald)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "2px solid var(--emerald)",
          cursor: "pointer",
          padding: 0,
          fontWeight: 700,
          fontSize: 16,
          flexShrink: 0
        }}
        aria-label="Profile menu"
      >
        {admin.email.slice(0, 1).toUpperCase()}
      </button>
      
      {isOpen && (
        <div 
          className="profile-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            background: "var(--bg)",
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-lg)",
            padding: 8,
            minWidth: 220,
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            gap: 4
          }}
        >
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 16 }}>Admin</div>
            <div style={{ color: "var(--sage)", fontSize: 14, marginTop: 2 }}>{admin.email}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
            <span style={{ fontSize: 16, color: "var(--ink)", fontWeight: 500 }}>Theme</span>
            <ThemeSwitcher theme={theme} setTheme={setTheme} />
          </div>
          <div style={{ height: 1, background: "var(--line)" }} />
          <div style={{ padding: "4px" }}>
            <button
              className="menu-item"
              onClick={() => { handleLogout(); setIsOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--ink)", width: "100%", justifyContent: "flex-start", fontSize: 16, textAlign: "left", fontWeight: 500 }}
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
        <div className="brand" aria-label="gemslanka.lk admin">
          <span className="brand-mark">
            <img src="/assets/gemslanka-logo.png" alt="" />
          </span>
          <span className="brand-site-name">gemslanka.lk</span>
          <span className="admin-brand-label">Admin</span>
        </div>
        <div className="admin-session" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
          <span>{admin.email}</span>
          <AdminProfileMenu admin={admin} handleLogout={handleLogout} theme={theme} setTheme={setTheme} />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
