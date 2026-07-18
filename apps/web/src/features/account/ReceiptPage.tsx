import { CheckCircle2, Download, List, Mail, ReceiptText, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GemsApiClient } from "@gems/api-client";
import type { PaymentAttempt, PaymentReceipt, UserDashboard } from "@gems/schemas";
import { StatusState } from "../../shared/StatusState";
import { PAYMENT_ATTEMPT_MAX_POLLS, PAYMENT_ATTEMPT_POLL_INTERVAL_MS, paymentNoticeForAttempt, pollPaymentAttempt, receiptReferenceFromSearch, type ReceiptReference } from "../../shared/billing";
import { publicErrorMessage } from "../../shared/helpers";
import type { View } from "../../shared/types";

type BillingReceiptApi = GemsApiClient & {
  paymentAttemptStatus?: (paymentAttemptId: string) => Promise<PaymentAttempt>;
  getBillingInvoiceReceipt?: (billingInvoiceId: string) => Promise<PaymentReceipt>;
  downloadBillingInvoiceReceipt?: (billingInvoiceId: string) => Promise<{ blob: Blob; fileName: string }>;
};

export function ReceiptPage({
  api,
  onDashboardChange,
  onNavigate
}: {
  api: GemsApiClient;
  onDashboardChange: (dashboard: UserDashboard) => void;
  onNavigate: (view: View) => void;
}) {
  const reference = useMemo(() => receiptReferenceFromSearch(window.location.search), []);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(reference));
  const [reloadKey, setReloadKey] = useState(0);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (!reference) {
      setError("Payment receipt not found.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    const billingApi = api as BillingReceiptApi;

    const loadReceipt = async () => {
      setLoading(true);
      setError("");
      setReceipt(null);

      try {
        if (reference.kind === "payment-attempt" && billingApi.paymentAttemptStatus) {
          const pollResult = await pollPaymentAttempt({
            load: () => billingApi.paymentAttemptStatus!(reference.id),
            maxPolls: PAYMENT_ATTEMPT_MAX_POLLS,
            intervalMs: PAYMENT_ATTEMPT_POLL_INTERVAL_MS,
            signal: controller.signal
          }).catch(() => undefined);
          if (!active || pollResult?.state === "cancelled") return;
          if (pollResult && !pollResult.attempt) throw new Error("Unable to confirm the latest payment status.");
          if (pollResult?.attempt && (pollResult.state === "exhausted" || pollResult.attempt.status !== "succeeded")) {
            throw new Error(paymentNoticeForAttempt(pollResult.attempt.status, pollResult.state === "exhausted").message);
          }
        }

        const nextReceipt = await fetchReceipt(billingApi, reference);
        if (!active) return;
        setReceipt(nextReceipt);
        void api.dashboard().then((nextDashboard) => {
          if (active) onDashboardChange(nextDashboard);
        }).catch(() => {});
      } catch (nextError) {
        if (!active) return;
        setError(publicErrorMessage(nextError, "Unable to load payment receipt."));
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadReceipt();
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, onDashboardChange, reference, reloadKey]);

  const handleDownloadReceipt = async () => {
    if (!receipt || !reference) return;
    setDownloadingReceipt(true);
    setDownloadError("");

    try {
      const billingApi = api as BillingReceiptApi;
      const receiptFile = reference.kind === "billing-invoice" && billingApi.downloadBillingInvoiceReceipt
        ? await billingApi.downloadBillingInvoiceReceipt(reference.id)
        : await api.downloadPaymentReceipt(receipt.paymentIntentId);
      downloadFile(receiptFile);
    } catch (nextError) {
      setDownloadError(publicErrorMessage(nextError, "Unable to download the receipt right now."));
    } finally {
      setDownloadingReceipt(false);
    }
  };

  if (loading) {
    return <StatusState title="Processing your payment" message="Please wait while we confirm your payment. This check will stop automatically if confirmation takes longer than expected." loading variant="payment" />;
  }

  if (error || !receipt) {
    return (
      <section className="status-state status-state-marketplace" aria-live="polite">
        <div className="status-state-copy">
          <h1>Receipt unavailable</h1>
          <p>{error || "Payment receipt not found."}</p>
        </div>
        <div className="checkout-actions receipt-actions">
          {reference && (
            <button className="status-state-action" type="button" onClick={() => setReloadKey((current) => current + 1)}>
              <RefreshCcw size={17} />
              Try again
            </button>
          )}
          <button className="secondary-action" type="button" onClick={() => onNavigate("my_listings")}>
            <List size={18} />
            My Listings
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="invoice-panel data-panel receipt-panel card card--surface" aria-labelledby="receipt-title">
      <span className="eyebrow">Payment receipt</span>
      <div className="invoice-header">
        <div>
          <h1 id="receipt-title">Thank you for your payment!</h1>
          <span className="receipt-status"><CheckCircle2 size={17} /> Paid</span>
        </div>
      </div>

      <div className="receipt-paid-summary" aria-label={`Invoice paid ${formatChargedReceiptAmount(receipt)}`}>
        <div className="receipt-paid-icon" aria-hidden="true">
          <div className="receipt-paid-document">
            <span className="receipt-paid-avatar" />
            <span className="receipt-paid-line receipt-paid-line-short" />
            <span className="receipt-paid-line" />
            <span className="receipt-paid-line" />
            <span className="receipt-paid-line receipt-paid-line-wide" />
            <span className="receipt-paid-line receipt-paid-line-mid" />
          </div>
          <span className="receipt-paid-check">
            <CheckCircle2 size={24} strokeWidth={3} />
          </span>
        </div>
        <p>Invoice paid</p>
        <strong>{formatChargedReceiptAmount(receipt)}</strong>
      </div>

      <div className="invoice-meta">
        <div className="address-block">
          <span className="eyebrow">Billed to</span>
          <strong>{receipt.customer.name}</strong>
          <p>{receipt.customer.email}</p>
        </div>
        <div className="address-block">
          <span className="eyebrow">Receipt details</span>
          <strong>{receipt.receiptNumber}</strong>
          <p>Paid {formatDateTime(receipt.paidAt)}</p>
        </div>
      </div>

      <div className="receipt-lines" role="table" aria-label="Receipt line items">
        <div className="receipt-line receipt-line-heading" role="row">
          <span role="columnheader">Description</span>
          <span role="columnheader">Qty</span>
          <span role="columnheader">Amount</span>
        </div>
        {receipt.lineItems.map((line, index) => (
          <div className="receipt-line" role="row" key={`${line.label}-${index}`}>
            <span role="cell">{line.label}</span>
            <span role="cell">{line.quantity}</span>
            <strong role="cell">{formatReceiptAmount(line.amountLkr)}</strong>
          </div>
        ))}
        <div className="receipt-total-row" role="row">
          <span role="rowheader">Total paid</span>
          <strong role="cell">{formatChargedReceiptAmount(receipt)}</strong>
        </div>
      </div>

      <div className="receipt-references">
        <div className="receipt-reference-title">
          <ReceiptText size={18} />
          Listing and subscription
        </div>
        <dl>
          <div><dt>Listing</dt><dd>{receipt.listing.title}</dd></div>
          <div><dt>Plan</dt><dd>{receipt.subscription.planName}</dd></div>
          <div><dt>Service period</dt><dd>{formatSubscriptionDates(receipt.servicePeriod?.startsAt ?? receipt.subscription.startsAt, receipt.servicePeriod?.endsAt ?? receipt.subscription.expiresAt)}</dd></div>
          <div><dt>Payment reference</dt><dd>{receipt.paymentIntentId}</dd></div>
          {receipt.stripe.invoiceId && <div><dt>Invoice reference</dt><dd>{receipt.stripe.invoiceId}</dd></div>}
          {receipt.stripe.hostedInvoiceUrl && (
            <div><dt>Stripe invoice</dt><dd><a href={receipt.stripe.hostedInvoiceUrl} target="_blank" rel="noreferrer">Open hosted invoice</a></dd></div>
          )}
        </dl>
      </div>

      <p className="receipt-email-note">
        <Mail size={17} aria-hidden="true" />
        Keep this receipt for your records. You can return to My Listings at any time to review billing and listing access.
      </p>

      <div className="checkout-actions receipt-actions">
        <button type="button" className="primary-action" onClick={() => void handleDownloadReceipt()} disabled={downloadingReceipt}>
          {downloadingReceipt ? <span className="button-spinner" aria-hidden="true" /> : <Download size={18} />}
          {downloadingReceipt ? "Preparing receipt..." : "Download Receipt"}
        </button>
        <button type="button" className="secondary-action" onClick={() => onNavigate("my_listings")}>
          <List size={18} />
          My Listings
        </button>
      </div>
      {downloadError && <p role="alert" className="receipt-error">{downloadError}</p>}
    </section>
  );
}

async function fetchReceipt(api: BillingReceiptApi, reference: ReceiptReference) {
  if (reference.kind === "billing-invoice") {
    if (!api.getBillingInvoiceReceipt) throw new Error("Invoice receipts are temporarily unavailable. Please try again later.");
    return api.getBillingInvoiceReceipt(reference.id);
  }
  return api.getPaymentReceipt(reference.id);
}

function downloadFile(receiptFile: { blob: Blob; fileName: string }) {
  const url = URL.createObjectURL(receiptFile.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = receiptFile.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-LK", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatSubscriptionDates(startsAt?: string, expiresAt?: string) {
  if (!startsAt && !expiresAt) return "Subscription dates will appear after payment processing completes.";
  if (!startsAt) return `Valid until ${formatDate(expiresAt!)}`;
  if (!expiresAt) return `Starts ${formatDate(startsAt)}`;
  return `${formatDate(startsAt)} to ${formatDate(expiresAt)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", { dateStyle: "medium" }).format(new Date(value));
}

function formatReceiptAmount(value: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatChargedReceiptAmount(receipt: PaymentReceipt) {
  if (receipt.chargedAmountMinor === undefined || !receipt.chargedCurrency) return formatReceiptAmount(receipt.totalLkr);
  const currency = receipt.chargedCurrency.toUpperCase();
  const zeroDecimalCurrencies = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
  const amount = receipt.chargedAmountMinor / (zeroDecimalCurrencies.has(currency) ? 1 : 100);
  return new Intl.NumberFormat("en-LK", { style: "currency", currency }).format(amount);
}
