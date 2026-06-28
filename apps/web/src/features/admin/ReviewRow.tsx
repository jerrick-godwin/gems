import { ReceiptText, XCircle } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { AdminModerationSnapshot, GemsAdminApiClient } from "@gems/api-client";
import { formatLkr, type Listing, type PaymentIntent } from "@gems/schemas";
import { publicErrorMessage } from "../../shared/helpers";
import { useSingleFlightAction } from "../../shared/useSingleFlightAction";

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
    <div className="review-row" style={{ background: "var(--panel-strong)", padding: 16, borderRadius: "var(--radius)", marginBottom: 12, border: "1px solid var(--line)", boxShadow: "var(--shadow-xs)", display: "block" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <img src={listing.media[0]?.url} alt={listing.title} style={{ width: 80, height: 80, borderRadius: "var(--radius-sm)", objectFit: "cover", border: "1px solid var(--line)" }} />
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 16, fontWeight: 700 }}>{listing.title}</strong>
          <span style={{ fontSize: 13, marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
            {listing.attributes.carat} ct ·
            {listing.attributes.certificateStatus !== "none" && (
              <span style={{
                background: "var(--brand-soft)",
                color: "var(--brand)",
                padding: "4px 8px",
                borderRadius: 999,
                fontWeight: 700,
                fontSize: 11,
                textTransform: "uppercase"
              }}>
                {listing.attributes.certificateStatus.replace("_", " ")}
              </span>
            )}
          </span>
        </div>
        <button style={{ minHeight: 36, padding: "0 16px", background: "var(--soft)", color: "var(--ink)", fontWeight: 600 }} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Hide Details" : "View Details"}
        </button>
        <button style={{ minHeight: 36, padding: "0 16px", background: "var(--emerald-soft)", color: "var(--emerald)" }} disabled={moderationAction.busy || busy !== null || !isQueued} onClick={() => void runModeration("approve")}>
          {busy === "approve" ? "Approving..." : "Approve"}
        </button>
        <button style={{ minHeight: 36, padding: "0 16px", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: "var(--radius-sm)", border: "none", cursor: moderationAction.busy || busy !== null ? "not-allowed" : "pointer", fontWeight: 600 }} disabled={moderationAction.busy || busy !== null} onClick={() => setShowRejectPrompt(true)}>
          {busy === "reject" ? "Rejecting..." : "Reject"}
        </button>
      </div>

      {showRejectPrompt && createPortal(
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
          <div style={{ background: "var(--panel)", padding: 24, borderRadius: "var(--radius)", width: 400, maxWidth: "90vw", boxShadow: "var(--shadow-xl)", border: "1px solid var(--line)" }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
              <XCircle size={20} className="text-danger" style={{ color: "var(--danger)" }} /> Reject Listing
            </h3>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16, lineHeight: 1.5 }}>
              Please provide a reason for rejecting the listing:
              <br />
              <strong style={{ display: "block", marginTop: 4, marginBottom: 8, color: "var(--ink)" }}>{listing.title}</strong>
              This will be sent to the seller to help them correct the issue.
            </p>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g., The certificate image is illegible. Please upload a clearer copy."
              style={{ width: "100%", height: 100, padding: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", background: "var(--soft)", color: "var(--ink)", marginBottom: 20, resize: "none", boxSizing: "border-box", fontFamily: "inherit", fontSize: 14 }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                onClick={() => { setShowRejectPrompt(false); setRejectReason(""); }}
                style={{ padding: "8px 16px", background: "var(--soft)", color: "var(--ink)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 500 }}
              >
                Cancel
              </button>
              <button
                onClick={() => void runModeration("reject")}
                disabled={moderationAction.busy || busy !== null || !rejectReason.trim()}
                style={{ padding: "8px 16px", background: "var(--danger-soft)", color: "var(--danger)", border: "none", borderRadius: "var(--radius-sm)", cursor: busy !== null || !rejectReason.trim() ? "not-allowed" : "pointer", fontWeight: 600, opacity: !rejectReason.trim() ? 0.5 : 1 }}
              >
                {busy === "reject" ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {expanded && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, marginBottom: 24 }}>
            <div>
              <h4 style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", marginBottom: 12, letterSpacing: "0.05em", fontWeight: 700 }}>Seller Details</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
                <div><strong>Display Name:</strong> {seller?.displayName || "Unknown"}</div>
                <div><strong>User Name:</strong> {user?.name || "Unknown"}</div>
                <div><strong>Email:</strong> {user?.email || "Unknown"}</div>
                <div><strong>Phone:</strong> {user?.phone || "Unknown"}</div>
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", marginBottom: 12, letterSpacing: "0.05em", fontWeight: 700 }}>Listing Details</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
                <div><strong>Description:</strong> <span style={{ color: "var(--muted)" }}>{listing.description}</span></div>
                <div><strong>Price:</strong> LKR {listing.priceLkr.toLocaleString()} {listing.negotiable ? <span style={{ color: "var(--muted)", fontSize: 12 }}>(Negotiable)</span> : ""}</div>
                <div><strong>Location:</strong> {listing.location}</div>
              </div>
            </div>
            <div>
              <h4 style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", marginBottom: 12, letterSpacing: "0.05em", fontWeight: 700 }}>Payment Details</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14 }}>
                {payment ? (
                  <>
                    <div><strong>Status:</strong> <span style={{ color: paymentStatusColor(payment.status), fontWeight: 800, textTransform: "capitalize" }}>{payment.status.replace("_", " ")}</span></div>
                    <div><strong>Amount:</strong> <span style={{ color: "var(--muted)" }}>{formatLkr(payment.amountLkr)}</span></div>
                    <div><strong>Plan:</strong> <span style={{ color: "var(--muted)" }}>{payment.quote.plan.name}</span></div>
                    {payment.stripeInvoiceId && <div><strong>Invoice:</strong> <a href={`https://dashboard.stripe.com/invoices/${payment.stripeInvoiceId}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand)" }}>{payment.stripeInvoiceId}</a></div>}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => void handleViewReceipt()}
                        disabled={!canViewReceipt || receiptBusy}
                        style={{ minHeight: 36, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 8, background: canViewReceipt ? "var(--emerald-soft)" : "var(--soft)", color: canViewReceipt ? "var(--emerald)" : "var(--muted)", border: "none", borderRadius: "var(--radius-sm)", cursor: canViewReceipt && !receiptBusy ? "pointer" : "not-allowed", fontWeight: 700 }}
                      >
                        <ReceiptText size={16} />
                        {receiptBusy ? "Opening receipt..." : "View Receipt"}
                      </button>
                      {receiptError && <span role="alert" style={{ color: "var(--danger)", fontSize: 12, fontWeight: 700 }}>{receiptError}</span>}
                      {!canViewReceipt && <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 600 }}>Receipt appears after a successful invoice payment.</span>}
                    </div>
                  </>
                ) : (
                  <div style={{ color: "var(--muted)", fontWeight: 600 }}>No payment record was found for this listing.</div>
                )}
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <h4 style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", marginBottom: 12, letterSpacing: "0.05em", fontWeight: 700 }}>Gem Attributes</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: 14 }}>
                <div><strong style={{ display: "block", marginBottom: 2 }}>Carat:</strong> <span style={{ color: "var(--muted)" }}>{listing.attributes.carat}</span></div>
                <div><strong style={{ display: "block", marginBottom: 2 }}>Color:</strong> <span style={{ color: "var(--muted)", textTransform: "capitalize" }}>{listing.attributes.color}</span></div>
                <div><strong style={{ display: "block", marginBottom: 2 }}>Origin:</strong> <span style={{ color: "var(--muted)", textTransform: "capitalize" }}>{listing.attributes.origin}</span></div>
                <div><strong style={{ display: "block", marginBottom: 2 }}>Treatment:</strong> <span style={{ color: "var(--muted)", textTransform: "capitalize" }}>{listing.attributes.treatment}</span></div>
                <div><strong style={{ display: "block", marginBottom: 2 }}>Certificate:</strong> <span style={{ color: "var(--muted)", textTransform: "capitalize" }}>{listing.attributes.certificateStatus.replace("_", " ")}</span></div>
              </div>
            </div>
          </div>

          <h4 style={{ fontSize: 12, textTransform: "uppercase", color: "var(--muted)", marginBottom: 12, letterSpacing: "0.05em", fontWeight: 700 }}>Uploaded Files</h4>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", background: "var(--soft)", padding: 16, borderRadius: 8 }}>
            {listing.media.map(m => (
              <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", flexDirection: "column", alignItems: "center", textDecoration: "none", color: "inherit", background: "var(--panel)", padding: 8, borderRadius: 6, border: "1px solid var(--line)", transition: "transform 0.2s" }} onMouseOver={e => e.currentTarget.style.transform = "translateY(-2px)"} onMouseOut={e => e.currentTarget.style.transform = "none"}>
                {m.url.endsWith(".pdf") ? (
                  <div style={{ width: 120, height: 120, background: "var(--soft)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>PDF</span>
                  </div>
                ) : m.url.match(/\.(mp4|webm|ogg)$/i) ? (
                  <video src={m.url} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 4 }} muted playsInline />
                ) : (
                  <img src={m.url} alt={m.alt} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 4 }} />
                )}
                <div style={{ fontSize: 11, textAlign: "center", color: "var(--ink)", marginTop: 8, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.02em" }}>{m.kind}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
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

function paymentStatusBackground(status?: PaymentIntent["status"]) {
  if (status === "succeeded") return "var(--emerald-subtle)";
  if (status === "failed" || status === "cancelled" || status === "expired") return "var(--danger-soft)";
  return "var(--soft)";
}

function paymentStatusColor(status?: PaymentIntent["status"]) {
  if (status === "succeeded") return "var(--emerald)";
  if (status === "failed" || status === "cancelled" || status === "expired") return "var(--danger)";
  return "var(--muted)";
}
