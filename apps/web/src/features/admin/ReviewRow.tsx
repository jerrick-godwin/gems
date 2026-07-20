import { ReceiptText, XCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { AdminModerationSnapshot, GemsAdminApiClient } from "@gems/api-client";
import { formatLkr, type Listing, type PaymentIntent } from "@gems/schemas";
import { publicErrorMessage } from "../../shared/helpers";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";
import { AdminMediaPreview } from "./AdminMediaPreview";

export function ReviewRow({
  api,
  token,
  listing,
  snapshot,
  onModerate
}: {
  api: GemsAdminApiClient;
  token: string;
  listing: Listing;
  snapshot: AdminModerationSnapshot;
  onModerate: (listingId: string, decision: "approve" | "reject", reason?: string) => Promise<void>;
}) {
  const isQueued = listing.moderationStatus === "queued";
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showRejectPrompt, setShowRejectPrompt] = useState(false);
  const [showApprovePrompt, setShowApprovePrompt] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const moderationAction = useSingleFlightAction();

  const runModeration = async (decision: "approve" | "reject") => {
    let reason: string | undefined;
    if (decision === "reject") {
      if (!rejectReason.trim()) {
        alert("A reason is required to reject a listing.");
        return;
      }
      reason = rejectReason.trim();
    }
    await moderationAction.run(async () => {
      setBusy(decision);
      try {
        await onModerate(listing.id, decision, reason);
        if (decision === "reject") setShowRejectPrompt(false);
        if (decision === "approve") setShowApprovePrompt(false);
      } finally {
        setBusy(null);
      }
    });
  };

  const seller = snapshot.sellers.find(s => s.id === listing.sellerId);
  const user = seller ? snapshot.users.find(u => u.id === seller.userId) : null;
  const payment = latestPaymentForListing(snapshot.payments, listing.id);
  const canViewReceipt = Boolean(payment && payment.status === "succeeded" && payment.stripeInvoiceId);

  const handleViewReceipt = async () => {
    if (!payment) return;
    setReceiptBusy(true);
    setReceiptError("");

    try {
      const receiptFile = await api.downloadPaymentReceipt(token, payment.id);
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
  
  return (
    <article className="review-row card card--surface card--compact">
      <div className="review-row-main">
        <AdminMediaPreview media={listing.media.find((item) => item.kind !== "certificate") ?? listing.media[0]} alt={listing.title} />
        <div className="review-row-identity">
          <strong>{listing.title}</strong>
          <span className="review-row-meta">
            Seller Name: {seller?.displayName || user?.name || "Unknown"}
          </span>
          <span className="review-row-meta">
            Requested Date: {listing.createdAt ? new Date(listing.createdAt).toLocaleDateString() : "Unknown"}
          </span>
          {listing.attributes.certificateStatus !== "none" && (
            <span className="review-row-meta">
              <span className="review-row-certificate">
                {listing.attributes.certificateStatus.replace("_", " ")}
              </span>
            </span>
          )}
        </div>
        <button className="review-row-action" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Hide Details" : "View Details"}
        </button>
        <button className="review-row-action tone-success" disabled={moderationAction.busy || busy !== null || !isQueued} onClick={() => setShowApprovePrompt(true)}>
          {busy === "approve" ? "Approving..." : "Approve"}
        </button>
        <button className="review-row-action tone-danger" disabled={moderationAction.busy || busy !== null} onClick={() => setShowRejectPrompt(true)}>
          {busy === "reject" ? "Rejecting..." : "Reject"}
        </button>
      </div>

      {showRejectPrompt && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="reject-listing-title">
            <h3 id="reject-listing-title" className="confirmation-dialog-title tone-danger">
              <XCircle size={20} /> Reject Listing
            </h3>
            <p className="confirmation-dialog-copy review-reject-copy">
              Please provide a reason for rejecting the listing:
              <br />
              <strong className="confirmation-dialog-subject">{listing.title}</strong>
              This will be sent to the seller to help them correct the issue.
            </p>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g., The certificate image is illegible. Please upload a clearer copy."
              className="confirmation-dialog-textarea"
            />
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => { setShowRejectPrompt(false); setRejectReason(""); }}
                className="confirmation-dialog-button"
              >
                Cancel
              </button>
              <button
                onClick={() => void runModeration("reject")}
                disabled={moderationAction.busy || busy !== null || !rejectReason.trim()}
                className="confirmation-dialog-button tone-danger"
                style={{ display: "inline-flex", gap: "8px", alignItems: "center", justifyContent: "center" }}
              >
                {busy === "reject" ? <LoaderCircle className="icon-spinner" size={16} /> : null}
                {busy === "reject" ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showApprovePrompt && createPortal(
        <div className="modal-overlay modal-overlay--priority" role="presentation">
          <div className="confirmation-dialog card card--surface" role="dialog" aria-modal="true" aria-labelledby="approve-listing-title">
            <h3 id="approve-listing-title" className="confirmation-dialog-title tone-success">
              <CheckCircle2 size={20} /> Approve Listing
            </h3>
            <p className="confirmation-dialog-copy">
              Are you sure you want to approve this listing? It will become visible to all buyers immediately.
              <br />
              <strong className="confirmation-dialog-subject">{listing.title}</strong>
            </p>
            <div className="confirmation-dialog-actions">
              <button
                onClick={() => setShowApprovePrompt(false)}
                className="confirmation-dialog-button"
              >
                Cancel
              </button>
              <button
                onClick={() => void runModeration("approve")}
                disabled={moderationAction.busy || busy !== null}
                className="confirmation-dialog-button tone-success"
                style={{ display: "inline-flex", gap: "8px", alignItems: "center", justifyContent: "center" }}
              >
                {busy === "approve" ? <LoaderCircle className="icon-spinner" size={16} /> : null}
                {busy === "approve" ? "Approving..." : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {expanded && (
        <div className="review-row-details">
          <div className="review-row-details-grid">
            <div className="review-row-detail-section">
              <h4>Seller Details</h4>
              <div className="review-row-detail-list">
                <div><strong>Display Name:</strong> {seller?.displayName || "Unknown"}</div>
                <div><strong>User Name:</strong> {user?.name || "Unknown"}</div>
                <div><strong>Email:</strong> {user?.email || "Unknown"}</div>
                <div><strong>Phone:</strong> {user?.phone || "Unknown"}</div>
              </div>
            </div>
            <div className="review-row-detail-section">
              <h4>Listing Details</h4>
              <div className="review-row-detail-list">
                <div><strong>Description:</strong> <span className="admin-muted">{listing.description}</span></div>
                <div><strong>Price:</strong> LKR {listing.priceLkr.toLocaleString()} {listing.negotiable ? <span className="admin-muted admin-small">(Negotiable)</span> : ""}</div>
                <div><strong>Location:</strong> {listing.location}</div>
              </div>
            </div>
            <div className="review-row-detail-section">
              <h4>Payment Details</h4>
              <div className="review-row-detail-list">
                {payment ? (
                  <>
                    <div><strong>Status:</strong> <span className={`admin-payment-state status-${payment.status}`}>{payment.status.replace("_", " ")}</span></div>
                    <div><strong>Amount:</strong> <span className="admin-muted">{formatLkr(payment.amountLkr)}</span></div>
                    <div><strong>Plan:</strong> <span className="admin-muted">{payment.quote.plan.name}</span></div>
                    {payment.stripeInvoiceId && <div><strong>Invoice:</strong> <a className="admin-link" href={`https://dashboard.stripe.com/invoices/${payment.stripeInvoiceId}`} target="_blank" rel="noopener noreferrer">{payment.stripeInvoiceId}</a></div>}
                    <div className="review-row-receipt">
                      <button
                        type="button"
                        onClick={() => void handleViewReceipt()}
                        disabled={!canViewReceipt || receiptBusy}
                        className="review-row-receipt-button"
                      >
                        <ReceiptText size={16} />
                        {receiptBusy ? "Opening receipt..." : "View Receipt"}
                      </button>
                      {receiptError && <span role="alert" className="admin-inline-error">{receiptError}</span>}
                      {!canViewReceipt && <span className="admin-inline-note">Receipt appears after a successful invoice payment.</span>}
                    </div>
                  </>
                ) : (
                  <div className="admin-empty-copy">No payment record was found for this listing.</div>
                )}
              </div>
            </div>
            <div className="review-row-detail-section review-row-detail-wide">
              <h4>Gem Attributes</h4>
              <div className="review-row-attributes">
                <div><strong>Carat:</strong> <span>{listing.attributes.carat}</span></div>
                <div><strong>Color:</strong> <span>{listing.attributes.color}</span></div>
                <div><strong>Origin:</strong> <span>{listing.attributes.origin}</span></div>
                <div><strong>Treatment:</strong> <span>{listing.attributes.treatment}</span></div>
                <div><strong>Certificate:</strong> <span>{listing.attributes.certificateStatus.replace("_", " ")}</span></div>
              </div>
            </div>
          </div>

          <h4 className="review-row-section-title">Uploaded Files</h4>
          <div className="review-row-media">
            {listing.media.map(m => (
              <div key={m.id} className="review-row-media-item card card--inset card--compact">
                <AdminMediaPreview media={m} alt={m.alt || listing.title} variant="detail" />
                <div className="review-row-media-kind">{m.kind}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function latestPaymentForListing(payments: PaymentIntent[], listingId: string) {
  return payments
    .filter((payment) => payment.listingId === listingId)
    .sort((a, b) => paymentRank(b) - paymentRank(a) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function paymentRank(payment: PaymentIntent) {
  if (payment.status === "succeeded") return 3;
  if (payment.status === "pending") return 2;
  return 1;
}
