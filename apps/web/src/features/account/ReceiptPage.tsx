import { AlertCircle, CheckCircle2, Home, Printer, ReceiptText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GemsApiClient } from "@gems/api-client";
import { formatLkr, type PaymentReceipt, type UserDashboard } from "@gems/schemas";
import { StatusState } from "../../shared/StatusState";
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
        setError(nextError instanceof Error ? nextError.message : "Unable to load payment receipt.");
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

  if (loading) {
    return <StatusState title="Preparing receipt" message="Loading your payment receipt." loading />;
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

  const referenceRows = [
    ["Stripe checkout", receipt.stripe.checkoutSessionId],
    ["Stripe subscription", receipt.stripe.subscriptionId],
    ["Stripe invoice", receipt.stripe.invoiceId],
    ["Stripe customer", receipt.stripe.customerId]
  ].filter(([, value]) => Boolean(value));

  return (
    <section className="invoice-panel data-panel receipt-panel" aria-labelledby="receipt-title">
      <div className="invoice-header">
        <div>
          <span className="eyebrow">Payment receipt</span>
          <h1 id="receipt-title">{receipt.receiptNumber}</h1>
          <p>{receipt.listing.title}</p>
        </div>
        <div className="receipt-status">
          <CheckCircle2 size={18} />
          Paid
        </div>
      </div>

      <div className="invoice-meta">
        <div className="address-block">
          <span className="eyebrow">Customer</span>
          <strong>{receipt.customer.name}</strong>
          <span>{receipt.customer.email}</span>
        </div>
        <div className="address-block">
          <span className="eyebrow">Payment</span>
          <strong>{formatDateTime(receipt.paidAt)}</strong>
          <span>{receipt.paymentIntentId}</span>
        </div>
        <div className="address-block">
          <span className="eyebrow">Listing</span>
          <strong>{receipt.listing.title}</strong>
          <span>{receipt.listing.id}</span>
        </div>
        <div className="address-block">
          <span className="eyebrow">Subscription</span>
          <strong>{receipt.subscription.planName}</strong>
          <span>{formatSubscriptionDates(receipt.subscription.startsAt, receipt.subscription.expiresAt)}</span>
        </div>
      </div>

      <div className="receipt-lines" role="table" aria-label="Receipt line items">
        <div className="receipt-line receipt-line-heading" role="row">
          <span role="columnheader">Item</span>
          <span role="columnheader">Qty</span>
          <span role="columnheader">Amount</span>
        </div>
        {receipt.lineItems.map((item) => (
          <div className="receipt-line" role="row" key={item.label}>
            <span role="cell">{item.label}</span>
            <span role="cell">{item.quantity}</span>
            <strong role="cell">{formatLkr(item.amountLkr)}</strong>
          </div>
        ))}
        <div className="receipt-total-row">
          <span>Total paid</span>
          <strong>{formatLkr(receipt.totalLkr)}</strong>
        </div>
      </div>

      {referenceRows.length > 0 && (
        <div className="receipt-references">
          <div className="receipt-reference-title">
            <ReceiptText size={18} />
            Payment references
          </div>
          <dl>
            {referenceRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="receipt-email-note" role="note">
        <AlertCircle size={17} />
        Stripe sends the official receipt or invoice email to {receipt.customer.email} when receipt emails are enabled in Stripe.
      </div>

      <div className="checkout-actions print-action">
        <button type="button" className="secondary-action" onClick={() => window.print()}>
          <Printer size={17} />
          Print
        </button>
        <button type="button" className="secondary-action" onClick={handleReturnHome}>
          <Home size={17} />
          Return Home
        </button>
      </div>
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
