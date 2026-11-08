import { useEffect, useRef, useState } from "react";
import type { GemsApiClient, InvoicePayment } from "@gems/api-client";
import { publicErrorMessage } from "../../shared/helpers";

type PaymentElement = { mount: (node: HTMLElement) => void; destroy: () => void };
type Elements = { create: (kind: "payment") => PaymentElement };
type StripeClient = {
  elements: (options: { clientSecret: string }) => Elements;
  confirmPayment: (options: { elements: Elements; confirmParams: { return_url: string } }) => Promise<{ error?: { message?: string } }>;
};
let stripeScript: Promise<(key: string) => StripeClient> | undefined;
function loadStripe() {
  stripeScript ??= new Promise<(key: string) => StripeClient>((resolve, reject) => {
    const existing = (window as unknown as { Stripe?: (key: string) => StripeClient }).Stripe;
    if (existing) { resolve(existing); return; }
    const script = document.createElement("script");
    const timer = setTimeout(() => { script.remove(); reject(new Error("Payment form timed out. Please retry.")); }, 15000);
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => {
      clearTimeout(timer);
      const factory = (window as unknown as { Stripe?: (key: string) => StripeClient }).Stripe;
      if (factory) resolve(factory); else reject(new Error("Payment form is unavailable."));
    };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("Unable to load payment form.")); };
    document.head.appendChild(script);
  }).catch(error => { stripeScript = undefined; throw error; });
  return stripeScript;
}

export function InvoicePaymentPage({ api }: { api: GemsApiClient }) {
  const [subscriptionId] = useState(() => new URLSearchParams(window.location.search).get("subscriptionId") ?? "");
  const [returned] = useState(() => new URLSearchParams(window.location.search).get("returned") === "1");
  const [invoice, setInvoice] = useState<InvoicePayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mount = useRef<HTMLDivElement>(null);
  const payment = useRef<{ stripe: StripeClient; elements: Elements }>();
  const submitting = useRef(false);
  useEffect(() => {
    // Stripe may append a client secret. Remove it before navigation or copying URLs.
    window.history.replaceState(null, "", `/listings/pay?subscriptionId=${encodeURIComponent(subscriptionId)}${returned ? "&returned=1" : ""}`);
    if (!subscriptionId) { setError("Missing subscription. Return to My Listings and try again."); return; }
    let active = true;
    let element: PaymentElement | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError(null); setReady(false);
    const open = async () => {
      try {
        const result = await api.invoicePayment(subscriptionId, returned);
        if (!active) return;
        if (result.status === "succeeded") {
          if (!returned) await api.invoicePayment(subscriptionId, true);
          if (active) window.location.replace("/listings?payment=success");
          return;
        }
        if (returned) {
          let checks = 0;
          const check = async () => {
            try {
              const status = await api.invoicePayment(subscriptionId, true);
              if (!active) return;
              if (status.status === "succeeded") { window.location.replace("/listings?payment=success"); return; }
              if (++checks < 5) { timer = setTimeout(check, 2000); return; }
              window.location.replace("/listings?payment=pending");
            } catch (error) { if (active) setError(publicErrorMessage(error, "Unable to verify payment. Your payment has not been marked failed.")); }
          };
          timer = setTimeout(check, 2000);
          return;
        }
        if (result.status !== "pending" || !result.clientSecret || !result.publishableKey) throw new Error("This invoice is not payable. Return to My Listings for its current status.");
        setInvoice(result);
        const factory = await loadStripe();
        if (!active || !mount.current) return;
        const stripe = factory(result.publishableKey);
        const elements = stripe.elements({ clientSecret: result.clientSecret });
        element = elements.create("payment"); element.mount(mount.current);
        payment.current = { stripe, elements }; setReady(true);
      } catch (error) { if (active) setError(publicErrorMessage(error, "Unable to load invoice payment.")); }
    };
    void open();
    return () => { active = false; clearTimeout(timer); element?.destroy(); payment.current = undefined; };
  }, [api, subscriptionId, returned, attempt]);
  const submit = async () => {
    if (!payment.current || submitting.current) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await payment.current.stripe.confirmPayment({ elements: payment.current.elements,
        confirmParams: { return_url: `${window.location.origin}/listings/pay?subscriptionId=${encodeURIComponent(subscriptionId)}&returned=1` } });
      if (result.error) throw new Error(result.error.message ?? "Payment could not be completed.");
    } catch (error) { setError(publicErrorMessage(error, "Unable to complete payment.")); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <section className="card card--spacious">
    <h1>{returned ? "Confirming payment" : "Pay overdue invoice"}</h1>
    {invoice && <p>{new Intl.NumberFormat(undefined, { style: "currency", currency: invoice.currency }).format(invoice.amount / (['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf'].includes(invoice.currency) ? 1 : 100))} due</p>}
    {!ready && !error && <p role="status">{returned ? "Checking your payment status…" : "Loading secure payment form…"}</p>}
    <div ref={mount} />
    {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    {ready && <button type="button" disabled={busy} onClick={() => void submit()}>{busy ? "Processing…" : "Pay invoice"}</button>}
    <p><a href="/listings">Back to My Listings</a></p>
  </section>;
}
