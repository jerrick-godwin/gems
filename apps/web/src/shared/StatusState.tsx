import { CreditCard, LoaderCircle, ShieldCheck } from "lucide-react";

type StatusStateProps = {
  title: string;
  message: string;
  loading?: boolean;
  variant?: "marketplace" | "admin" | "payment";
  showAction?: boolean;
  onRetry?: () => void | Promise<void>;
};

const MARKETPLACE_SKELETON_CARDS = ["primary", "secondary"] as const;

export function StatusState({ title, message, loading, variant = "marketplace", showAction = true, onRetry }: StatusStateProps) {
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
          <h1>{title}</h1>
          <p>{message}</p>
          <p className="payment-processing-note">Do not close, refresh, or go back while we finish this step.</p>
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
          <h1>{title}</h1>
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
      <h1 className={variant === "admin" ? "status-state-admin-title" : undefined}>{title}</h1>
      <p>{message}</p>
    </section>
  );
}
