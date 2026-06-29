import { CreditCard, Download, RefreshCcw, Trash2, ShieldCheck, Receipt, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { GemsApiClient } from "@gems/api-client";
import { formatLkr, type GemType, type Listing, type ListingSubscription, type ListingSubscriptionSummary, type PaymentIntent, type Treatment, type UserDashboard, type ListingSubscriptionPlan } from "@gems/schemas";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { publicErrorMessage } from "../../shared/helpers";

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
        const paymentIntent = await api.getListingSubscriptionPaymentIntent(subscriptionId);
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
      <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>My Listings</h1>
          <p>Manage your submitted listings and view their approval status.</p>
        </div>
        <div style={{ position: "relative", width: 280, marginTop: 4 }}>
          <Search size={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--sage)" }} />
          <input
            type="text"
            placeholder="Search listings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              width: "100%", padding: "10px 12px 10px 38px", 
              borderRadius: "8px", border: "1px solid var(--line)", 
              backgroundColor: "var(--surface)", color: "var(--ink)", outline: "none",
              fontSize: 14
            }}
          />
        </div>
      </div>
      <section className="data-panel" style={{ opacity: isLoadingListings ? 0.6 : 1, transition: "opacity 0.2s" }}>
        {isLoadingListings && listings.length === 0 ? (
          <p style={{ color: "var(--sage)", fontWeight: 600 }}>Loading listings...</p>
        ) : listings.length === 0 ? (
          <p style={{ color: "var(--sage)", fontWeight: 600 }}>No listings found.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
              const canCancelRenewal = Boolean(subscription?.autoRenew && hasPaidSubscriptionAccess && !isRejected);
              const renewalStatus = getSubscriptionRenewalStatus(subscription);

              return (
                <div key={listing.id} className="seller-listing-card">
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
                              <ShieldCheck size={16} style={{ color: canCancelRenewal ? 'var(--emerald)' : 'var(--muted)' }} />
                              {plan.name} Subscription
                            </div>
                            <div className="seller-listing-finance-line">
                              Status: <span style={{ textTransform: 'capitalize', fontWeight: 600, color: 'var(--ink)' }}>{subscription.status.replace("_", " ")}</span>
                            </div>
                            {subscription.expiresAt && (
                              <div className="seller-listing-finance-line">
                                Valid until {formatDate(subscription.expiresAt)}
                              </div>
                            )}
                            {renewalStatus && (
                              <div className="seller-listing-finance-note" style={{ color: renewalStatus.color }}>
                                {renewalStatus.label}
                              </div>
                            )}
                          </div>
                        )}
                        {payment && (
                          <div className={`seller-listing-finance-card ${payment.status === "succeeded" ? "is-paid" : "is-pending"}`}>
                            <div className="seller-listing-finance-title">
                              <Receipt size={16} style={{ color: 'var(--muted)' }} />
                              Payment details
                            </div>
                            <div className="seller-listing-finance-line">
                              Amount: <strong style={{ color: 'var(--ink)' }}>{formatLkr(payment.amountLkr)}</strong> ({payment.status})
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
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 8px", borderRadius: 12, backgroundColor: statusInfo.bg, color: statusInfo.color }}>
                          {statusInfo.label}
                        </span>
                      </div>
                      {isRejected && listing.rejectionReason && (
                        <div style={{ fontSize: 13, color: "var(--danger)", padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(248,113,113,0.2)" }}>
                          <strong>Reason:</strong> {listing.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="seller-listing-actions">
                    {subscription && isAwaitingInitialPayment(subscription) && (
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
                  </div>
                );
              })}
            </div>
          )}
          
          {listings.length > 0 && totalListings > 10 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line-subtle)" }}>
              <span style={{ fontSize: 14, color: "var(--sage)", fontWeight: 500 }}>
                Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, totalListings)} of {totalListings} listings
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="seller-listing-secondary-button"
                  style={{ display: "flex", alignItems: "center", gap: 4, opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? "not-allowed" : "pointer" }}
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button 
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * 10 >= totalListings}
                  className="seller-listing-secondary-button"
                  style={{ display: "flex", alignItems: "center", gap: 4, opacity: page * 10 >= totalListings ? 0.5 : 1, cursor: page * 10 >= totalListings ? "not-allowed" : "pointer" }}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </section>

      {confirmDeleteId && createPortal(
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "var(--panel)", padding: 24, borderRadius: "var(--radius)", width: 400, maxWidth: "90vw", boxShadow: "var(--shadow-xl)", border: "1px solid var(--line)" }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
              <Trash2 size={20} className="text-danger" style={{ color: "var(--danger)" }} /> Delete Listing
            </h3>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24, lineHeight: 1.5 }}>
              {confirmDeleteRemovesAtExpiry && confirmDeleteSubscription?.expiresAt ? (
                <>
                  This listing has an active subscription. Deleting it will cancel renewal now, keep the current paid access, and remove the listing on <strong>{formatDate(confirmDeleteSubscription.expiresAt)}</strong>.
                </>
              ) : (
                <>
                  Are you sure you want to delete this listing? This action <strong>cannot be undone</strong> and the data cannot be recovered.
                </>
              )}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                onClick={() => setConfirmDeleteId(null)}
                style={{ padding: "8px 16px", background: "var(--soft)", color: "var(--ink)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete(confirmDeleteId)}
                disabled={deleteAction.busy || deletingId !== null}
                style={{ padding: "8px 16px", background: "var(--danger-soft)", color: "var(--danger)", border: "none", borderRadius: "var(--radius-sm)", cursor: deleteAction.busy || deletingId !== null ? "not-allowed" : "pointer", fontWeight: 600 }}
              >
                {deletingId === confirmDeleteId ? "Processing..." : confirmDeleteRemovesAtExpiry ? "Cancel Renewal" : "Proceed to Delete"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmCancelSubscriptionId && createPortal(
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "var(--panel)", padding: 24, borderRadius: "var(--radius)", width: 400, maxWidth: "90vw", boxShadow: "var(--shadow-xl)", border: "1px solid var(--line)" }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
              <RefreshCcw size={20} style={{ color: "var(--gold)" }} /> Cancel Renewal
            </h3>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24, lineHeight: 1.5 }}>
              Are you sure you want to cancel auto-renewal for this listing subscription? The listing keeps its current paid access, but it will not renew automatically.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                onClick={() => setConfirmCancelSubscriptionId(null)}
                style={{ padding: "8px 16px", background: "var(--soft)", color: "var(--ink)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 500 }}
              >
                Keep Renewal
              </button>
              <button
                onClick={() => void handleCancelRenewal(confirmCancelSubscriptionId)}
                disabled={cancelAction.busy || cancellingSubscriptionId !== null}
                style={{ padding: "8px 16px", background: "var(--danger-soft)", color: "var(--danger)", border: "none", borderRadius: "var(--radius-sm)", cursor: cancelAction.busy || cancellingSubscriptionId !== null ? "not-allowed" : "pointer", fontWeight: 600 }}
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
