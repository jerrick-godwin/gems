import { Download, ExternalLink } from "lucide-react";
import { useState } from "react";
import type { AdminModerationSnapshot, GemsAdminApiClient } from "@gems/api-client";
import { formatLkr, type BillingInvoice } from "@gems/schemas";
import { publicErrorMessage } from "../../shared/helpers";
import { adminBillingApi, billingStatusClass, saveDownloadedFile } from "./adminBilling";
import { AdminSubscriptionBillingActions } from "./AdminSubscriptionBillingActions";

interface AdminBillingInvoiceRowProps {
  api: GemsAdminApiClient;
  token: string;
  invoice: BillingInvoice;
  snapshot: AdminModerationSnapshot;
}

export function AdminBillingInvoiceRow({ api, token, invoice, snapshot }: AdminBillingInvoiceRowProps) {
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const user = snapshot.users.find((item) => item.id === invoice.userId);
  const listing = snapshot.listings.find((item) => item.id === invoice.listingId)
    ?? snapshot.liveListings.find((item) => item.id === invoice.listingId);
  const subscriptionId = invoice.subscriptionId ?? listing?.subscription?.id;
  const billingApi = adminBillingApi(api);
  const canDownloadReceipt = invoice.status === "paid" && Boolean(billingApi.downloadBillingInvoiceReceipt);

  const downloadReceipt = async () => {
    if (!billingApi.downloadBillingInvoiceReceipt) return;
    setReceiptBusy(true);
    setReceiptError("");
    try {
      const file = await billingApi.downloadBillingInvoiceReceipt.call(api, token, invoice.id);
      saveDownloadedFile(file);
    } catch (error) {
      setReceiptError(publicErrorMessage(error, "Unable to download invoice receipt"));
    } finally {
      setReceiptBusy(false);
    }
  };

  return (
    <article className="admin-payment-row card card--inset card--compact">
      <div className="admin-payment-identity">
        <strong>{listing?.title ?? "Unavailable listing"}</strong>
        <span>{user?.email ?? invoice.userId}</span>
        {invoice.failureCode && <span>Failure code: {invoice.failureCode}</span>}
        {invoice.failureMessage && <span className="admin-inline-error">{invoice.failureMessage}</span>}
      </div>
      <div className="admin-payment-reference">
        <span>{invoice.purpose.replaceAll("_", " ")}</span>
        <small>{invoice.stripeInvoiceId}</small>
        <small>{invoice.livemode ? "Live mode" : "Test mode"}</small>
        {subscriptionId && <small>Subscription: {subscriptionId}</small>}
        <div className="active-listing-actions">
          {invoice.hostedInvoiceUrl && (
            <a className="active-listing-action receipt" href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} aria-hidden="true" /> Open invoice
            </a>
          )}
          <a className="active-listing-action receipt" href={stripeDashboardUrl("invoices", invoice.stripeInvoiceId, invoice.livemode)} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} aria-hidden="true" /> Stripe dashboard
          </a>
          {invoice.invoicePdfUrl && (
            <a className="active-listing-action receipt" href={invoice.invoicePdfUrl} target="_blank" rel="noopener noreferrer">
              <Download size={15} aria-hidden="true" /> Invoice PDF
            </a>
          )}
          {canDownloadReceipt && (
            <button type="button" className="active-listing-action receipt" disabled={receiptBusy} onClick={() => void downloadReceipt()}>
              <Download size={15} aria-hidden="true" />
              {receiptBusy ? "Preparing..." : "Receipt"}
            </button>
          )}
        </div>
        {receiptError && <span className="admin-inline-error" role="alert">{receiptError}</span>}
        <AdminSubscriptionBillingActions
          api={api}
          token={token}
          subscriptionId={subscriptionId}
          currentSubscription={listing?.subscription}
        />
      </div>
      <div className="admin-payment-amount">
        <strong>{formatLkr(invoice.amountLkr)}</strong>
        <span>Charged {formatChargedAmount(invoice.chargedAmountMinor, invoice.chargedCurrency)}</span>
        <span>{formatDate(invoice.createdAt)}</span>
        {invoice.servicePeriodStart && invoice.servicePeriodEnd && (
          <span>{formatDate(invoice.servicePeriodStart)} – {formatDate(invoice.servicePeriodEnd)}</span>
        )}
        {invoice.paidAt && <span>Paid {formatDate(invoice.paidAt)}</span>}
      </div>
      <span className={`admin-payment-pill status-${billingStatusClass(invoice.status)}`}>{invoice.status.replaceAll("_", " ")}</span>
    </article>
  );
}

function stripeDashboardUrl(resource: "invoices", id: string, livemode: boolean) {
  return `https://dashboard.stripe.com/${livemode ? "" : "test/"}${resource}/${encodeURIComponent(id)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
}

function formatChargedAmount(amountMinor: number, currency: string) {
  try {
    const formatter = new Intl.NumberFormat("en-LK", { style: "currency", currency: currency.toUpperCase() });
    const divisor = 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2);
    return formatter.format(amountMinor / divisor);
  } catch {
    return `${currency.toUpperCase()} ${(amountMinor / 100).toFixed(2)}`;
  }
}
