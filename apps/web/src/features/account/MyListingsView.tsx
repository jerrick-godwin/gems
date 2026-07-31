import { CircleAlert, CreditCard, Download, RefreshCcw, Trash2, ShieldCheck, Search, ChevronRight, LoaderCircle } from "lucide-react";
import { useState, useEffect, useMemo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { GemsApiClient } from "@gems/api-client";
import { formatLkr, type GemType, type Listing, type ListingSubscription, type ListingSubscriptionSummary, type PaymentIntent, type Treatment, type UserDashboard, type ListingSubscriptionPlan } from "@gems/schemas";
import { createIdempotencyKey, useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { publicErrorMessage } from "../../shared/helpers";
import { TrialStatusPanel } from "./TrialStatusPanel";

export function MyListingsView({
  dashboard,
  gemTypes,
  subscriptionPlans,
  api,
  onDashboardChange
}: {
  dashboard: UserDashboard | null;
  gemTypes: GemType[];
  subscriptionPlans: ListingSubscriptionPlan[];
  api: GemsApiClient;
  onDashboardChange: (dashboard: UserDashboard) => void;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [totalListings, setTotalListings] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterGemType, setFilterGemType] = useState("");
  const [isLoadingListings, setIsLoadingListings] = useState(true);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingSubscriptionId, setCancellingSubscriptionId] = useState<string | null>(null);
  const [payingSubscriptionId, setPayingSubscriptionId] = useState<string | null>(null);
  const [downloadingPaymentId, setDownloadingPaymentId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmCancelSubscriptionId, setConfirmCancelSubscriptionId] = useState<string | null>(null);
  const cancelAction = useSingleFlightAction();
  const payAction = useSingleFlightAction();
  const deleteAction = useSingleFlightAction();
  const gemTypeNameById = useMemo(() => new Map(gemTypes.map((gemType) => [gemType.id, gemType.name])), [gemTypes]);
  const planById = useMemo(() => new Map(subscriptionPlans.map((plan) => [plan.id, plan])), [subscriptionPlans]);
  const subscriptionByListingId = useMemo(
    () => new Map((dashboard?.listingSubscriptions ?? []).map((subscription) => [subscription.listingId, subscription])),
    [dashboard?.listingSubscriptions]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    const fetchListings = async () => {
      setIsLoadingListings(true);
      try {
        const response = await api.getMyListings(page, limit, debouncedSearchQuery, filterStatus || undefined, filterGemType || undefined);
        if (active) {
          if (response.items.length === 0 && page > 1) {
            setPage(page - 1);
          } else {
            setListings(response.items);
            setTotalListings(response.total);
          }
        }
      } catch (error) {
        console.error("Failed to fetch listings:", error);
      } finally {
        if (active) setIsLoadingListings(false);
      }
    };
    fetchListings();
    return () => { active = false; };
  }, [api, page, limit, debouncedSearchQuery, filterStatus, filterGemType, dashboard]);

  const getStatusLabel = (listing: Listing, subscription: ListingSubscription | undefined) => {
    if (listing.status === "rejected" || listing.moderationStatus === "rejected") {
      return { label: "Rejected", color: "var(--danger)", bg: "var(--danger-soft)" };
    }
    if (subscription?.paymentStatus === "failed") {
      return { label: "Payment Failed", color: "var(--danger)", bg: "var(--danger-soft)" };
    }
    if (subscription?.paymentStatus === "pending") {
      return { label: "Payment Pending", color: "var(--gold)", bg: "rgba(251,191,36,0.15)" };
    }
    if (subscription?.paymentStatus === "required") {
      return { label: "Payment Required", color: "var(--danger)", bg: "var(--danger-soft)" };
    }
    if (listing.moderationStatus === "approved") {
      return { label: "Approved", color: "var(--success)", bg: "var(--success-soft)" };
    }
    if (listing.moderationStatus === "queued" || listing.moderationStatus === "needs_changes" || listing.status === "pending_review") {
      return { label: "Review in Progress", color: "var(--gold)", bg: "rgba(251,191,36,0.15)" };
    }
    if (listing.status === "expired") {
      return { label: "Closed", color: "var(--sage)", bg: "var(--line-subtle)" };
    }
    return { label: listing.status.replace("_", " "), color: "var(--ink)", bg: "var(--line-subtle)" };
  };

  const handleCancelRenewal = async (subscriptionId: string) => {
    await cancelAction.run(async () => {
      try {
        setCancellingSubscriptionId(subscriptionId);
        await api.cancelListingSubscription(subscriptionId);
        onDashboardChange(await api.dashboard());
      } catch (error) {
        alert(`Failed to cancel renewal: ${publicErrorMessage(error, "Unknown error")}`);
      } finally {
        setCancellingSubscriptionId(null);
        setConfirmCancelSubscriptionId(null);
      }
    });
  };

  const handlePayNow = async (subscriptionId: string) => {
    await payAction.run(async () => {
      try {
        setPayingSubscriptionId(subscriptionId);
        const recovery = await api.startListingSubscriptionPayment(subscriptionId, { idempotencyKey: createIdempotencyKey("listing-payment") });
        window.location.href = recovery.checkoutUrl;
      } catch (error) {
        alert(`Failed to open checkout: ${publicErrorMessage(error, "Unknown error")}`);
        setPayingSubscriptionId(null);
        payAction.release();
      }
    }, { keepLocked: true });
  };

  const handleDownloadReceipt = async (payment: PaymentIntent) => {
    try {
      setDownloadingPaymentId(payment.id);
      const receiptFile = await api.downloadPaymentReceipt(payment.id);
      const url = URL.createObjectURL(receiptFile.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = receiptFile.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      alert(`Failed to download receipt: ${publicErrorMessage(error, "Unknown error")}`);
    } finally {
      setDownloadingPaymentId(null);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteAction.run(async () => {
      try {
        setDeletingId(id);
        await api.removeMyListing(id);
        const newDashboard = await api.dashboard();
        onDashboardChange(newDashboard);
      } catch (error) {
        alert(`Failed to delete listing: ${publicErrorMessage(error, "Unknown error")}`);
      } finally {
        setDeletingId(null);
        setConfirmDeleteId(null);
      }
    });
  };

  const confirmDeleteListing = confirmDeleteId ? listings.find((listing) => listing.id === confirmDeleteId) : undefined;
  const confirmDeleteSubscription = confirmDeleteListing ? dashboard?.listingSubscriptions.find((item) => item.listingId === confirmDeleteListing.id) : undefined;
  const confirmDeleteRemovesAtExpiry = isSubscriptionInPaidAccess(confirmDeleteSubscription);



  return (
    <section className="dashboard">
      <div className="section-heading seller-listings-heading" style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <label className="seller-listings-search" style={{ flex: 1, minWidth: "200px" }}>
          <Search size={18} aria-hidden="true" />
          <input
            type="text"
            placeholder="Search listings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search your listings"
          />
        </label>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="seller-listing-secondary-button"
          aria-label="Filter by status"
          style={{ padding: "0.5rem", borderRadius: "8px" }}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_review">Pending Review</option>
          <option value="live">Live</option>
          <option value="paused">Paused</option>
          <option value="rejected">Rejected</option>
          <option value="expired">Closed</option>
        </select>
        <select
          value={filterGemType}
          onChange={(e) => { setFilterGemType(e.target.value); setPage(1); }}
          className="seller-listing-secondary-button"
          aria-label="Filter by gem type"
          style={{ padding: "0.5rem", borderRadius: "8px" }}
        >
          <option value="">All Types</option>
          {gemTypes.map(gt => <option key={gt.id} value={gt.id}>{gt.name}</option>)}
        </select>
      </div>
      <TrialStatusPanel trial={dashboard?.user.trial} variant="compact" />
      <section className={`data-panel seller-listings-panel card card--surface ${isLoadingListings ? "is-loading" : ""}`}>
        {isLoadingListings && listings.length === 0 ? (
          <div className="seller-listings-state loading-state">
            <LoaderCircle className="icon-spinner" size={24} />
            <p>Loading listings...</p>
          </div>
        ) : listings.length === 0 ? (
          <p className="seller-listings-state">No listings found.</p>
        ) : (
          <div className="seller-listings-stack">
            {listings.map((listing) => {
              const gemTypeName = gemTypeNameById.get(listing.gemTypeId);
              const attributes = getListingAttributes(listing, gemTypeName);
              const subscription = subscriptionByListingId.get(listing.id);
              const statusInfo = getStatusLabel(listing, subscription);
              const plan = subscription ? planById.get(subscription.planId) : undefined;
              const payment = findListingPayment(dashboard?.recentPayments ?? [], listing.id, subscription);
              const canDownloadReceipt = Boolean(payment?.stripeInvoiceId && payment.status === "succeeded");
              const isRejected = listing.status === "rejected" || listing.moderationStatus === "rejected";
              const hasPaidSubscriptionAccess = isSubscriptionInPaidAccess(subscription);
              const canCancelRenewal = Boolean(subscription?.source === "paid" && subscription.autoRenew && hasPaidSubscriptionAccess && !isRejected);
              const canRecoverPayment = Boolean(
                subscription
                && !isRejected
                && subscription.paymentStatus !== "paid"
                && ((subscription.source === "trial" && !hasPaidSubscriptionAccess) || ["pending_payment", "past_due", "cancelled", "expired"].includes(subscription.status))
              );
              const renewalStatus = getSubscriptionRenewalStatus(subscription, isRejected);
              const hasMedia = Boolean(listing.media[0]);
              const needsAttention = isRejected || subscription?.paymentStatus === "failed" || subscription?.paymentStatus === "required";

              return (
                <article key={listing.id} className={`seller-listing-card card card--surface card--compact ${hasMedia ? "has-media" : "no-media"}${needsAttention ? " is-attention" : ""}`}>
                  {hasMedia && listing.media[0] ? (
                    <div className="seller-listing-image-wrapper">
                      <img src={listing.media[0].url} alt={listing.title} className="seller-listing-image" loading="lazy" decoding="async" />
                    </div>
                  ) : null}
                  <div className="seller-listing-body">
                      <div className="seller-listing-header">
                        <h3 className="seller-listing-title">{listing.title}</h3>
                        <strong className="seller-listing-price">{formatLkr(listing.priceLkr)}</strong>
                      </div>
                      <div className="seller-listing-summary">
                        <span className="seller-listing-status" style={{ "--status-background": statusInfo.bg, "--status-foreground": statusInfo.color } as CSSProperties}>
                          {statusInfo.label}
                        </span>
                        {(isRejected ? listing.updatedAt : listing.createdAt) && (
                          <span className="seller-listing-posted-date">
                            {isRejected ? "Rejected Date" : "Posted"}: {formatDate(isRejected ? (listing.updatedAt || "") : (listing.createdAt || ""))}
                          </span>
                        )}
                      </div>
                    </div>
                  
                  <div className="seller-listing-finance-row">
                    {subscription && plan && (
                      <div className={`seller-listing-finance-pill ${canCancelRenewal ? "is-renewing" : "is-muted"}`}>
                        <ShieldCheck size={14} />
                        <span>{subscription.source === "trial" ? `${plan.name} Trial` : plan.name}</span>
                        {renewalStatus && (
                          <span className="seller-listing-finance-status" style={{ color: renewalStatus.color }}>
                            · {renewalStatus.label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <details className="seller-listing-details-panel">
                    <summary>
                      <ChevronRight size={16} className="seller-listing-details-icon" />
                      View Details
                    </summary>
                    <dl className="seller-listing-attributes">
                      {(isRejected ? listing.updatedAt : listing.createdAt) && (
                        <div>
                          <dt>{isRejected ? "Rejected Date" : "Posted Date"}</dt>
                          <dd>{formatDate(isRejected ? (listing.updatedAt || "") : (listing.createdAt || ""))}</dd>
                        </div>
                      )}
                      {attributes.map((attribute) => (
                        <div key={attribute.label}>
                          <dt>{attribute.label}</dt>
                          <dd>{attribute.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                  {isRejected && listing.rejectionReason && (
                    <div className="seller-listing-rejection">
                      <CircleAlert size={17} aria-hidden="true" />
                      <div>
                        <strong>Why this listing was rejected</strong>
                        <span>{listing.rejectionReason}</span>
                      </div>
                    </div>
                  )}
                  <div className="seller-listing-footer">
                    <div className="seller-listing-actions-row">
                      {subscription && canRecoverPayment && (
                        <button
                          type="button"
                          onClick={() => void handlePayNow(subscription.id)}
                          disabled={payAction.busy || payingSubscriptionId === subscription.id}
                          className="seller-listing-action-button seller-listing-pay-button"
                        >
                          {payingSubscriptionId === subscription.id ? <LoaderCircle className="icon-spinner" size={14} strokeWidth={2.5} /> : <CreditCard size={14} strokeWidth={2.5} />}
                          <span>{payingSubscriptionId === subscription.id ? "Opening..." : "Pay Now"}</span>
                        </button>
                      )}
                      {payment && canDownloadReceipt && (
                        <button
                          type="button"
                          onClick={() => void handleDownloadReceipt(payment)}
                          disabled={downloadingPaymentId === payment.id}
                          className="seller-listing-action-button seller-listing-ghost-button"
                        >
                          {downloadingPaymentId === payment.id ? <LoaderCircle className="icon-spinner" size={16} strokeWidth={2.5} /> : <Download size={16} strokeWidth={2.5} />}
                          <span>{downloadingPaymentId === payment.id ? "Preparing..." : "Download Receipt"}</span>
                        </button>
                      )}
                      {canCancelRenewal && subscription && (
                        <button
                          type="button"
                          onClick={() => setConfirmCancelSubscriptionId(subscription.id)}
                          disabled={cancelAction.busy || cancellingSubscriptionId === subscription.id}
                          className="seller-listing-action-button seller-listing-ghost-button"
                        >
                          {cancellingSubscriptionId === subscription.id ? <LoaderCircle className="icon-spinner" size={16} strokeWidth={2.5} /> : <RefreshCcw size={16} strokeWidth={2.5} />}
                          <span>{cancellingSubscriptionId === subscription.id ? "Cancelling..." : "Cancel Renewal"}</span>
                        </button>
                      )}
                      <button 
                        type="button"
                        onClick={() => setConfirmDeleteId(listing.id)}
                        disabled={deleteAction.busy || deletingId === listing.id}
                        className="seller-listing-action-button seller-listing-ghost-danger-button"
                      >
                        {deletingId === listing.id ? <LoaderCircle className="icon-spinner" size={16} strokeWidth={2.5} /> : <Trash2 size={16} strokeWidth={2.5} />}
                        <span>{deletingId === listing.id ? "Deleting..." : "Delete"}</span>
                      </button>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>
          )}
          
          {listings.length > 0 && totalListings > limit && (
            <footer className="listing-results-footer">
              <div className="pagination">
                <a
                  className="pagination-btn"
                  aria-disabled={page <= 1}
                  href="#"
                  onClick={(event) => { event.preventDefault(); if (page > 1) setPage(page - 1); }}
                >
                  Previous
                </a>
                <span className="pagination-info">Page {page} of {Math.ceil(totalListings / limit)}</span>
                <a
                  className="pagination-btn"
                  aria-disabled={page >= Math.ceil(totalListings / limit)}
                  href="#"
                  onClick={(event) => { event.preventDefault(); if (page < Math.ceil(totalListings / limit)) setPage(page + 1); }}
                >
                  Next
                </a>
              </div>
              <label className="listing-page-size">
                Items per page
                <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} id="items-per-page">
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
            </footer>
          )}
        </section>

      {confirmDeleteId && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="delete-listing-title">
            <h3 id="delete-listing-title" className="confirmation-dialog-title tone-danger">
              <Trash2 size={20} /> Delete Listing
            </h3>
            <p className="confirmation-dialog-copy">
              {confirmDeleteRemovesAtExpiry && confirmDeleteSubscription?.expiresAt ? (
                <>
                  This listing has active access. Deleting it will cancel renewal when applicable, keep the current access, and remove the listing on <strong>{formatDate(confirmDeleteSubscription.expiresAt)}</strong>.
                </>
              ) : (
                <>
                  Are you sure you want to delete this listing? This action <strong>cannot be undone</strong> and the data cannot be recovered.
                </>
              )}
            </p>
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="confirmation-dialog-button"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete(confirmDeleteId)}
                disabled={deleteAction.busy || deletingId !== null}
                className="confirmation-dialog-button tone-danger"
              >
                {deletingId === confirmDeleteId ? <LoaderCircle className="icon-spinner" size={16} strokeWidth={2.5} /> : null}
                {deletingId === confirmDeleteId ? "Processing..." : confirmDeleteRemovesAtExpiry ? "Cancel Renewal" : "Proceed to Delete"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmCancelSubscriptionId && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="cancel-renewal-title">
            <h3 id="cancel-renewal-title" className="confirmation-dialog-title tone-warning">
              <RefreshCcw size={20} /> Cancel Renewal
            </h3>
            <p className="confirmation-dialog-copy">
              Are you sure you want to cancel auto-renewal for this listing subscription? The listing keeps its current paid access, but it will not renew automatically.
            </p>
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => setConfirmCancelSubscriptionId(null)}
                className="confirmation-dialog-button"
              >
                Keep Renewal
              </button>
              <button
                onClick={() => void handleCancelRenewal(confirmCancelSubscriptionId)}
                disabled={cancelAction.busy || cancellingSubscriptionId !== null}
                className="confirmation-dialog-button tone-danger"
              >
                {cancellingSubscriptionId === confirmCancelSubscriptionId ? <LoaderCircle className="icon-spinner" size={16} strokeWidth={2.5} /> : null}
                {cancellingSubscriptionId === confirmCancelSubscriptionId ? "Cancelling..." : "Proceed to Cancel"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

function getListingAttributes(listing: Listing, gemTypeName?: string) {
  const attributes: Array<[string, string | undefined]> = [
    ["Gem type", gemTypeName ?? listing.gemTypeId],
    ["Location", listing.location],
    ["Carat", `${listing.attributes.carat} ct`],
    ["Dimensions", listing.attributes.dimensions],
    ["Shape", listing.attributes.shape],
    ["Cut", listing.attributes.cut],
    ["Color", listing.attributes.color],
    ["Clarity", listing.attributes.clarity],
    ["Origin", listing.attributes.origin],
    ["Treatment", formatTreatment(listing.attributes.treatment)]
  ];

  return attributes.filter(isDisplayAttribute).map(([label, value]) => ({
    label,
    value
  }));
}

function isDisplayAttribute(attribute: [string, string | undefined]): attribute is [string, string] {
  return hasDisplayValue(attribute[1]);
}

function hasDisplayValue(value: string | undefined): value is string {
  return Boolean(value?.replace(/[\s\u200B-\u200D\uFEFF]/g, ""));
}

function formatTreatment(treatment: Treatment) {
  return treatment.charAt(0).toUpperCase() + treatment.slice(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
}

function findListingPayment(payments: PaymentIntent[], listingId: string, subscription: ListingSubscription | undefined) {
  const candidates = payments.filter((payment) => payment.listingId === listingId);
  return candidates.find((payment) => payment.id === subscription?.paymentIntentId) ?? candidates[0];
}

function isSubscriptionInPaidAccess(subscription: ListingSubscriptionSummary | undefined) {
  return Boolean(
    subscription &&
    (subscription.status === "active" || subscription.status === "past_due") &&
    subscription.expiresAt &&
    new Date(subscription.expiresAt) > new Date()
  );
}

function getSubscriptionRenewalStatus(subscription: ListingSubscriptionSummary | undefined, isRejected?: boolean) {
  if (!subscription) return undefined;

  if (isRejected) {
    return { label: "Subscription cancelled", color: "var(--danger)" };
  }

  // Payment state is shown by the primary badge; the plan pill describes access.
  if (subscription.paymentStatus !== "paid") {
    return { label: "Suspended", color: "var(--danger)" };
  }

  if (subscription.source === "trial") {
    const activeAccess = Boolean(subscription.expiresAt && new Date(subscription.expiresAt) > new Date() && (subscription.status === "active" || subscription.status === "past_due"));
    if (activeAccess) {
      return { label: "Free trial access", color: "var(--emerald)" };
    }
    if (subscription.status === "expired") {
      return { label: "Trial expired", color: "var(--muted)" };
    }
    return { label: "Trial ended", color: "var(--danger)" };
  }

  if (subscription.status === "pending_payment") {
    return { label: "Payment required", color: "var(--gold)" };
  }

  if (subscription.status === "active" || subscription.status === "past_due") {
    return subscription.autoRenew
      ? { label: "Auto-renew active", color: "var(--emerald)" }
      : { label: "Auto-renew off", color: "var(--muted)" };
  }

  if (subscription.status === "expired") {
    return { label: "Subscription expired", color: "var(--muted)" };
  }

  return { label: "Subscription cancelled", color: "var(--danger)" };
}
