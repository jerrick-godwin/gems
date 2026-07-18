import { CircleAlert, Clock, CreditCard, PackageCheck, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminModerationSnapshot, GemsAdminApiClient } from "@gems/api-client";
import type { BillingHistoryPage, PaymentAttempt } from "@gems/schemas";
import { Metric } from "../../shared/Metric";
import { publicErrorMessage } from "../../shared/helpers";
import {
  adminBillingApi,
  invoiceNeedsAttention,
  matchesBillingInvoice,
  matchesPaymentAttempt,
  mergeBillingHistory
} from "./adminBilling";
import { AdminBillingInvoiceRow } from "./AdminBillingInvoiceRow";
import { AdminPaymentAttemptRow } from "./AdminPaymentAttemptRow";

interface AdminBillingPanelProps {
  api: GemsAdminApiClient;
  token: string;
  payments: PaymentAttempt[];
  search: string;
  onSearchChange: (value: string) => void;
  snapshot: AdminModerationSnapshot;
}

export function AdminBillingPanel({
  api,
  token,
  payments,
  search,
  onSearchChange,
  snapshot
}: AdminBillingPanelProps) {
  const [history, setHistory] = useState<BillingHistoryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [billingError, setBillingError] = useState("");

  useEffect(() => {
    const loadBillingHistory = adminBillingApi(api).billingHistory;
    if (!loadBillingHistory) {
      setHistory(null);
      setBillingError("");
      setLoading(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setHistory(null);
      setBillingError("");
      setLoading(true);
      loadBillingHistory.call(api, token, { limit: 50, search: search.trim() || undefined })
        .then((page) => {
          if (active) setHistory(page);
        })
        .catch((error: unknown) => {
          if (active) {
            setHistory(null);
            setBillingError(publicErrorMessage(error, "Detailed billing history is unavailable"));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, token, search]);

  const attempts = history?.attempts ?? payments;
  const filteredAttempts = attempts.filter((attempt) => {
    const context = marketplaceContext(snapshot, attempt.userId, attempt.listingId);
    return matchesPaymentAttempt(attempt, search, context);
  });
  const invoices = history?.invoices ?? [];
  const filteredInvoices = invoices.filter((invoice) => {
    const context = marketplaceContext(snapshot, invoice.userId, invoice.listingId);
    return matchesBillingInvoice(invoice, search, context);
  });
  const pendingCount = attempts.filter((attempt) => attempt.status === "pending" || attempt.status === "scheduled").length;
  const successfulCount = attempts.filter((attempt) => attempt.status === "succeeded").length;
  const failedCount = attempts.filter((attempt) => attempt.status === "failed").length;
  const invoiceAttentionCount = invoices.filter(invoiceNeedsAttention).length;
  const otherCount = attempts.length - pendingCount - successfulCount - failedCount;
  const totalCount = attempts.length + invoices.length;
  const visibleCount = filteredAttempts.length + filteredInvoices.length;
  const hasSearch = Boolean(search.trim());

  const loadMore = async () => {
    const loadBillingHistory = adminBillingApi(api).billingHistory;
    if (!loadBillingHistory || !history?.nextCursor) return;

    setLoadingMore(true);
    setBillingError("");
    try {
      const nextPage = await loadBillingHistory.call(api, token, { cursor: history.nextCursor, limit: 50, search: search.trim() || undefined });
      setHistory((current) => mergeBillingHistory(current, nextPage));
    } catch (error) {
      setBillingError(publicErrorMessage(error, "Unable to load more billing history"));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="admin-console-stack">
      <div className="metric-grid admin-view-metrics admin-payment-metrics">
        <Metric icon={PackageCheck} label="Succeeded" value={String(successfulCount)} accent="var(--emerald)" />
        <Metric icon={Clock} label="Pending / scheduled" value={String(pendingCount)} accent="var(--gold)" />
        <Metric icon={CircleAlert} label="Failed" value={String(failedCount)} accent="var(--danger)" />
        <Metric
          icon={CreditCard}
          label={history ? "Invoice alerts" : "Other"}
          value={String(history ? invoiceAttentionCount : otherCount)}
          accent={history && invoiceAttentionCount > 0 ? "var(--danger)" : "var(--muted)"}
        />
      </div>

      {pendingCount > 0 && (
        <section className="data-panel admin-orders-panel card card--inset card--compact">
          <h2>Gateway confirmations</h2>
          <div className="admin-payment-status">
            <CreditCard size={18} aria-hidden="true" />
            {pendingCount} payment attempt{pendingCount === 1 ? " is" : "s are"} pending or scheduled.
          </div>
        </section>
      )}

      <section className="data-panel admin-data-section card card--surface">
        <div className="admin-section-header">
          <div>
            <h2>{history ? "Billing history" : "Payment history"}</h2>
            <span>{hasSearch ? `${visibleCount} of ${totalCount}` : totalCount} item{(hasSearch ? visibleCount : totalCount) === 1 ? "" : "s"}</span>
          </div>
          <label className="admin-section-search">
            <Search size={16} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search payments, invoices, users, or listings"
              aria-label="Search payments, invoices, users, or listings"
            />
          </label>
        </div>

        {loading && <span className="admin-inline-note" role="status">Loading invoice history. Current payment attempts remain available below.</span>}
        {billingError && <span className="admin-inline-error" role="alert">{billingError}. Showing the current payment snapshot.</span>}

        <div className="admin-section-scroll">
          {history && (
            <div className="admin-console-stack">
              <div className="admin-panel-title-row">
                <div>
                  <span className="admin-panel-eyebrow">Stripe billing</span>
                  <h2>Invoices</h2>
                </div>
                <span>{filteredInvoices.length} of {invoices.length}</span>
              </div>
              {invoices.length === 0 ? (
                <div className="admin-section-empty">No billing invoices found.</div>
              ) : filteredInvoices.length === 0 ? (
                <div className="admin-section-empty">No invoices match your search.</div>
              ) : (
                <div className="admin-payment-list">
                  {filteredInvoices.map((invoice) => (
                    <AdminBillingInvoiceRow api={api} token={token} invoice={invoice} snapshot={snapshot} key={invoice.id} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="admin-console-stack">
            {history && (
              <div className="admin-panel-title-row">
                <div>
                  <span className="admin-panel-eyebrow">Checkout and renewals</span>
                  <h2>Payment attempts</h2>
                </div>
                <span>{filteredAttempts.length} of {attempts.length}</span>
              </div>
            )}
            {attempts.length === 0 ? (
              <div className="admin-section-empty">No payments found.</div>
            ) : filteredAttempts.length === 0 ? (
              <div className="admin-section-empty">No payment attempts match your search.</div>
            ) : (
              <div className="admin-payment-list">
                {filteredAttempts.map((attempt) => {
                  const hasInvoiceActions = invoices.some((invoice) =>
                    invoice.paymentAttemptId === attempt.id
                    || (attempt.subscriptionId && invoice.subscriptionId === attempt.subscriptionId)
                    || invoice.listingId === attempt.listingId
                  );
                  return (
                    <AdminPaymentAttemptRow
                      api={api}
                      token={token}
                      attempt={attempt}
                      snapshot={snapshot}
                      showSubscriptionActions={!hasInvoiceActions}
                      key={attempt.id}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {history?.nextCursor && (
            <div className="active-listing-actions">
              <button type="button" className="active-listing-action" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? "Loading..." : "Load more billing history"}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function marketplaceContext(snapshot: AdminModerationSnapshot, userId: string, listingId: string) {
  const user = snapshot.users.find((item) => item.id === userId);
  const listing = snapshot.listings.find((item) => item.id === listingId)
    ?? snapshot.liveListings.find((item) => item.id === listingId);
  return { userName: user?.name, userEmail: user?.email, listingTitle: listing?.title };
}
