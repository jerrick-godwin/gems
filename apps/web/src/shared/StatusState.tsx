import { CreditCard, LoaderCircle, ShieldCheck } from "lucide-react";

type StatusStateProps = {
  title: string;
  message: string;
  loading?: boolean;
  variant?: "marketplace" | "admin" | "payment" | "simple";
  showAction?: boolean;
  onRetry?: () => void | Promise<void>;
  headingLevel?: 1 | 2;
};

const MARKETPLACE_SKELETON_CARDS = ["primary", "secondary"] as const;
const ADMIN_SKELETON_NAV_ITEMS = ["overview", "moderation", "listings", "users", "payments"] as const;
const ADMIN_SKELETON_METRICS = ["reviews", "reports", "certificates", "subscriptions", "trials"] as const;

export function StatusState({ title, message, loading, variant = "marketplace", showAction = true, onRetry, headingLevel = 1 }: StatusStateProps) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  const retryLoad = () => {
    window.scrollTo({ top: 0, left: 0 });
    if (onRetry) {
      void onRetry();
      return;
    }
    window.location.reload();
  };

  if (loading && variant === "payment") {
    return (
      <section className="status-state payment-processing-state" aria-busy="true" aria-live="polite">
        <div className="payment-processing-animation" aria-hidden="true">
          <CreditCard size={42} strokeWidth={1.8} />
          <LoaderCircle className="payment-processing-spinner" size={24} strokeWidth={2.5} />
        </div>
        <div className="status-state-copy">
          <Heading>{title}</Heading>
          <p>{message}</p>
          <p className="payment-processing-note">Do not close, refresh, or go back while we finish this step.</p>
        </div>
      </section>
    );
  }

  if (loading && variant === "admin") {
    return (
      <section className="dashboard admin-workspace admin-skeleton" aria-busy="true" aria-live="polite" aria-label={`${title}. ${message}`}>
        <aside className="admin-navigation admin-skeleton-navigation card card--surface" aria-hidden="true">
          <div className="admin-navigation-heading admin-skeleton-navigation-heading">
            <span className="skeleton skeleton-text admin-skeleton-nav-eyebrow" />
            <span className="skeleton skeleton-text admin-skeleton-nav-title" />
          </div>
          <div className="admin-navigation-list">
            {ADMIN_SKELETON_NAV_ITEMS.map((item) => (
              <span className="skeleton admin-skeleton-nav-item" key={item} />
            ))}
          </div>
        </aside>

        <div className="admin-workspace-content" aria-hidden="true">
          <div className="admin-skeleton-heading">
            <span className="skeleton skeleton-text admin-skeleton-eyebrow" />
            <span className="skeleton skeleton-text admin-skeleton-title" />
            <span className="skeleton skeleton-text admin-skeleton-subtitle" />
          </div>

          <div className="metric-grid admin-overview-metrics admin-skeleton-metrics">
            {ADMIN_SKELETON_METRICS.map((metric) => (
              <div className="metric-card card card--metric admin-skeleton-metric" key={metric}>
                <span className="skeleton admin-skeleton-metric-icon" />
                <span className="skeleton skeleton-text admin-skeleton-metric-label" />
                <span className="skeleton skeleton-text admin-skeleton-metric-value" />
              </div>
            ))}
          </div>

          <div className="admin-console-stack admin-skeleton-panels">
            <div className="data-panel card card--surface admin-skeleton-panel">
              <span className="skeleton skeleton-text admin-skeleton-panel-eyebrow" />
              <span className="skeleton skeleton-text admin-skeleton-panel-title" />
              <div className="admin-skeleton-panel-grid">
                <span className="skeleton admin-skeleton-panel-card" />
                <span className="skeleton admin-skeleton-panel-card" />
                <span className="skeleton admin-skeleton-panel-card" />
              </div>
            </div>
            <div className="data-panel card card--surface admin-skeleton-panel admin-skeleton-panel-compact">
              <span className="skeleton skeleton-text admin-skeleton-panel-eyebrow" />
              <span className="skeleton skeleton-text admin-skeleton-panel-title" />
              <span className="skeleton admin-skeleton-panel-row" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (loading && variant === "marketplace") {
    return (
      <section className="market-skeleton" aria-busy="true" aria-live="polite" aria-label={`${title}. ${message}`}>
        <section className="feed market-skeleton-feed" aria-hidden="true">
          <div className="feed-header market-skeleton-header">
            <div className="market-skeleton-heading">
              <span className="skeleton skeleton-text market-skeleton-title" />
              <span className="skeleton skeleton-text market-skeleton-subtitle" />
            </div>
            <span className="skeleton market-skeleton-sort" />
          </div>

          <div className="listing-list market-skeleton-list">
            {MARKETPLACE_SKELETON_CARDS.map((card) => (
              <article className="listing-card market-skeleton-card" key={card}>
                <div className="skeleton market-skeleton-media" />
                <div className="listing-content market-skeleton-card-content">
                  <span className="skeleton skeleton-text market-skeleton-type" />
                  <span className="skeleton skeleton-text market-skeleton-name" />
                  <span className="skeleton skeleton-text market-skeleton-location" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="filters market-skeleton-filters" aria-hidden="true">
          <span className="skeleton market-skeleton-search" />
          <div className="market-skeleton-filter-summary">
            <span className="skeleton skeleton-text market-skeleton-filter-title" />
            <span className="skeleton skeleton-text market-skeleton-filter-line" />
          </div>
        </aside>

      </section>
    );
  }

  if (variant === "marketplace") {
    return (
      <section className="status-state status-state-marketplace" aria-live="polite">
        <div className="status-state-copy">
          <Heading>{title}</Heading>
          <p>{message}</p>
        </div>
        {showAction && (
          <button className="status-state-action" type="button" onClick={retryLoad}>
            Retry
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="status-state">
      {loading && (
        <div className="status-state-icon">
          <ShieldCheck size={48} strokeWidth={1.5} />
        </div>
      )}
      <Heading className={variant === "admin" ? "status-state-admin-title" : undefined}>{title}</Heading>
      <p>{message}</p>
    </section>
  );
}
