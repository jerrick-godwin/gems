import { Heart, LogIn, LogOut, Plus, Settings, ShoppingCart, Store, User, Flag } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { ThemeSwitcher, useOutsideClick, type ThemePreference } from "@gems/ui";
import { authClient, type MarketplaceAuthUser } from "../../firebase";
import type { View } from "../../shared/types";

function ProfileMenu({
  view,
  setView,
  handleLogout,
  user,
  theme,
  setTheme
}: {
  view: View;
  setView: (view: View) => void;
  handleLogout: () => void;
  user?: MarketplaceAuthUser | null;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}) {
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
        {user?.displayName ? user.displayName.charAt(0).toUpperCase() : <User size={18} />}
      </button>
      
      {isOpen && (
        <div 
          className="profile-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            background: "var(--dropdown-bg)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
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
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
            <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: 14 }}>{user?.displayName || "User"}</div>
            <div style={{ color: "var(--sage)", fontSize: 12 }}>{user?.email || ""}</div>
          </div>
          <button
            className={`menu-item ${view === "wishlist" ? "active" : ""}`}
            onClick={() => { setView("wishlist"); setIsOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: view === "wishlist" ? "var(--emerald-subtle)" : "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: view === "wishlist" ? "var(--emerald)" : "var(--ink)", width: "100%", justifyContent: "flex-start", fontSize: 14, textAlign: "left", fontWeight: view === "wishlist" ? 600 : 500 }}
          >
            <Heart size={16} /> Wishlist
          </button>
          <button
            className={`menu-item ${view === "dashboard" ? "active" : ""}`}
            onClick={() => { setView("dashboard"); setIsOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: view === "dashboard" ? "var(--emerald-subtle)" : "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: view === "dashboard" ? "var(--emerald)" : "var(--ink)", width: "100%", justifyContent: "flex-start", fontSize: 14, textAlign: "left", fontWeight: view === "dashboard" ? 600 : 500 }}
          >
            <User size={16} /> Dashboard
          </button>
          <button
            className={`menu-item ${view === "my_listings" ? "active" : ""}`}
            onClick={() => { setView("my_listings"); setIsOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: view === "my_listings" ? "var(--emerald-subtle)" : "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: view === "my_listings" ? "var(--emerald)" : "var(--ink)", width: "100%", justifyContent: "flex-start", fontSize: 14, textAlign: "left", fontWeight: view === "my_listings" ? 600 : 500 }}
          >
            <Store size={16} /> My Listings
          </button>
          <button
            className={`menu-item ${view === "reports" ? "active" : ""}`}
            onClick={() => { setView("reports"); setIsOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: view === "reports" ? "var(--emerald-subtle)" : "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: view === "reports" ? "var(--emerald)" : "var(--ink)", width: "100%", justifyContent: "flex-start", fontSize: 14, textAlign: "left", fontWeight: view === "reports" ? 600 : 500 }}
          >
            <Flag size={16} /> My Reports
          </button>
          <button
            className={`menu-item ${view === "profile" ? "active" : ""}`}
            onClick={() => { setView("profile"); setIsOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: view === "profile" ? "var(--emerald-subtle)" : "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: view === "profile" ? "var(--emerald)" : "var(--ink)", width: "100%", justifyContent: "flex-start", fontSize: 14, textAlign: "left", fontWeight: view === "profile" ? 600 : 500 }}
          >
            <Settings size={16} /> Profile
          </button>
          <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--sage)", fontWeight: 500 }}>Theme</span>
            <ThemeSwitcher theme={theme} setTheme={setTheme} />
          </div>
          <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
          <button
            className="menu-item"
            onClick={() => { handleLogout(); setIsOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--red)", width: "100%", justifyContent: "flex-start", fontSize: 14, textAlign: "left", fontWeight: 500 }}
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
}



export function AppFrame({
  children,
  view,
  setView,
  query,
  setQuery,
  selectedLocations,
  setSelectedLocations,
  locations,
  isSignedIn,
  theme,
  setTheme,
  user
}: {
  children: ReactNode;
  view: View;
  setView: (view: View) => void;
  query: string;
  setQuery: (query: string) => void;
  selectedLocations: string[];
  setSelectedLocations: (locations: string[]) => void;
  locations: string[];
  isSignedIn: boolean;
  theme: "system" | "light" | "dark";
  setTheme: (t: "system" | "light" | "dark") => void;
  user?: MarketplaceAuthUser | null;
}) {
  const handleLogout = () => {
    authClient.signOut().then(() => {
      setView("market");
    });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("market")} aria-label="Gems Marketplace home">
          <span className="brand-mark">
            <img src="/assets/logo-mark.svg" alt="" />
          </span>
          <span>
            Gems
            <strong>Marketplace</strong>
          </span>
        </button>

        <nav className="nav-actions" aria-label="Primary">
          {!isSignedIn && <ThemeSwitcher theme={theme} setTheme={setTheme} />}
          <button
            className={view === "market" ? "active" : ""}
            onClick={() => setView("market")}
            id="nav-browse"
          >
            Browse
          </button>
          
          {isSignedIn ? ( <>
            <button
              className={view === "cart" ? "active" : ""}
              onClick={() => setView("cart")}
              id="nav-cart"
            >
              <ShoppingCart size={16} strokeWidth={2.5} />
              Cart
            </button>
            <button
              className={view === "post" ? "active" : ""}
              onClick={() => setView("post")}
              id="nav-post"
            >
              <Plus size={16} strokeWidth={2.5} />
              Post a Gem
            </button>
            <ProfileMenu view={view} setView={setView} handleLogout={handleLogout} user={user} theme={theme} setTheme={setTheme} />
          </>
          ) : (
            <>
              <button
                className={view === "wishlist" ? "active" : ""}
                onClick={() => setView("wishlist")}
                id="nav-wishlist"
              >
                Wishlist
              </button>
              <button className="login-button" onClick={() => setView("login")} id="nav-login" style={{ background: "transparent", color: "var(--ink)", padding: "0 16px", flexShrink: 0 }}>
                <LogIn size={16} strokeWidth={2.5} />
                Sign In
              </button>
            </>
          )}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}

