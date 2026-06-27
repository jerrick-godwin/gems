import { CheckCircle2, Home, ReceiptText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GemsApiClient } from "@gems/api-client";
import type { PaymentReceipt, UserDashboard } from "@gems/schemas";
import { StatusState } from "../../shared/StatusState";
import { publicErrorMessage } from "../../shared/helpers";
import type { View } from "../../shared/types";

export function ReceiptPage({
  api,
  onDashboardChange,
  onNavigate
}: {
  api: GemsApiClient;
  onDashboardChange: (dashboard: UserDashboard) => void;
  onNavigate: (view: View) => void;
}) {
  const paymentIntentId = useMemo(() => new URLSearchParams(window.location.search).get("paymentIntentId") ?? "", []);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(paymentIntentId));
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (!paymentIntentId) {
      setError("Payment receipt not found.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    const receiptPromise = api.getPaymentReceipt(paymentIntentId);
    const dashboardPromise = api.dashboard().catch(() => undefined);

    Promise.all([receiptPromise, dashboardPromise])
      .then(([nextReceipt, nextDashboard]) => {
        if (!active) return;
        setReceipt(nextReceipt);
        if (nextDashboard) onDashboardChange(nextDashboard);
      })
      .catch((nextError) => {
        if (!active) return;
        setError(publicErrorMessage(nextError, "Unable to load payment receipt."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, onDashboardChange, paymentIntentId]);

  const handleReturnHome = () => {
    window.history.pushState({}, "", "/");
    onNavigate("market");
  };

  const handleDownloadReceipt = async () => {
    if (!receipt) return;
    setDownloadingReceipt(true);
    setDownloadError("");

    try {
      const receiptFile = await api.downloadPaymentReceipt(receipt.paymentIntentId);
      const url = URL.createObjectURL(receiptFile.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = receiptFile.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (nextError) {
      setDownloadError(publicErrorMessage(nextError, "Unable to download the receipt right now."));
    } finally {
      setDownloadingReceipt(false);
    }
  };

  if (loading) {
    return <StatusState title="Processing your payment" message="Please wait while we confirm your payment." loading variant="payment" />;
  }

  if (error || !receipt) {
    return (
      <section className="status-state status-state-marketplace" aria-live="polite">
        <div className="status-state-copy">
          <h1>Receipt unavailable</h1>
          <p>{error || "Payment receipt not found."}</p>
        </div>
        <button className="status-state-action" type="button" onClick={handleReturnHome}>
          Return Home
        </button>
      </section>
    );
  }

  return (
    <section className="invoice-panel data-panel receipt-panel" aria-labelledby="receipt-title">
      <span className="eyebrow">Payment successful</span>
      <div className="invoice-header">
        <div>
          <h1 id="receipt-title">Thank you for your payment!</h1>
        </div>
      </div>

      <div className="receipt-paid-summary" aria-label={`Invoice paid ${formatReceiptAmount(receipt.totalLkr)}`}>
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
        <strong>{formatReceiptAmount(receipt.totalLkr)}</strong>
      </div>

      <div className="checkout-actions receipt-actions">
        {receipt.stripe.invoiceId && (
          <button type="button" className="primary-action" onClick={handleDownloadReceipt} disabled={downloadingReceipt}>
            {downloadingReceipt ? <span className="button-spinner" aria-hidden="true" /> : <ReceiptText size={18} />}
            {downloadingReceipt ? "Preparing receipt..." : "Download Receipt"}
          </button>
        )}
        <button type="button" className="secondary-action" onClick={handleReturnHome}>
          <Home size={18} />
          Return Home
        </button>
      </div>
      {downloadError && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 14, fontWeight: 700, marginTop: 12 }}>
          {downloadError}
        </p>
      )}
    </section>
  );
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
