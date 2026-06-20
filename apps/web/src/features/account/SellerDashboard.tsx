import { BadgeCheck, Clock, Gem, RefreshCcw } from "lucide-react";
import { formatLkr, getListingSubscriptionPlan, type Listing, type MarketplaceContent, type UserDashboard } from "@gems/schemas";
import { Metric } from "../../shared/Metric";
import { metricIcon } from "./helpers";

export function SellerDashboard({
  listings,
  content,
  dashboard,
  accountError
}: {
  listings: Listing[];
  content?: MarketplaceContent;
  dashboard: UserDashboard | null;
  accountError?: string | null;
}) {
  const activeSubscriptions = dashboard?.listingSubscriptions.filter((subscription) => subscription.status === "active").length ?? 0;
  const metrics = dashboard
    ? [
        { label: "Listings", value: String(listings.length) },
        { label: "Active subscriptions", value: String(activeSubscriptions) }
      ]
    : content?.sellerMetrics ?? [];

  return (
    <section className="dashboard">
      <div className="section-heading">
        <h1>Dashboard</h1>
        <p>Listing status, subscription validity, and seller trust signals.</p>
      </div>
      {accountError && <div className="empty-results"><h2>Account unavailable</h2><p>{accountError}</p></div>}
      <div className="metric-grid" style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }}>
        {metrics.map((metric) => (
          <Metric icon={metricIcon(metric.label)} label={metric.label} value={metric.value} key={metric.label} />
        ))}
      </div>
      <section className="data-panel">
        <h2>Listing status</h2>
        {listings.length === 0 ? (
          <p style={{ color: "var(--sage)", fontWeight: 600 }}>No listings yet.</p>
        ) : (
          <div className="purchase-history-table listing-status-table">
            <div className="purchase-history-row purchase-history-head listing-status-row listing-status-head">
              <span>Listing</span>
              <span>Subscription</span>
              <span>Status</span>
            </div>
            {listings.map((listing) => {
              const subscription = dashboard?.listingSubscriptions.find((item) => item.listingId === listing.id);
              const plan = subscription ? getListingSubscriptionPlan(subscription.planId) : undefined;
              return (
                <div className="purchase-history-row listing-status-row" key={listing.id}>
                  <div className="listing-status-product" data-label="Listing">
                    {listing.media?.[0] ? <img src={listing.media[0].url} alt={listing.title} /> : <div className="listing-status-placeholder" />}
                    <span>{listing.title}</span>
                  </div>
                  <span className="listing-status-description" data-label="Subscription">
                    {subscription && plan ? `${plan.name} · ${subscription.expiresAt ? `valid until ${formatDate(subscription.expiresAt)}` : "payment pending"}` : "Payment pending"}
                  </span>
                  <strong className="listing-status-pill" data-label="Status">{listing.status.replace("_", " ")}</strong>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section className="data-panel">
        <h2>Subscription payments</h2>
        {dashboard?.recentPayments.length ? (
          <div className="plan-grid">
            {dashboard.recentPayments.map((payment) => (
              <article className="plan-option selected" key={payment.id}>
                <Gem size={18} />
                <strong>{payment.quote.plan.name}</strong>
                <span>{formatLkr(payment.amountLkr)}</span>
                <small>{payment.status.replace("_", " ")} · {formatDate(payment.createdAt)}</small>
              </article>
            ))}
          </div>
        ) : (
          <p style={{ color: "var(--sage)", fontWeight: 600 }}>No subscription payments yet.</p>
        )}
      </section>
      <section className="data-panel">
        <h2>Renewal status</h2>
        {dashboard?.listingSubscriptions.length ? (
          <div className="plan-grid">
            {dashboard.listingSubscriptions.map((subscription) => {
              const plan = getListingSubscriptionPlan(subscription.planId);
              return (
                <article className="plan-option" key={subscription.id}>
                  {subscription.autoRenew ? <RefreshCcw size={18} /> : <Clock size={18} />}
                  <strong>{plan.name}</strong>
                  <span>{subscription.autoRenew ? "Auto-renew on" : "Auto-renew cancelled"}</span>
                  <small>{subscription.expiresAt ? `Current access ends ${formatDate(subscription.expiresAt)}` : "Awaiting payment confirmation"}</small>
                </article>
              );
            })}
          </div>
        ) : (
          <p style={{ color: "var(--sage)", fontWeight: 600 }}>No listing subscriptions yet.</p>
        )}
      </section>
      <section className="data-panel">
        <h2>Marketplace role</h2>
        <p style={{ color: "var(--muted)", fontWeight: 600, lineHeight: 1.6 }}>
          gemslanka.lk provides listing publication and moderation only. Gem sales, purchases, inspections, payments, delivery, and disputes happen outside the platform.
        </p>
        <div className="check-row"><BadgeCheck size={15} /> No refunds on listing subscriptions or renewal fees.</div>
      </section>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
}
