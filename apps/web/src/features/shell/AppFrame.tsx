import { AlertCircle, CheckCircle2, Flag, Info, LogIn, LogOut, Plus, Settings, Store, User, X } from "lucide-react";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ThemeSwitcher, useOutsideClick, type ThemePreference } from "@gems/ui";
import type { User as AccountUser } from "@gems/schemas";
import { authClient, type MarketplaceAuthUser } from "../../firebase";
import { pathForView, type View } from "../../shared/types";

function isClientNavigationClick(event: MouseEvent<HTMLAnchorElement>) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey;
}

function nameFromEmail(email?: string | null) {
  return email?.split("@")[0]?.trim() ?? "";
}

function ProfileMenu({
  view,
  navigateToView,
  handleLogout,
  user,
  accountUser,
  theme,
  setTheme
}: {
  view: View;
  navigateToView: (view: View) => void;
  handleLogout: () => void;
  user?: MarketplaceAuthUser | null;
  accountUser?: AccountUser | null;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(menuRef, () => setIsOpen(false), isOpen);
  const accountName = accountUser?.name?.trim();
  const authName = user?.displayName?.trim();
  const email = accountUser?.email ?? user?.email ?? "";
  const displayName = accountName && accountName !== email ? accountName : authName || nameFromEmail(email) || "User";
  const avatarLabel = displayName.charAt(0).toUpperCase();

  return (
    <div className="profile-menu-container" ref={menuRef} style={{ position: "relative" }}>
      <button 
        className="avatar-button" 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: "var(--emerald-subtle)",
          color: "var(--emerald)",
          border: "2px solid var(--emerald)",
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 16,
          transition: "box-shadow 0.2s, transform 0.15s"
        }}
        aria-label="Profile menu"
      >
        {avatarLabel || <User size={17} />}
      </button>
      
      {isOpen && (
        <div className="profile-dropdown">
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
            <div style={{ fontWeight: 800, color: "var(--ink)", fontSize: 15, overflowWrap: "anywhere" }}>{displayName}</div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 3, overflowWrap: "anywhere" }}>{email}</div>
          </div>
          <a
            href={pathForView("my_listings")}
            className={`menu-item ${view === "my_listings" ? "active" : ""}`}
            onClick={(event) => {
              if (!isClientNavigationClick(event)) return;
              event.preventDefault();
              navigateToView("my_listings");
              setIsOpen(false);
            }}
          >
            <Store size={16} /> My Listings
          </a>
          <a
            href={pathForView("reports")}
            className={`menu-item ${view === "reports" ? "active" : ""}`}
            onClick={(event) => {
              if (!isClientNavigationClick(event)) return;
              event.preventDefault();
              navigateToView("reports");
              setIsOpen(false);
            }}
          >
            <Flag size={16} /> My Reports
          </a>
          <a
            href={pathForView("profile")}
            className={`menu-item ${view === "profile" ? "active" : ""}`}
            onClick={(event) => {
              if (!isClientNavigationClick(event)) return;
              event.preventDefault();
              navigateToView("profile");
              setIsOpen(false);
            }}
          >
            <Settings size={16} /> Profile
          </a>
          <div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", gap: 8 }}
          >
            <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>Theme</span>
            <ThemeSwitcher theme={theme} setTheme={setTheme} />
          </div>
          <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
          <button
            className="menu-item danger"
            onClick={() => { handleLogout(); setIsOpen(false); }}
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
  authResolved,
  theme,
  setTheme,
  user,
  accountUser,
  paymentNotice,
  onDismissPaymentNotice
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
  authResolved: boolean;
  theme: "system" | "light" | "dark";
  setTheme: (t: "system" | "light" | "dark") => void;
  user?: MarketplaceAuthUser | null;
  accountUser?: AccountUser | null;
  paymentNotice?: {
    tone: "success" | "warning" | "error" | "neutral";
    message: string;
  } | null;
  onDismissPaymentNotice?: () => void;
}) {
  const handleViewLinkClick = (event: MouseEvent<HTMLAnchorElement>, nextView: View) => {
    if (!isClientNavigationClick(event)) return;
    event.preventDefault();
    setView(nextView);
  };

  const handleLogout = () => {
    authClient.signOut().then(() => {
      setView("market");
    });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={pathForView("market")} onClick={(event) => handleViewLinkClick(event, "market")} aria-label="gemslanka.lk home">
          <span className="brand-mark" style={{ width: 48, height: 48 }}>
            <img src="/assets/gemslanka-logo.png" alt="" />
          </span>
          <span className="brand-site-name">gemslanka.lk</span>
        </a>

        <nav className="nav-actions" aria-label="Primary">
          {authResolved && !isSignedIn && <ThemeSwitcher theme={theme} setTheme={setTheme} />}
          <a
            href={pathForView("market")}
            className={view === "market" ? "active" : ""}
            onClick={(event) => handleViewLinkClick(event, "market")}
            id="nav-browse"
            style={{ position: "relative" }}
          >
            Browse
          </a>
          
          {!authResolved ? (
            <span className="nav-auth-placeholder" aria-hidden="true">
              <span className="skeleton nav-auth-placeholder-action" />
              <span className="skeleton nav-auth-placeholder-avatar" />
            </span>
          ) : isSignedIn ? ( <>
            <a
              href={pathForView("post")}
              className={`primary-action${view === "post" ? " active" : ""}`}
              onClick={(event) => handleViewLinkClick(event, "post")}
              id="nav-post"
              style={{ padding: "0 16px" }}
            >
              <Plus size={16} strokeWidth={2.5} />
              Post a Gem
            </a>
            <ProfileMenu view={view} navigateToView={setView} handleLogout={handleLogout} user={user} accountUser={accountUser} theme={theme} setTheme={setTheme} />
          </>
          ) : (
            <>
              <a
                href={pathForView("post")}
                className={`primary-action${view === "post" || view === "post_checkout" ? " active" : ""}`}
                onClick={(event) => handleViewLinkClick(event, "post")}
                id="nav-post"
                style={{ padding: "0 16px" }}
              >
                <Plus size={16} strokeWidth={2.5} />
                Post a Gem
              </a>
              <a className="login-button" href={pathForView("login")} onClick={(event) => handleViewLinkClick(event, "login")} id="nav-login">
                <LogIn size={16} strokeWidth={2.5} />
                Sign In
              </a>
            </>
          )}
        </nav>
      </header>
      {paymentNotice && (
        <div className={`payment-notice payment-notice-${paymentNotice.tone}`} role="status" aria-live="polite">
          {paymentNotice.tone === "success" ? (
            <CheckCircle2 size={18} />
          ) : paymentNotice.tone === "neutral" ? (
            <Info size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          <span>{paymentNotice.message}</span>
          <button type="button" onClick={onDismissPaymentNotice} aria-label="Dismiss payment notice">
            <X size={16} />
          </button>
        </div>
      )}
      <main>{children}</main>
      <footer className="site-footer">
        <div className="footer-accent-bar" aria-hidden="true" />
        <div className="site-footer-inner">
          {/* Brand column */}
          <div className="footer-brand-col">
            <div className="footer-brand">
              <div className="footer-logo-wrap">
                <img src="/assets/gemslanka-logo.png" alt="gemslanka.lk" />
              </div>
              <div className="footer-brand-text">
                <strong>gemslanka.lk</strong>
                <p>Sri Lanka's premier gemstone marketplace — connecting trusted sellers with discerning buyers.</p>
              </div>
            </div>
          </div>

          {/* Marketplace links */}
          <div className="footer-col">
            <h3 className="footer-col-heading">Marketplace</h3>
            <nav className="footer-col-links" aria-label="Marketplace">
              <a href={pathForView("market")} onClick={(event) => handleViewLinkClick(event, "market")}>Browse Gems</a>
              {!authResolved ? (
                <span className="footer-auth-placeholder" aria-hidden="true">
                  <span className="skeleton footer-auth-placeholder-line" />
                  <span className="skeleton footer-auth-placeholder-line short" />
                </span>
              ) : isSignedIn ? (
                <>
                  <a href={pathForView("post")} onClick={(event) => handleViewLinkClick(event, "post")}>Post a Listing</a>
                  <a href={pathForView("my_listings")} onClick={(event) => handleViewLinkClick(event, "my_listings")}>My Listings</a>
                </>
              ) : (
                <>
                  <a href={pathForView("post")} onClick={(event) => handleViewLinkClick(event, "post")}>Post a Listing</a>
                  <a href={pathForView("login")} onClick={(event) => handleViewLinkClick(event, "login")}>Sign In</a>
                </>
              )}
            </nav>
          </div>

          {/* Legal links */}
          <div className="footer-col">
            <h3 className="footer-col-heading">Legal &amp; Support</h3>
            <nav className="footer-col-links" aria-label="Legal">
              <a href={pathForView("contact")} onClick={(event) => handleViewLinkClick(event, "contact")}>Contact Us</a>
              <a href={pathForView("terms")} onClick={(event) => handleViewLinkClick(event, "terms")}>Terms &amp; Conditions</a>
              <a href={pathForView("privacy")} onClick={(event) => handleViewLinkClick(event, "privacy")}>Privacy Policy</a>
              <a href={pathForView("refund")} onClick={(event) => handleViewLinkClick(event, "refund")}>Refund Policy</a>
            </nav>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="footer-bottom-bar">
          <p className="footer-copy">&copy; {new Date().getFullYear()} gemslanka.lk. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
