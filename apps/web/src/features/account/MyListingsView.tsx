import { CreditCard, Download, RefreshCcw, Trash2, ShieldCheck, Receipt, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect, type CSSProperties } from "react";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
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
        const response = await api.getMyListings(page, 10, debouncedSearchQuery);
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
  }, [api, page, debouncedSearchQuery, dashboard]);

  const getStatusLabel = (listing: Listing) => {
    if (listing.status === "rejected" || listing.moderationStatus === "rejected") {
      return { label: "Rejected", color: "var(--danger)", bg: "var(--danger-soft)" };
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
        const subscription = dashboard?.listingSubscriptions.find((item) => item.id === subscriptionId);
        const paymentIntent = subscription?.source === "trial"
          ? await api.convertTrialSubscription(subscriptionId, { idempotencyKey: createIdempotencyKey("trial-convert") })
          : await api.getListingSubscriptionPaymentIntent(subscriptionId);
        if (!paymentIntent.paymentUrl) {
          alert("Checkout is not available for this pending payment. Please contact support to restart payment.");
          setPayingSubscriptionId(null);
          payAction.release();
          return;
        }
        window.location.href = paymentIntent.paymentUrl;
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
      <div className="section-heading seller-listings-heading">
        <label className="seller-listings-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="text"
            placeholder="Search listings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search your listings"
          />
        </label>
      </div>
      <TrialStatusPanel trial={dashboard?.user.trial} variant="compact" />
      <section className={`data-panel seller-listings-panel card card--surface ${isLoadingListings ? "is-loading" : ""}`}>
        {isLoadingListings && listings.length === 0 ? (
          <p className="seller-listings-state">Loading listings...</p>
        ) : listings.length === 0 ? (
          <p className="seller-listings-state">No listings found.</p>
        ) : (
          <div className="seller-listings-stack">
            {listings.map((listing) => {
              const statusInfo = getStatusLabel(listing);
              const gemTypeName = gemTypes.find((gemType) => gemType.id === listing.gemTypeId)?.name;
              const attributes = getListingAttributes(listing, gemTypeName);
              const subscription = dashboard?.listingSubscriptions.find((item) => item.listingId === listing.id);
              const plan = subscription ? subscriptionPlans.find(p => p.id === subscription.planId) : undefined;
              const payment = findListingPayment(dashboard?.recentPayments ?? [], listing.id, subscription);
              const paymentLines = payment ? paymentBreakdown(payment) : [];
              const canDownloadReceipt = Boolean(payment?.stripeInvoiceId && payment.status === "succeeded");
              const summarySpecs = compactValues([
                `${listing.attributes.carat} ct`,
                listing.attributes.color,
                listing.attributes.shape,
                listing.attributes.treatment
              ]);
              const isRejected = listing.status === "rejected" || listing.moderationStatus === "rejected";
              const hasPaidSubscriptionAccess = isSubscriptionInPaidAccess(subscription);
              const canCancelRenewal = Boolean(subscription?.source === "paid" && subscription.autoRenew && hasPaidSubscriptionAccess && !isRejected);
              const canConvertTrial = Boolean(subscription?.source === "trial" && !hasPaidSubscriptionAccess && !isRejected);
              const renewalStatus = getSubscriptionRenewalStatus(subscription);

              return (
                <article key={listing.id} className="seller-listing-card card card--surface card--compact">
                  {listing.media[0] && (
                    <img src={listing.media[0].url} alt={listing.title} className="seller-listing-image" />
                  )}
                  <div className="seller-listing-body">
                    <h3 className="seller-listing-title">{listing.title}</h3>
                    <div className="seller-listing-summary">
                      {summarySpecs.join(" · ")}
                    </div>
                    <strong className="seller-listing-price">
                      {formatLkr(listing.priceLkr)}
                    </strong>
                    <dl className="seller-listing-attributes">
                      {attributes.map((attribute) => (
                        <div key={attribute.label}>
                          <dt>{attribute.label}</dt>
                          <dd>{attribute.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="seller-listing-meta-panel">
                      <div className="seller-listing-finance-grid">
                        {subscription && plan && (
                          <div className={`seller-listing-finance-card ${canCancelRenewal ? "is-renewing" : "is-muted"}`}>
                            <div className="seller-listing-finance-title">
                              <ShieldCheck size={16} />
                              {subscription.source === "trial" ? `${plan.name} Trial Access` : `${plan.name} Subscription`}
                            </div>
                            <div className="seller-listing-finance-line">
                              Status: <span className="seller-listing-finance-value">{subscription.status.replace("_", " ")}</span>
                            </div>
                            {subscription.expiresAt && (
                              <div className="seller-listing-finance-line">
                                Valid until {formatDate(subscription.expiresAt)}
                              </div>
                            )}
                            {renewalStatus && (
                              <div className="seller-listing-finance-note is-status" style={{ "--status-foreground": renewalStatus.color } as CSSProperties}>
                                {renewalStatus.label}
                              </div>
                            )}
                          </div>
                        )}
                        {payment && (
                          <div className={`seller-listing-finance-card ${payment.status === "succeeded" ? "is-paid" : "is-pending"}`}>
                            <div className="seller-listing-finance-title">
                              <Receipt size={16} />
                              Payment details
                            </div>
                            <div className="seller-listing-finance-line">
                              Amount: <strong className="seller-listing-finance-value">{formatLkr(payment.amountLkr)}</strong> ({payment.status})
                            </div>
                            {payment.stripeInvoiceId && (
                              <div className="seller-listing-finance-line is-small">
                                Invoice: <code>{shortRef(payment.stripeInvoiceId)}</code>
                              </div>
                            )}
                            {paymentLines.length > 0 && (
                              <div className="seller-listing-finance-note">
                                {paymentLines.join(" · ")}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="seller-listing-status-row">
                        <span className="seller-listing-status" style={{ "--status-background": statusInfo.bg, "--status-foreground": statusInfo.color } as CSSProperties}>
                          {statusInfo.label}
                        </span>
                      </div>
                      {isRejected && listing.rejectionReason && (
                        <div className="seller-listing-rejection">
                          <strong>Reason:</strong> {listing.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="seller-listing-actions">
                    {subscription && (isAwaitingInitialPayment(subscription) || canConvertTrial) && (
                      <button
                        onClick={() => void handlePayNow(subscription.id)}
                        disabled={payAction.busy || payingSubscriptionId === subscription.id}
                        className="seller-listing-action-button seller-listing-pay-button"
                      >
                        <CreditCard size={16} strokeWidth={2.5} />
                        {payingSubscriptionId === subscription.id ? "Opening..." : "Pay Now"}
                      </button>
                    )}
                    {payment && canDownloadReceipt && (
                      <button
                        onClick={() => void handleDownloadReceipt(payment)}
                        disabled={downloadingPaymentId === payment.id}
                        className="seller-listing-action-button seller-listing-secondary-button"
                      >
                        <Download size={16} strokeWidth={2.5} />
                        {downloadingPaymentId === payment.id ? "Preparing..." : "Download Receipt"}
                      </button>
                    )}
                    {canCancelRenewal && subscription && (
                      <button
                        onClick={() => setConfirmCancelSubscriptionId(subscription.id)}
                        disabled={cancelAction.busy || cancellingSubscriptionId === subscription.id}
                        className="seller-listing-action-button seller-listing-secondary-button"
                      >
                        <RefreshCcw size={16} strokeWidth={2.5} />
                        {cancellingSubscriptionId === subscription.id ? "Cancelling..." : "Cancel Renewal"}
                      </button>
                    )}
                    <button 
                      onClick={() => setConfirmDeleteId(listing.id)}
                      disabled={deleteAction.busy || deletingId === listing.id}
                      className="seller-listing-action-button seller-listing-danger-button"
                    >
                      <Trash2 size={16} strokeWidth={2.5} />
                      {deletingId === listing.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          
          {listings.length > 0 && totalListings > 10 && (
            <div className="seller-listings-pagination">
              <span>
                Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, totalListings)} of {totalListings} listings
              </span>
              <div className="seller-listings-pagination-actions">
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="seller-listing-secondary-button seller-listings-page-button"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button 
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * 10 >= totalListings}
                  className="seller-listing-secondary-button seller-listings-page-button"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
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

function compactValues(values: Array<string | undefined>) {
  return values.filter(hasDisplayValue);
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

function paymentBreakdown(payment: PaymentIntent) {
  const lines = [`Base ${formatLkr(payment.quote.basePriceLkr)}`];
  if (payment.quote.extraPhotoCount > 0) {
    lines.push(`${payment.quote.extraPhotoCount} extra photo${payment.quote.extraPhotoCount === 1 ? "" : "s"} ${formatLkr(payment.quote.extraPhotoTotalLkr)}`);
  }
  return lines;
}

function shortRef(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function isSubscriptionInPaidAccess(subscription: ListingSubscriptionSummary | undefined) {
  return Boolean(
    subscription &&
    (subscription.status === "active" || subscription.status === "past_due") &&
    subscription.expiresAt &&
    new Date(subscription.expiresAt) > new Date()
  );
}

function isAwaitingInitialPayment(subscription: ListingSubscriptionSummary | undefined) {
  return Boolean(
    subscription &&
    (subscription.status === "pending_payment" || (subscription.status === "cancelled" && !subscription.startsAt && !subscription.expiresAt))
  );
}

function getSubscriptionRenewalStatus(subscription: ListingSubscriptionSummary | undefined) {
  if (!subscription) return undefined;

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
