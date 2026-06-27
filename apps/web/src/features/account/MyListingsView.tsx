import { CreditCard, RefreshCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { GemsApiClient } from "@gems/api-client";
import { formatLkr, getListingSubscriptionPlan, type GemType, type Listing, type ListingSubscriptionSummary, type Treatment, type UserDashboard } from "@gems/schemas";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";

export function MyListingsView({
  dashboard,
  gemTypes,
  api,
  onDashboardChange
}: {
  dashboard: UserDashboard | null;
  gemTypes: GemType[];
  api: GemsApiClient;
  onDashboardChange: (dashboard: UserDashboard) => void;
}) {
  const listings = dashboard?.sellerListings ?? [];
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingSubscriptionId, setCancellingSubscriptionId] = useState<string | null>(null);
  const [payingSubscriptionId, setPayingSubscriptionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmCancelSubscriptionId, setConfirmCancelSubscriptionId] = useState<string | null>(null);
  const cancelAction = useSingleFlightAction();
  const payAction = useSingleFlightAction();
  const deleteAction = useSingleFlightAction();

  const getStatusLabel = (listing: Listing) => {
    if (listing.status === "rejected" || listing.moderationStatus === "rejected") {
      return { label: "Rejected", color: "var(--danger)", bg: "var(--danger-soft)" };
    }
    if (listing.moderationStatus === "approved") {
      return { label: "Approved", color: "var(--emerald)", bg: "var(--emerald-soft)" };
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
        alert("Failed to cancel renewal: " + (error instanceof Error ? error.message : "Unknown error"));
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
        alert("Failed to open checkout: " + (error instanceof Error ? error.message : "Unknown error"));
        setPayingSubscriptionId(null);
        payAction.release();
      }
    }, { keepLocked: true });
  };

  const handleDelete = async (id: string) => {
    const subscription = dashboard?.listingSubscriptions.find((item) => item.listingId === id);
    const willRemoveAtExpiry = isSubscriptionInPaidAccess(subscription);
    await deleteAction.run(async () => {
      try {
        setDeletingId(id);
        await api.removeMyListing(id);
        const newDashboard = await api.dashboard();
        onDashboardChange(newDashboard);
        if (willRemoveAtExpiry && subscription?.expiresAt) {
          alert(`Renewal has been cancelled. This listing will be removed on ${formatDate(subscription.expiresAt)}.`);
        }
      } catch (error) {
        alert("Failed to delete listing: " + (error instanceof Error ? error.message : "Unknown error"));
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
      <div className="section-heading">
        <h1>My Listings</h1>
        <p>Manage your submitted listings and view their approval status.</p>
      </div>
      <section className="data-panel">
        {listings.length === 0 ? (
          <p style={{ color: "var(--sage)", fontWeight: 600 }}>No listings found.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {listings.map((listing) => {
              const statusInfo = getStatusLabel(listing);
              const gemTypeName = gemTypes.find((gemType) => gemType.id === listing.gemTypeId)?.name;
              const attributes = getListingAttributes(listing, gemTypeName);
              const subscription = dashboard?.listingSubscriptions.find((item) => item.listingId === listing.id);
              const plan = subscription ? getListingSubscriptionPlan(subscription.planId) : undefined;
              return (
                <div key={listing.id} className="cart-item-card" style={{ display: 'flex', gap: 16, padding: 16, border: '1px solid var(--line)', borderRadius: 'var(--radius)', background: 'var(--panel-strong)' }}>
                  {listing.media[0] && (
                    <img src={listing.media[0].url} alt={listing.title} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <h3 style={{ margin: 0, fontSize: 18, color: 'var(--ink)' }}>{listing.title}</h3>
                    <div style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>
                      {listing.attributes.carat} ct · {listing.attributes.color} · {listing.attributes.shape} · {listing.attributes.treatment}
                    </div>
                    <strong style={{ fontSize: 16, color: 'var(--emerald)' }}>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                      {subscription && plan && (
                        <div style={{ fontSize: 13, color: "var(--muted)", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--line)" }}>
                          <strong>{plan.name} subscription:</strong> {subscription.status.replace("_", " ")}
                          {subscription.expiresAt ? ` · valid until ${formatDate(subscription.expiresAt)}` : ""}
                          {subscription.autoRenew
                            ? " · auto-renew on"
                            : subscription.expiresAt && isSubscriptionInPaidAccess(subscription)
                              ? ` · will be removed on ${formatDate(subscription.expiresAt)}`
                              : " · auto-renew cancelled"}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 8px", borderRadius: 12, backgroundColor: statusInfo.bg, color: statusInfo.color }}>
                          {statusInfo.label}
                        </span>
                      </div>
                      {(listing.status === "rejected" || listing.moderationStatus === "rejected") && listing.rejectionReason && (
                        <div style={{ fontSize: 13, color: "var(--danger)", padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(248,113,113,0.2)" }}>
                          <strong>Reason:</strong> {listing.rejectionReason}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                    {subscription && isAwaitingInitialPayment(subscription) && (
                      <button
                        onClick={() => void handlePayNow(subscription.id)}
                        disabled={payAction.busy || payingSubscriptionId === subscription.id}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px", borderRadius: "var(--radius)", background: "var(--emerald)", color: "var(--bg)", border: "none", cursor: payAction.busy || payingSubscriptionId === subscription.id ? "not-allowed" : "pointer", fontWeight: 600 }}
                      >
                        <CreditCard size={16} strokeWidth={2.5} />
                        {payingSubscriptionId === subscription.id ? "Opening..." : "Pay Now"}
                      </button>
                    )}
                    {subscription?.autoRenew && (
                      <button
                        onClick={() => setConfirmCancelSubscriptionId(subscription.id)}
                        disabled={cancelAction.busy || cancellingSubscriptionId === subscription.id}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px", borderRadius: "var(--radius)", background: "var(--soft)", color: "var(--ink)", border: "1px solid var(--line)", cursor: cancelAction.busy || cancellingSubscriptionId === subscription.id ? "not-allowed" : "pointer", fontWeight: 600 }}
                      >
                        <RefreshCcw size={16} strokeWidth={2.5} />
                        {cancellingSubscriptionId === subscription.id ? "Cancelling..." : "Cancel Renewal"}
                      </button>
                    )}
                    <button 
                      onClick={() => setConfirmDeleteId(listing.id)}
                      disabled={deleteAction.busy || deletingId === listing.id}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 16px", borderRadius: "var(--radius)", background: "var(--danger)", color: "#fff", border: "none", cursor: deleteAction.busy || deletingId === listing.id ? "not-allowed" : "pointer", fontWeight: 600 }}
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
  const attributes = [
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

  return attributes.map(([label, value]) => ({
    label,
    value
  }));
}

function formatTreatment(treatment: Treatment) {
  return treatment.charAt(0).toUpperCase() + treatment.slice(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
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
