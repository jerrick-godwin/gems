import { ChevronDown, ChevronUp, ExternalLink, FileText, ImageIcon, ReceiptText, Star, Trash } from "lucide-react";
import { useState } from "react";
import type { GemsAdminApiClient } from "@gems/api-client";
import { formatLkr, type Listing, type ListingMedia, type PaymentIntent, type SellerProfile, type User } from "@gems/schemas";
import { publicErrorMessage } from "../../shared/helpers";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { CampaignDialog } from "./CampaignDialog";

export function ActiveListingRow({ 
  listing, 
  api, 
  token,
  payments,
  sellers,
  users,
  onUpdate,
  onRemove
}: { 
  listing: Listing; 
  api: GemsAdminApiClient; 
  token: string;
  payments: PaymentIntent[];
  sellers: SellerProfile[];
  users: User[];
  onUpdate: (listing: Listing) => void;
  onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const removeAction = useSingleFlightAction();

  const handleRemove = async () => {
    if (!window.confirm(`Are you sure you want to remove "${listing.title}"?`)) return;
    await removeAction.run(async () => {
      setBusy(true);
      try {
        await api.removeListing(token, listing.id);
        onRemove(listing.id);
      } catch (error) {
        alert("Failed to remove listing");
        setBusy(false);
      }
    });
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
          {photos[0] ? (
            <img src={photos[0].url} alt={photos[0].alt || listing.title} className="active-listing-thumb" />
          ) : (
            <div className="active-listing-thumb active-listing-thumb-empty">
              <ImageIcon size={22} />
            </div>
          )}
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
            <button type="button" className="active-listing-action" disabled={removeAction.busy || busy} onClick={() => setShowCampaigns(true)}>
              <Star size={16} /> Promotions
            </button>
            <button type="button" className="active-listing-action danger" disabled={removeAction.busy || busy} onClick={() => void handleRemove()} aria-label={`Remove ${listing.title}`}>
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
                <span>{listing.attributes.certificateStatus.replace("_", " ")}</span>
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
                <Detail label="Description" value={listing.description || "Not provided"} wide />
                <Detail label="Location" value={listing.location} />
                <Detail label="Price" value={formatLkr(listing.priceLkr)} />
                <Detail label="Carat" value={String(listing.attributes.carat)} />
                <Detail label="Color" value={listing.attributes.color || "Not provided"} />
                <Detail label="Origin" value={listing.attributes.origin || "Not provided"} />
                <Detail label="Treatment" value={listing.attributes.treatment.replace("_", " ")} />
                <Detail label="Certificate status" value={listing.attributes.certificateStatus.replace("_", " ")} />
              </dl>
            </section>

            <section className="active-listing-detail-section">
              <h4>Seller Details</h4>
              <dl className="active-listing-detail-grid">
                <Detail label="Display name" value={seller?.displayName || "Unknown"} />
                <Detail label="User name" value={sellerUser?.name || "Unknown"} />
                <Detail label="Email" value={sellerUser?.email || "Unknown"} />
                <Detail label="Phone" value={sellerUser?.phone || "Unknown"} />
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
                        <dd><a href={`https://dashboard.stripe.com/invoices/${payment.stripeInvoiceId}`} target="_blank" rel="noopener noreferrer">{payment.stripeInvoiceId}</a></dd>
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
                  <Detail label="Amount" value={formatLkr(payment.amountLkr)} />
                  <Detail label="Base price" value={formatLkr(payment.quote.basePriceLkr)} />
                  <Detail label="Extra photos" value={`${payment.quote.extraPhotoCount} (${formatLkr(payment.quote.extraPhotoTotalLkr)})`} />
                  <Detail label="Total" value={formatLkr(payment.quote.totalLkr)} />
                  <Detail label="Subscription ID" value={payment.subscriptionId ? shortRef(payment.subscriptionId) : "None"} />
                  <Detail label="Gateway subscription" value={payment.stripeSubscriptionId ? shortRef(payment.stripeSubscriptionId) : "Not available"} />
                  <Detail label="Invoice ID" value={payment.stripeInvoiceId ? shortRef(payment.stripeInvoiceId) : "Not available"} />
                  <Detail label="Policy accepted" value={formatDate(payment.policyAcceptedAt)} />
                  <Detail label="Listing expiry" value={formatOptionalDate(listing.expiresAt)} />
                  <Detail label="Auto-renew" value={listing.subscription ? (listing.subscription.autoRenew ? "Enabled" : "Disabled") : "Not available"} />
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
                <Detail label="Promotions" value={listing.promoted.length > 0 ? listing.promoted.join(", ") : "None"} />
                <Detail label="Campaigns" value={campaignSummary(listing)} />
                <Detail label="Views" value={String(listing.stats.views)} />
                <Detail label="Saves" value={String(listing.stats.saves)} />
                <Detail label="Phone reveals" value={String(listing.stats.phoneReveals)} />
                <Detail label="Chats" value={String(listing.stats.chats)} />
                <Detail label="WhatsApp clicks" value={String(listing.stats.whatsappClicks)} />
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
    </>
  );
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function MediaTile({ media }: { media: ListingMedia }) {
  const isPdf = media.kind === "certificate" && isPdfMedia(media);

  return (
    <a className="active-listing-media-tile" href={media.url} target="_blank" rel="noopener noreferrer">
      {isPdf ? (
        <div className="active-listing-file-preview">
          <FileText size={24} />
          <span>PDF</span>
        </div>
      ) : (
        <img src={media.url} alt={media.alt} />
      )}
      <span>{media.kind === "certificate" ? "View/Download Certificate" : media.alt || "View photo"}</span>
      <ExternalLink size={13} />
    </a>
  );
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
  return value ? formatDate(value) : "Not available";
}

function shortRef(value: string) {
  return value.length > 18 ? `${value.slice(0, 14)}...` : value;
}

function isPdfMedia(media: ListingMedia) {
  const name = `${media.alt} ${media.url.split("?")[0]}`.toLowerCase();
  return name.endsWith(".pdf") || name.includes(".pdf ");
}

function campaignSummary(listing: Listing) {
  if (!listing.campaigns.length) return "None";
  return listing.campaigns
    .map((campaign) => `${campaign.type} ${campaign.status} until ${formatDate(campaign.endsAt)}`)
    .join(", ");
}
