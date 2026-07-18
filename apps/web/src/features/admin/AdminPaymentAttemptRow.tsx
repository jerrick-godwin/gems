import { ExternalLink, ReceiptText } from "lucide-react";
import { useState } from "react";
import type { AdminModerationSnapshot, GemsAdminApiClient } from "@gems/api-client";
import { formatLkr, type PaymentAttempt } from "@gems/schemas";
import { publicErrorMessage } from "../../shared/helpers";
import { billingStatusClass, saveDownloadedFile } from "./adminBilling";
import { AdminSubscriptionBillingActions } from "./AdminSubscriptionBillingActions";

interface AdminPaymentAttemptRowProps {
  api: GemsAdminApiClient;
  token: string;
  attempt: PaymentAttempt;
  snapshot: AdminModerationSnapshot;
  showSubscriptionActions: boolean;
}

export function AdminPaymentAttemptRow({
  api,
  token,
  attempt,
  snapshot,
  showSubscriptionActions
}: AdminPaymentAttemptRowProps) {
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const user = snapshot.users.find((item) => item.id === attempt.userId);
  const listing = snapshot.listings.find((item) => item.id === attempt.listingId)
    ?? snapshot.liveListings.find((item) => item.id === attempt.listingId);
  const subscriptionId = attempt.subscriptionId ?? listing?.subscription?.id;
  const canViewReceipt = attempt.status === "succeeded" && Boolean(attempt.stripeInvoiceId);

  const downloadReceipt = async () => {
    setReceiptBusy(true);
    setReceiptError("");
    try {
      const file = await api.downloadPaymentReceipt(token, attempt.id);
      saveDownloadedFile(file);
    } catch (error) {
      setReceiptError(publicErrorMessage(error, "Unable to download payment receipt"));
    } finally {
      setReceiptBusy(false);
    }
  };

  return (
    <article className="admin-payment-row card card--inset card--compact">
      <div className="admin-payment-identity">
        <strong>{listing?.title ?? "Unavailable listing"}</strong>
        <span>{user?.email ?? attempt.userId}</span>
      </div>
      <div className="admin-payment-reference">
        <span>{attempt.quote.plan.name}</span>
        <small>{attempt.id}</small>
        {attempt.stripeInvoiceId && <small>Invoice: {attempt.stripeInvoiceId}</small>}
        <div className="active-listing-actions">
          {attempt.stripeCheckoutSessionId && (
            <a
              className="active-listing-action receipt"
              href={`https://dashboard.stripe.com/${attempt.livemode ? "" : "test/"}checkout/sessions/${encodeURIComponent(attempt.stripeCheckoutSessionId)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={15} aria-hidden="true" /> Stripe dashboard
            </a>
          )}
          <button type="button" className="active-listing-action receipt" disabled={!canViewReceipt || receiptBusy} onClick={() => void downloadReceipt()}>
            <ReceiptText size={15} aria-hidden="true" />
            {receiptBusy ? "Preparing..." : "Receipt"}
          </button>
        </div>
        {!canViewReceipt && <span className="admin-inline-note">Receipt appears after a successful invoice payment.</span>}
        {receiptError && <span className="admin-inline-error" role="alert">{receiptError}</span>}
        {showSubscriptionActions && (
          <AdminSubscriptionBillingActions
            api={api}
            token={token}
            subscriptionId={subscriptionId}
            currentSubscription={listing?.subscription}
          />
        )}
      </div>
      <div className="admin-payment-amount">
        <strong>{formatLkr(attempt.amountLkr)}</strong>
        <span>{formatDate(attempt.createdAt)}</span>
      </div>
      <span className={`admin-payment-pill status-${billingStatusClass(attempt.status)}`}>{attempt.status.replaceAll("_", " ")}</span>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
}
