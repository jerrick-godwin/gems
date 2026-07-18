import { LogOut, LayoutDashboard, ShieldCheck, Gem, UsersRound, WalletCards, Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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

type AdminView = "overview" | "moderation" | "listings" | "users" | "payments";

function AdminNavigationItem({
  icon,
  label,
  view,
  activeView,
  onSelect,
  count,
  attention = false
}: {
  icon: ReactNode;
  label: string;
  view: AdminView;
  activeView: AdminView;
  onSelect: (view: AdminView) => void;
  count?: number;
  attention?: boolean;
}) {
  const isActive = activeView === view;
  return (
    <button type="button" className={`nav-menu-action${isActive ? " active" : ""}`} onClick={() => onSelect(view)} aria-current={isActive ? "page" : undefined}>
      {icon}
      <span>{label}</span>
      {count !== undefined && <strong className={attention ? "needs-attention" : ""} style={{ marginLeft: "auto", display: "grid", minWidth: 25, height: 24, placeItems: "center", padding: "0 6px", borderRadius: "var(--radius-full)", background: attention ? "var(--danger-soft)" : "var(--soft)", color: attention ? "var(--danger)" : "var(--muted)", fontSize: 11 }}>{count}</strong>}
    </button>
  );
}
export function AdminShell({ 
  admin, 
  handleLogout, 
  theme, 
  setTheme, 
  activeView,
  onSelect,
  moderationCount,
  listingCount,
  userCount,
  paymentCount,
  children 
}: { 
  admin: AdminSession; 
  handleLogout: () => void; 
  theme: ThemePreference; 
  setTheme: (theme: ThemePreference) => void; 
  activeView: AdminView;
  onSelect: (view: AdminView) => void;
  moderationCount: number;
  listingCount: number;
  userCount: number;
  paymentCount: number;
  children: ReactNode; 
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileMenuPanelId = useId();

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    document.documentElement.classList.add("mobile-nav-open");
    return () => document.documentElement.classList.remove("mobile-nav-open");
  }, [isMobileMenuOpen]);

  const handleSelect = (view: AdminView) => {
    onSelect(view);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="app-shell admin-shell">
      <header className="topbar admin-topbar">
        <div className="topbar-inner customer-topbar-inner" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
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
          <nav className="nav-actions" aria-label="Primary" data-nosnippet ref={mobileMenuRef}>
            <button
              type="button"
              className="mobile-nav-toggle"
              aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls={mobileMenuPanelId}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen
                ? <X size={22} strokeWidth={2.4} aria-hidden="true" />
                : <Menu size={22} strokeWidth={2.4} aria-hidden="true" />}
            </button>
            <div className={`nav-menu-panel${isMobileMenuOpen ? " is-open" : ""}`} id={mobileMenuPanelId}>
              <div className="mobile-nav-menu-sections">
                <section className="nav-menu-section nav-menu-section-marketplace" aria-labelledby="nav-menu-marketplace-heading">
                  <h2 className="nav-menu-section-title" id="nav-menu-marketplace-heading">Workspace</h2>
                  <AdminNavigationItem icon={<LayoutDashboard size={18} />} label="Overview" view="overview" activeView={activeView} onSelect={handleSelect} />
                  <AdminNavigationItem icon={<ShieldCheck size={18} />} label="Moderation" view="moderation" activeView={activeView} onSelect={handleSelect} count={moderationCount} attention={moderationCount > 0} />
                </section>
                <section className="nav-menu-section nav-menu-section-guides" aria-labelledby="nav-menu-guides-heading">
                  <h2 className="nav-menu-section-title" id="nav-menu-guides-heading">Marketplace</h2>
                  <AdminNavigationItem icon={<Gem size={18} />} label="Listings" view="listings" activeView={activeView} onSelect={handleSelect} count={listingCount} />
                  <AdminNavigationItem icon={<UsersRound size={18} />} label="Users & trials" view="users" activeView={activeView} onSelect={handleSelect} count={userCount} />
                </section>
                <section className="nav-menu-section nav-menu-section-account" aria-labelledby="nav-menu-account-heading">
                  <h2 className="nav-menu-section-title" id="nav-menu-account-heading">Finance</h2>
                  <AdminNavigationItem icon={<WalletCards size={18} />} label="Payments" view="payments" activeView={activeView} onSelect={handleSelect} count={paymentCount} attention={paymentCount > 0} />
                </section>
              </div>
            </div>
            
            <div className="admin-session">
              <AdminProfileMenu admin={admin} handleLogout={handleLogout} theme={theme} setTheme={setTheme} />
            </div>
          </nav>
        </div>
      </header>
      <main className="app-main"><div className="app-main-inner">{children}</div></main>
    </div>
  );
}
