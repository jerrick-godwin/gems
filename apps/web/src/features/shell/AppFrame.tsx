import { AlertCircle, BadgeCheck, BookOpen, CheckCircle2, Flag, Gem, Info, LogIn, LogOut, Menu, Plus, Settings, Store, User, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { ThemeSwitcher, useOutsideClick, type ThemePreference } from "@gems/ui";
import type { User as AccountUser } from "@gems/schemas";
import type { MarketplaceAuthUser } from "../../firebase";
import { footerDescription, seoLandingPages } from "../../shared/seo";
import { pathForView, type View } from "../../shared/types";
import { getTrialMenuLabel, getTrialMenuTone } from "../account/TrialStatusPanel";

function isClientNavigationClick(event: MouseEvent<HTMLAnchorElement>) {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey;
}

function nameFromEmail(email?: string | null) {
  return email?.split("@")[0]?.trim() ?? "";
}

const mobileMenuPanelId = "nav-mobile-menu-panel";

function BrandWordmark() {
  return (
    <span className="brand-wordmark" aria-label="gemslanka.lk">
      <span className="brand-wordmark-main" aria-hidden="true">
        <span>GEMSLANKA</span>
        <span className="brand-wordmark-domain">.LK</span>
      </span>
    </span>
  );
}

function ProfileMenu({
  view,
  navigateToView,
  handleLogout,
  user,
  accountUser,
  theme,
  setTheme,
  showTheme,
  onAction
}: {
  view: View;
  navigateToView: (view: View) => void;
  handleLogout: () => void;
  user?: MarketplaceAuthUser | null;
  accountUser?: AccountUser | null;
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  showTheme: boolean;
  onAction: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(menuRef, () => setIsOpen(false), isOpen);
  const accountName = accountUser?.name?.trim();
  const authName = user?.displayName?.trim();
  const email = accountUser?.email ?? user?.email ?? "";
  const displayName = accountName && accountName !== email ? accountName : authName || nameFromEmail(email) || "User";
  const avatarLabel = displayName.charAt(0).toUpperCase();
  const trialMenuLabel = getTrialMenuLabel(accountUser?.trial);

  return (
    <div className="profile-menu-container" ref={menuRef}>
      <button
        className="avatar-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Profile menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
      >
        {avatarLabel || <User size={17} />}
      </button>

      <div className={`profile-dropdown customer-profile-dropdown${isOpen ? " is-open" : ""}`} id={menuId}>
        <div className="profile-dropdown-header">
          <div className="profile-dropdown-name">{displayName}</div>
          <div className="profile-dropdown-email">{email}</div>
          {trialMenuLabel && (
            <div className="profile-dropdown-trial" style={{ "--profile-tone": getTrialMenuTone(accountUser?.trial) } as CSSProperties}>
              {trialMenuLabel}
            </div>
          )}
        </div>
        <a
          href={pathForView("my_listings")}
          className={`menu-item ${view === "my_listings" ? "active" : ""}`}
          onClick={(event) => {
            if (!isClientNavigationClick(event)) return;
            event.preventDefault();
            navigateToView("my_listings");
            setIsOpen(false);
            onAction();
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
            onAction();
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
            onAction();
          }}
        >
          <Settings size={16} /> Profile
        </a>
        {showTheme && (
          <div className="profile-theme-row">
            <span>Theme</span>
            <ThemeSwitcher theme={theme} setTheme={setTheme} />
          </div>
        )}
        <div className="profile-menu-divider" />
        <button
          className="menu-item danger"
          onClick={() => { onAction(); handleLogout(); setIsOpen(false); }}
        >
          <LogOut size={16} /> Sign Out
        </button>
      </div>
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
  onDismissPaymentNotice,
  onViewIntent,
  pendingView
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
  onViewIntent?: (view: View) => void;
  pendingView?: View | null;
}) {
  const [mobileMenuOpenView, setMobileMenuOpenView] = useState<View | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const isMobileMenuOpen = mobileMenuOpenView === view;
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const closeMobileMenu = useCallback(() => setMobileMenuOpenView(null), []);
  const closeMobileMenuAndRestoreFocus = useCallback(() => {
    closeMobileMenu();
    mobileMenuTriggerRef.current?.focus();
  }, [closeMobileMenu]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileMenuAndRestoreFocus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusableElements = Array.from(
        mobileMenuRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []
      ).filter((element) => element.getClientRects().length > 0);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) return;
      if (event.shiftKey && (document.activeElement === firstElement || !mobileMenuRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeMobileMenuAndRestoreFocus, isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    document.documentElement.classList.add("mobile-nav-open");
    return () => document.documentElement.classList.remove("mobile-nav-open");
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 760px)");
    const syncMobileViewport = () => {
      setIsMobileViewport(mobileQuery.matches);
      if (!mobileQuery.matches) closeMobileMenu();
    };
    syncMobileViewport();
    mobileQuery.addEventListener("change", syncMobileViewport);
    return () => mobileQuery.removeEventListener("change", syncMobileViewport);
  }, [closeMobileMenu]);

  useEffect(() => {
    setMobileMenuOpenView((current) => current === view ? current : null);
  }, [view]);

  const handleViewLinkClick = (event: MouseEvent<HTMLAnchorElement>, nextView: View) => {
    if (!isClientNavigationClick(event)) return;
    event.preventDefault();
    closeMobileMenu();
    setView(nextView);
  };

  const viewIntentProps = (nextView: View) => ({
    onPointerEnter: () => onViewIntent?.(nextView),
    onFocus: () => onViewIntent?.(nextView),
    onTouchStart: () => onViewIntent?.(nextView),
    "aria-busy": pendingView === nextView || undefined,
    "data-navigation-pending": pendingView === nextView ? "true" : undefined
  });

  const handleLogout = () => {
    closeMobileMenu();
    import("../../firebase").then(({ authClient }) => authClient.signOut()).then(() => {
      setView("market");
    });
  };

  const isPostFlow = view === "post" || view === "post_checkout";
  const mobileHeaderActionView: View = isPostFlow ? "market" : "post";
  const mobileHeaderActionLabel = isPostFlow ? "Back to Listings" : "Post a Gem";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner customer-topbar-inner">
          <a className="brand" href={pathForView("market")} onClick={(event) => handleViewLinkClick(event, "market")} aria-label="gemslanka.lk home">
            <span className="brand-mark brand-mark-main">
              <img src="/assets/gemslanka-logo.png" alt="" />
            </span>
            <span className="brand-site-name"><BrandWordmark /></span>
          </a>

          <nav className="nav-actions" aria-label="Primary" data-nosnippet ref={mobileMenuRef}>
            <a
              className="mobile-header-context-action"
              href={pathForView(mobileHeaderActionView)}
              onClick={(event) => handleViewLinkClick(event, mobileHeaderActionView)}
              id="nav-mobile-context-action"
              {...viewIntentProps(mobileHeaderActionView)}
            >
              {mobileHeaderActionLabel}
            </a>
            <button
              type="button"
              className="mobile-nav-toggle"
              id="nav-mobile-menu"
              aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls={mobileMenuPanelId}
              onClick={() => setMobileMenuOpenView((current) => current === view ? null : view)}
              ref={mobileMenuTriggerRef}
            >
              {isMobileMenuOpen
                ? <X size={22} strokeWidth={2.4} aria-hidden="true" />
                : <Menu size={22} strokeWidth={2.4} aria-hidden="true" />}
            </button>
            <div className={`nav-menu-panel${isMobileMenuOpen ? " is-open" : ""}`} id={mobileMenuPanelId}>
              <div className="mobile-nav-menu-sections">
                {authResolved && !isSignedIn && !isMobileViewport && (
                  <div className="desktop-nav-theme">
                    <ThemeSwitcher theme={theme} setTheme={setTheme} />
                  </div>
                )}
                <section className="nav-menu-section nav-menu-section-marketplace" aria-labelledby="nav-menu-marketplace-heading">
                  <h2 className="nav-menu-section-title" id="nav-menu-marketplace-heading">Marketplace</h2>
                  <a
                    href={pathForView("market")}
                    className={`nav-menu-action${view === "market" ? " active" : ""}`}
                    onClick={(event) => handleViewLinkClick(event, "market")}
                    id="nav-browse"
                  >
                    <Gem size={17} strokeWidth={2.2} aria-hidden="true" />
                    Browse
                  </a>
                  <a
                    href={pathForView("post")}
                    className={`nav-menu-action primary-action${view === "post" || view === "post_checkout" ? " active" : ""}`}
                    onClick={(event) => handleViewLinkClick(event, "post")}
                    id="nav-post"
                    {...viewIntentProps("post")}
                  >
                    <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
                    Post a Gem
                  </a>
                </section>
                <section className="nav-menu-section nav-menu-section-guides" aria-labelledby="nav-menu-guides-heading">
                  <h2 className="nav-menu-section-title" id="nav-menu-guides-heading">Guides</h2>
                  <div className="nav-guide-grid">
                    <a className="nav-guide-card" href={seoLandingPages.gemstones.path} onClick={(event) => { if (isClientNavigationClick(event)) closeMobileMenu(); }}>
                      <Gem size={20} strokeWidth={2} aria-hidden="true" />
                      <span>Gemstone Types</span>
                    </a>
                    <a className="nav-guide-card" href={seoLandingPages["buying-guide"].path} onClick={(event) => { if (isClientNavigationClick(event)) closeMobileMenu(); }}>
                      <BookOpen size={20} strokeWidth={2} aria-hidden="true" />
                      <span>Buying Guide</span>
                    </a>
                    <a className="nav-guide-card" href={seoLandingPages["certification-guide"].path} onClick={(event) => { if (isClientNavigationClick(event)) closeMobileMenu(); }}>
                      <BadgeCheck size={20} strokeWidth={2} aria-hidden="true" />
                      <span>Certificates &amp; Treatments</span>
                    </a>
                    <a className="nav-guide-card" href={seoLandingPages.about.path} onClick={(event) => { if (isClientNavigationClick(event)) closeMobileMenu(); }}>
                      <Info size={20} strokeWidth={2} aria-hidden="true" />
                      <span>About Gemslanka</span>
                    </a>
                  </div>
                </section>
                <section className="nav-menu-section nav-menu-section-account" aria-labelledby="nav-menu-account-heading">
                  <h2 className="nav-menu-section-title" id="nav-menu-account-heading">Account</h2>
                  {!authResolved ? (
                    <span className="nav-auth-placeholder" aria-hidden="true">
                      <span className="skeleton nav-auth-placeholder-avatar" />
                    </span>
                  ) : isSignedIn ? (
                    <ProfileMenu
                      view={view}
                      navigateToView={setView}
                      handleLogout={handleLogout}
                      user={user}
                      accountUser={accountUser}
                      theme={theme}
                      setTheme={setTheme}
                      showTheme={!isMobileViewport}
                      onAction={closeMobileMenu}
                    />
                  ) : (
                    <a className="nav-menu-action login-button" href={pathForView("login")} onClick={(event) => handleViewLinkClick(event, "login")} id="nav-login" {...viewIntentProps("login")}>
                      <LogIn size={16} strokeWidth={2.5} aria-hidden="true" />
                      Sign In
                    </a>
                  )}
                </section>
              </div>
              {authResolved && isMobileViewport && (
                <div className="nav-menu-theme-dock">
                  <ThemeSwitcher theme={theme} setTheme={setTheme} />
                </div>
              )}
            </div>
          </nav>
        </div>
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
      <main className="app-main"><div className="app-main-inner">{children}</div></main>
      <footer className="site-footer" data-nosnippet>
        <div className="footer-accent-bar" aria-hidden="true" />
        <div className="site-footer-inner">
          {/* Brand column */}
          <div className="footer-brand-col">
            <div className="footer-brand">
              <div className="footer-logo-wrap">
                <img src="/assets/gemslanka-logo.png" alt="gemslanka.lk" />
              </div>
              <div className="footer-brand-text">
                <strong><BrandWordmark /></strong>
                <p>{footerDescription}</p>
              </div>
            </div>
          </div>

          <div className="footer-links-grid">
            {/* Marketplace links */}
            <div className="footer-col">
              <h3 className="footer-col-heading">Marketplace</h3>
              <nav className="footer-col-links" aria-label="Marketplace">
                <a href={pathForView("market")} onClick={(event) => handleViewLinkClick(event, "market")}>Browse Gems</a>
                <a href="/buy-gemstones">Buy Gemstones</a>
                <a href="/sell-gemstones">Sell Gemstones</a>
                <a href={pathForView("post")} onClick={(event) => handleViewLinkClick(event, "post")} {...viewIntentProps("post")}>Post a Listing</a>
                {!authResolved ? (
                  <span className="footer-auth-placeholder" aria-hidden="true">
                    <span className="skeleton footer-auth-placeholder-line short" />
                  </span>
                ) : isSignedIn ? (
                  <a href={pathForView("my_listings")} onClick={(event) => handleViewLinkClick(event, "my_listings")} {...viewIntentProps("my_listings")}>My Listings</a>
                ) : (
                  <a href={pathForView("login")} onClick={(event) => handleViewLinkClick(event, "login")} {...viewIntentProps("login")}>Sign In</a>
                )}
              </nav>
            </div>

            <div className="footer-col">
              <h3 className="footer-col-heading">Guides &amp; About</h3>
              <nav className="footer-col-links" aria-label="Guides and information">
                <a href="/gemstones">Gemstone Guide</a>
                <a href="/guides/buying-gemstones-online">Buying Guide</a>
                <a href="/guides/gemstone-certification-and-treatments">Certification &amp; Treatments</a>
                <a href="/about-us">About Us</a>
              </nav>
            </div>

            {/* Legal links */}
            <div className="footer-col">
              <h3 className="footer-col-heading">Support &amp; Legal</h3>
              <nav className="footer-col-links" aria-label="Support and legal">
                <a href={pathForView("contact")} onClick={(event) => handleViewLinkClick(event, "contact")}>Contact Us</a>
                <a href={pathForView("terms")} onClick={(event) => handleViewLinkClick(event, "terms")}>Terms &amp; Conditions</a>
                <a href={pathForView("privacy")} onClick={(event) => handleViewLinkClick(event, "privacy")}>Privacy Policy</a>
                <a href={pathForView("refund")} onClick={(event) => handleViewLinkClick(event, "refund")}>Refund Policy</a>
              </nav>
            </div>
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
