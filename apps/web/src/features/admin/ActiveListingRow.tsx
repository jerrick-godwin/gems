import { ChevronDown, ChevronUp, ReceiptText, Star, Trash, Pause, Play, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { GemsAdminApiClient } from "@gems/api-client";
import { formatLkr, type Listing, type ListingMedia, type PaymentIntent, type SellerProfile, type User } from "@gems/schemas";
import { publicErrorMessage } from "../../shared/helpers";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { AdminMediaPreview } from "./AdminMediaPreview";
import { CampaignDialog } from "./CampaignDialog";

export function ActiveListingRow({ 
  listing, 
  api, 
  token,
  payments,
  sellers,
  users,
  onUpdate
}: { 
  listing: Listing; 
  api: GemsAdminApiClient; 
  token: string;
  payments: PaymentIntent[];
  sellers: SellerProfile[];
  users: User[];
  onUpdate: (listing: Listing) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const removeAction = useSingleFlightAction();

  const handleRemove = async () => {
    await removeAction.run(async () => {
      setBusy(true);
      try {
        const archived = await api.removeListing(token, listing.id);
        setShowRemoveConfirm(false);
        onUpdate(archived);
      } catch (error) {
        alert("Failed to remove listing");
        setBusy(false);
      }
    });
  };

  const handleTogglePause = async () => {
    const newStatus = listing.status === "paused" ? "live" : "paused";
    setBusy(true);
    try {
      const updated = await api.updateListingStatus(token, listing.id, newStatus);
      setShowPauseConfirm(false);
      onUpdate(updated);
    } catch (error) {
      alert(`Failed to ${listing.status === "paused" ? "resume" : "pause"} listing`);
    } finally {
      setBusy(false);
    }
  };

  const handleViewReceipt = async () => {
    if (!receiptPayment) return;
    setReceiptBusy(true);
    setReceiptError("");

    try {
      const receiptFile = await api.downloadPaymentReceipt(token, receiptPayment.id);
      const url = URL.createObjectURL(receiptFile.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = receiptFile.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setReceiptError(publicErrorMessage(error, "Unable to load receipt"));
    } finally {
      setReceiptBusy(false);
    }
  };

  const seller = sellers.find((item) => item.id === listing.sellerId);
  const sellerUser = seller ? users.find((item) => item.id === seller.userId) : undefined;
  const payment = latestPaymentForListing(payments, listing.id);
  const receiptPayment = latestReceiptPaymentForListing(payments, listing.id);
  const photos = listing.media.filter((media) => media.kind !== "certificate");
  const certificates = listing.media.filter((media) => media.kind === "certificate");
  const hasActiveCampaign = (listing.campaigns || []).some((campaign) => campaign.status === "active" && new Date(campaign.endsAt) > new Date());
  const canViewReceipt = Boolean(receiptPayment);

  return (
    <>
      <div className="active-listing-row">
        <div className="active-listing-summary">
          <AdminMediaPreview media={photos[0]} alt={listing.title} />
          <div className="active-listing-title-block">
            <strong>{listing.title}</strong>
            <span>
              {listing.attributes.carat} ct · {formatLkr(listing.priceLkr)} · {listing.location}
            </span>
            <div className="active-listing-badges">
              <span className="active-listing-pill">{listing.status.replace("_", " ")}</span>
              {listing.attributes.certificateStatus !== "none" && <span className="active-listing-pill">{listing.attributes.certificateStatus.replace("_", " ")}</span>}
              {hasActiveCampaign && <span className="active-listing-pill promoted">Promoted</span>}
            </div>
          </div>
          <div className="active-listing-actions">
            <button type="button" className="active-listing-action" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {expanded ? "Hide Details" : "View Details"}
            </button>
            {listing.status !== "rejected" && listing.status !== "expired" && (
              <>
                <button type="button" className="active-listing-action" disabled={removeAction.busy || busy} onClick={() => setShowCampaigns(true)}>
                  <Star size={16} /> Promotions
                </button>
                <button
                  type="button"
                  className="active-listing-action"
                  disabled={busy || removeAction.busy}
                  onClick={() => setShowPauseConfirm(true)}
                >
                  {listing.status === "paused" ? <Play size={16} /> : <Pause size={16} />}
                  {listing.status === "paused" ? "Resume" : "Pause"}
                </button>
              </>
            )}
            <button type="button" className="active-listing-action danger" disabled={removeAction.busy || busy} onClick={() => setShowRemoveConfirm(true)} aria-label={`Remove ${listing.title}`}>
              <Trash size={16} />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="active-listing-details">
            <section className="active-listing-detail-section media">
              <div className="active-listing-section-head">
                <h4>Listing Photos</h4>
                <span>{photos.length} file{photos.length === 1 ? "" : "s"}</span>
              </div>
              {photos.length > 0 ? (
                <div className="active-listing-media-grid">
                  {photos.map((media) => (
                    <MediaTile media={media} key={media.id} />
                  ))}
                </div>
              ) : (
                <p className="active-listing-empty">No listing photos uploaded.</p>
              )}
            </section>

            <section className="active-listing-detail-section media">
              <div className="active-listing-section-head">
                <h4>Certificate</h4>
                {listing.attributes.certificateStatus !== "none" && <span>{listing.attributes.certificateStatus.replace("_", " ")}</span>}
              </div>
              {certificates.length > 0 ? (
                <div className="active-listing-media-grid">
                  {certificates.map((media) => (
                    <MediaTile media={media} key={media.id} />
                  ))}
                </div>
              ) : (
                <p className="active-listing-empty">Certificate not uploaded.</p>
              )}
            </section>

            <section className="active-listing-detail-section">
              <h4>Details</h4>
              <dl className="active-listing-detail-grid">
                <Detail label="Title" value={listing.title} />
                <Detail label="Gem type ID" value={listing.gemTypeId} />
                <Detail label="Description" value={listing.description} wide />
                <Detail label="Location" value={listing.location} />
                <Detail label="Price" value={formatLkr(listing.priceLkr)} />
                <Detail label="Carat" value={String(listing.attributes.carat)} />
                <Detail label="Color" value={listing.attributes.color} />
                <Detail label="Origin" value={listing.attributes.origin} />
                <Detail label="Treatment" value={listing.attributes.treatment.replace("_", " ")} />
                <Detail label="Certificate status" value={listing.attributes.certificateStatus.replace("_", " ")} />
              </dl>
            </section>

            <section className="active-listing-detail-section">
              <h4>Seller Details</h4>
              <dl className="active-listing-detail-grid">
                <Detail label="Display name" value={seller?.displayName} />
                <Detail label="User name" value={sellerUser?.name} />
                <Detail label="Email" value={sellerUser?.email} />
                <Detail label="Phone" value={sellerUser?.phone} />
              </dl>
            </section>

            <section className="active-listing-detail-section">
              <h4>Receipt</h4>
              {payment ? (
                <div className="active-listing-receipt">
                  <dl className="active-listing-detail-grid">
                    <Detail label="Payment ID" value={payment.id} />
                    <Detail label="Status" value={payment.status.replace("_", " ")} />
                    {payment.stripeInvoiceId && (
                      <div>
                        <dt>Invoice</dt>
                        <dd><a href={`https://dashboard.stripe.com/${payment.livemode ? "" : "test/"}invoices/${payment.stripeInvoiceId}`} target="_blank" rel="noopener noreferrer">{payment.stripeInvoiceId}</a></dd>
                      </div>
                    )}
                  </dl>
                  <button type="button" className="active-listing-action receipt" onClick={() => void handleViewReceipt()} disabled={!canViewReceipt || receiptBusy}>
                    <ReceiptText size={16} />
                    {receiptBusy ? "Opening receipt..." : "View Receipt"}
                  </button>
                  {!canViewReceipt && <p className="active-listing-empty">Receipt appears after a successful invoice payment.</p>}
                  {receiptError && <p className="active-listing-error" role="alert">{receiptError}</p>}
                </div>
              ) : (
                <p className="active-listing-empty">No payment record found.</p>
              )}
            </section>

            <section className="active-listing-detail-section">
              <h4>Subscription Details</h4>
              {payment ? (
                <dl className="active-listing-detail-grid">
                  <Detail label="Plan" value={payment.quote.plan.name} />
                  <Detail label="Base price" value={formatLkr(payment.quote.basePriceLkr)} />
                  <Detail label="Extra photos" value={`${payment.quote.extraPhotoCount} (${formatLkr(payment.quote.extraPhotoTotalLkr)})`} />
                  <Detail label="Total" value={formatLkr(payment.quote.totalLkr)} />
                  <Detail label="Subscription ID" value={payment.subscriptionId} />
                  <Detail label="Gateway subscription" value={payment.stripeSubscriptionId} />
                  <Detail label="Policy accepted" value={formatDate(payment.policyAcceptedAt)} />
                  <Detail label="Listing expiry" value={formatOptionalDate(listing.expiresAt)} />
                  <Detail label="Auto-renew" value={listing.subscription ? (listing.subscription.autoRenew ? "Enabled" : "Disabled") : undefined} />
                  <Detail label="Renewal status" value={listing.subscription ? (listing.subscription.status.charAt(0).toUpperCase() + listing.subscription.status.slice(1).replace("_", " ")) : undefined} />
                </dl>
              ) : listing.subscription ? (
                <dl className="active-listing-detail-grid">
                  <Detail label="Source" value={listing.subscription.source === "trial" ? "Free trial" : "Paid"} />
                  <Detail label="Subscription ID" value={listing.subscription.id} />
                  <Detail label="Plan ID" value={listing.subscription.planId} />
                  <Detail label="Listing expiry" value={formatOptionalDate(listing.subscription.expiresAt ?? listing.expiresAt)} />
                  <Detail label="Auto-renew" value={listing.subscription.autoRenew ? "Enabled" : "Disabled"} />
                  <Detail label="Renewal status" value={listing.subscription.status.charAt(0).toUpperCase() + listing.subscription.status.slice(1).replace("_", " ")} />
                </dl>
              ) : (
                <p className="active-listing-empty">No subscription payment record found.</p>
              )}
            </section>

            <section className="active-listing-detail-section">
              <h4>Operational Details</h4>
              <dl className="active-listing-detail-grid">
                <Detail label="Listing status" value={listing.status.replace("_", " ")} />
                <Detail label="Moderation" value={listing.moderationStatus.replace("_", " ")} />
                <Detail label="Published" value={formatOptionalDate(listing.publishedAt)} />
                <Detail label="Expires" value={formatOptionalDate(listing.expiresAt)} />
                <Detail label="Promotions" value={listing.promoted.length > 0 ? listing.promoted.join(", ") : undefined} />
                <Detail label="Campaigns" value={campaignSummary(listing)} />
                <Detail label="Views" value={String(listing.stats.views)} />
                <Detail label="Phone reveals" value={String(listing.stats.phoneReveals)} />
              </dl>
            </section>
          </div>
        )}
      </div>
      {showCampaigns && (
        <CampaignDialog 
          listing={listing} 
          api={api} 
          token={token} 
          onClose={() => setShowCampaigns(false)} 
          onUpdate={onUpdate}
        />
      )}

      {showPauseConfirm && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="toggle-listing-title">
            <h3 id="toggle-listing-title" className="confirmation-dialog-title tone-warning">
              {listing.status === "paused" ? <Play size={20} /> : <Pause size={20} />}
              {listing.status === "paused" ? "Resume Listing" : "Pause Listing"}
            </h3>
            <p className="confirmation-dialog-copy">
              Are you sure you want to {listing.status === "paused" ? "resume" : "pause"} <strong>"{listing.title}"</strong>? 
              {listing.status === "paused" ? " It will become visible on the public marketplace again." : " It will be temporarily hidden from the public marketplace."}
            </p>
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => setShowPauseConfirm(false)}
                className="confirmation-dialog-button"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleTogglePause()}
                disabled={busy}
                className="confirmation-dialog-button tone-warning"
              >
                {busy ? "Processing..." : `Proceed to ${listing.status === "paused" ? "Resume" : "Pause"}`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showRemoveConfirm && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="remove-listing-title">
            <h3 id="remove-listing-title" className="confirmation-dialog-title tone-danger">
              <Trash size={20} /> Remove Listing
            </h3>
            <p className="confirmation-dialog-copy">
              Archive and unpublish <strong>"{listing.title}"</strong>? Billing history is retained and any active renewal is scheduled to end at the current period boundary.
            </p>
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                className="confirmation-dialog-button"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRemove()}
                disabled={removeAction.busy || busy}
                className="confirmation-dialog-button tone-danger"
              >
                {busy || removeAction.busy ? "Removing..." : "Proceed to Remove"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function Detail({ label, value, wide = false }: { label: string; value?: string | null; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={wide ? "wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MediaTile({ media }: { media: ListingMedia }) {
  return <AdminMediaPreview media={media} alt={media.kind === "certificate" ? "Certificate" : media.alt || "Listing photo"} variant="tile" />;
}

function latestPaymentForListing(payments: PaymentIntent[], listingId: string) {
  return payments
    .filter((payment) => payment.listingId === listingId)
    .sort((a, b) => paymentRank(b) - paymentRank(a) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function latestReceiptPaymentForListing(payments: PaymentIntent[], listingId: string) {
  return payments
    .filter((payment) => payment.listingId === listingId && payment.status === "succeeded" && payment.stripeInvoiceId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function paymentRank(payment: PaymentIntent) {
  if (payment.status === "succeeded") return 3;
  if (payment.status === "pending") return 2;
  return 1;
}

function paymentStatusBackground(status?: PaymentIntent["status"]) {
  if (status === "succeeded") return "var(--emerald-subtle)";
  if (status === "pending") return "var(--gold-soft)";
  if (status === "failed" || status === "cancelled" || status === "expired") return "var(--danger-soft)";
  return "var(--soft)";
}

function paymentStatusColor(status?: PaymentIntent["status"]) {
  if (status === "succeeded") return "var(--emerald)";
  if (status === "pending") return "var(--gold-dark)";
  if (status === "failed" || status === "cancelled" || status === "expired") return "var(--danger)";
  return "var(--muted)";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
}

function formatOptionalDate(value?: string) {
  return value ? formatDate(value) : undefined;
}

function shortRef(value: string) {
  return value.length > 18 ? `${value.slice(0, 14)}...` : value;
}

function campaignSummary(listing: Listing) {
  if (!listing.campaigns.length) return undefined;
  return listing.campaigns
    .map((campaign) => `${campaign.type} ${campaign.status} until ${formatDate(campaign.endsAt)}`)
    .join(", ");
}
