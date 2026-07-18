import Stripe from "stripe";
import type { PaymentIntent, PaymentStatus } from "@gems/schemas";

const STRIPE_API_VERSION = "2026-02-25.clover";
const checkoutTrialMinimumMs = 48 * 60 * 60 * 1000;
const checkoutTrialSchedulingSafetyMs = 60 * 1000;

const zeroDecimalCurrencies = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"
]);

let stripeClient: Stripe | undefined;

export type StripeCheckoutStatus = PaymentStatus | "scheduled";

export interface StripeInvoiceSnapshot {
  stripeInvoiceId: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  status: "open" | "paid" | "failed" | "action_required" | "uncollectible" | "void";
  chargedAmountMinor: number;
  chargedCurrency: string;
  hostedInvoiceUrl?: string;
  invoicePdfUrl?: string;
  servicePeriodStart?: Date;
  servicePeriodEnd?: Date;
  paidAt?: Date;
  failureCode?: string;
  failureMessage?: string;
  billingReason?: string;
  paymentIntentId?: string;
  listingSubscriptionId?: string;
  livemode: boolean;
}

export interface StripeSubscriptionSnapshot {
  stripeSubscriptionId: string;
  stripeCustomerId?: string;
  status: Stripe.Subscription.Status;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  trialEnd?: Date;
  listingSubscriptionId?: string;
  paymentIntentId?: string;
  livemode: boolean;
}

function stripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY?.trim();
}

function stripePublishableKey() {
  return process.env.STRIPE_PUBLISHABLE_KEY?.trim();
}

function stripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim();
}

function stripeCurrency() {
  return (process.env.STRIPE_CURRENCY?.trim().toUpperCase() || "LKR") as string;
}

function publicSiteUrl() {
  return process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "") || `http://127.0.0.1:${process.env.PORT ?? 4100}`;
}

function stripe() {
  const secretKey = stripeSecretKey();
  if (!secretKey) throw new Error("Payment service is not configured.");
  stripeClient ??= new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION as never,
    appInfo: { name: "gemslanka.lk", version: "0.1.0" }
  });
  return stripeClient;
}

function stripeAmount(amountLkr: number) {
  const currency = stripeCurrency();
  const amount = currency === "LKR" ? amountLkr : convertLkrAmount(amountLkr, currency);
  return zeroDecimalCurrencies.has(currency) ? Math.round(amount) : Math.round(amount * 100);
}

function convertLkrAmount(amountLkr: number, currency: string) {
  const lkrPerUnit = Number(process.env.STRIPE_LKR_PER_UNIT ?? process.env.STRIPE_LKR_PER_USD);
  if (!Number.isFinite(lkrPerUnit) || lkrPerUnit <= 0) {
    throw new Error(`STRIPE_LKR_PER_UNIT is required to convert LKR listing fees to ${currency}.`);
  }
  return amountLkr / lkrPerUnit;
}

export function isStripeConfigured() {
  if (!stripeSecretKey() || !stripePublishableKey()) return false;
  if (stripeCurrency() === "LKR") return true;
  const lkrPerUnit = Number(process.env.STRIPE_LKR_PER_UNIT ?? process.env.STRIPE_LKR_PER_USD);
  return Number.isFinite(lkrPerUnit) && lkrPerUnit > 0;
}

function recurringPriceData(intent: PaymentIntent, amountLkr: number, name: string) {
  return {
    currency: stripeCurrency().toLowerCase(),
    unit_amount: stripeAmount(amountLkr),
    recurring: {
      interval: "month" as const,
      interval_count: intent.quote.plan.validityMonths ?? 1
    },
    product_data: { name }
  };
}

function checkoutLineItems(intent: PaymentIntent): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
    quantity: 1,
    price_data: recurringPriceData(intent, intent.quote.basePriceLkr, `${intent.quote.plan.name} Plan`)
  }];

  if (intent.quote.extraPhotoCount > 0 && intent.quote.extraPhotoTotalLkr > 0) {
    lineItems.push({
      quantity: 1,
      price_data: recurringPriceData(intent, intent.quote.extraPhotoTotalLkr, `Extra Photos (${intent.quote.extraPhotoCount})`)
    });
  }
  return lineItems;
}

export async function createOrRetrieveStripeCustomer(input: {
  userId: string;
  email: string;
  name?: string;
  existingCustomerId?: string;
}) {
  if (input.existingCustomerId) {
    try {
      const customer = await stripe().customers.retrieve(input.existingCustomerId);
      if (!customer.deleted) {
        const email = input.email.trim();
        const name = input.name?.trim() || undefined;
        if (customer.email !== email || (name && customer.name !== name)) {
          await stripe().customers.update(customer.id, { email, name });
        }
        return customer.id;
      }
    } catch (error) {
      if (!(error instanceof Stripe.errors.StripeInvalidRequestError) || error.code !== "resource_missing") throw error;
    }
  }
  const customer = await stripe().customers.create({
    email: input.email.trim(),
    name: input.name?.trim() || undefined,
    metadata: { userId: input.userId }
  }, { idempotencyKey: `gems-customer:${input.userId}` });
  return customer.id;
}

export async function createStripeCheckoutSession(intent: PaymentIntent, options: {
  customerEmail?: string;
  customerId?: string;
  trialEndsAt?: Date;
  cancelToken?: string;
} = {}) {
  const siteUrl = publicSiteUrl();
  const cancelQuery = options.cancelToken ? `?token=${encodeURIComponent(options.cancelToken)}` : "";
  const metadata = {
    paymentIntentId: intent.id,
    listingId: intent.listingId,
    listingSubscriptionId: intent.subscriptionId ?? "",
    planId: intent.planId
  };
  const requestedTrialEnd = options.trialEndsAt?.getTime();
  const scheduledTrialEnd = requestedTrialEnd
    ? new Date(Math.max(requestedTrialEnd, Date.now() + checkoutTrialMinimumMs + checkoutTrialSchedulingSafetyMs))
    : undefined;

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = { metadata };
  if (scheduledTrialEnd) {
    subscriptionData.trial_end = Math.ceil(scheduledTrialEnd.getTime() / 1000);
    subscriptionData.trial_settings = { end_behavior: { missing_payment_method: "cancel" } };
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    client_reference_id: intent.id,
    customer: options.customerId,
    customer_email: options.customerId ? undefined : options.customerEmail?.trim() || undefined,
    payment_method_collection: "always",
    success_url: `${siteUrl}/api/v1/payments/stripe/${intent.id}/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/api/v1/payments/stripe/${intent.id}/cancel${cancelQuery}`,
    metadata,
    subscription_data: subscriptionData,
    line_items: checkoutLineItems(intent)
  }, { idempotencyKey: intent.id });

  if (!session.id || !session.url) throw new Error("Payment service did not return a checkout URL.");
  return {
    gatewayReference: session.id,
    stripeCheckoutSessionId: session.id,
    stripeCustomerId: stripeId(session.customer) ?? options.customerId,
    paymentUrl: session.url,
    scheduledFor: scheduledTrialEnd?.toISOString(),
    livemode: session.livemode
  };
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription", "invoice"] });
  const subscription = objectValue<Stripe.Subscription>(session.subscription);
  const invoice = objectValue<Stripe.Invoice>(session.invoice);
  const status: StripeCheckoutStatus =
    session.status === "expired" ? "expired" :
    session.payment_status === "paid" ? "succeeded" :
    session.status === "complete" && subscription?.status === "trialing" ? "scheduled" :
    session.status === "complete" ? "pending" :
    "failed";

  return {
    status,
    reference: subscription?.id ?? stripeId(session.subscription) ?? session.id,
    stripeCheckoutSessionId: session.id,
    stripeSubscriptionId: subscription?.id ?? stripeId(session.subscription),
    stripeCustomerId: stripeId(session.customer),
    stripeInvoiceId: invoice?.id ?? stripeId(session.invoice),
    scheduledFor: unixDate(subscription?.trial_end)?.toISOString(),
    livemode: session.livemode
  };
}

export async function expireStripeCheckoutSession(sessionId: string) {
  const existing = await stripe().checkout.sessions.retrieve(sessionId);
  if (existing.status === "expired" || existing.status === "complete") return existing;
  return stripe().checkout.sessions.expire(sessionId);
}

export function constructStripeWebhookEvent(payload: Buffer, signature: string | string[] | undefined) {
  const webhookSecret = stripeWebhookSecret();
  const stripeSignature = Array.isArray(signature) ? signature[0] : signature;
  if (!webhookSecret) throw new Error("Payment notification secret is not configured.");
  if (!stripeSignature) throw new Error("Payment notification signature is missing.");
  return stripe().webhooks.constructEvent(payload, stripeSignature, webhookSecret);
}

export async function retrieveStripeInvoiceSnapshot(invoiceId: string) {
  const invoice = await stripe().invoices.retrieve(invoiceId);
  return stripeInvoiceSnapshot(invoice);
}

export async function retrieveLatestStripeInvoiceSnapshot(subscriptionId: string) {
  const invoices = await stripe().invoices.list({ subscription: subscriptionId, limit: 1 });
  return invoices.data[0] ? stripeInvoiceSnapshot(invoices.data[0]) : undefined;
}

export async function retrieveStripeInvoiceSnapshots(subscriptionId: string) {
  const snapshots: StripeInvoiceSnapshot[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe().invoices.list({ subscription: subscriptionId, limit: 100, starting_after: startingAfter });
    snapshots.push(...page.data.map((invoice) => stripeInvoiceSnapshot(invoice)));
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data.at(-1)?.id;
  } while (startingAfter);
  return snapshots.reverse();
}

export function stripeInvoiceSnapshot(invoice: Stripe.Invoice, eventType?: string): StripeInvoiceSnapshot {
  const subscriptionDetails = invoice.parent?.type === "subscription_details"
    ? invoice.parent.subscription_details
    : undefined;
  const periods = invoice.lines.data
    .map((line) => line.period)
    .filter((period): period is { start: number; end: number } => Boolean(period));
  const status = invoiceStatus(invoice, eventType);
  const eventFailure = invoiceFailureFromEvent(eventType);
  return {
    stripeInvoiceId: invoice.id,
    stripeSubscriptionId: stripeId(subscriptionDetails?.subscription),
    stripeCustomerId: stripeId(invoice.customer),
    status,
    chargedAmountMinor: invoice.amount_paid,
    chargedCurrency: invoice.currency.toUpperCase(),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? undefined,
    invoicePdfUrl: invoice.invoice_pdf ?? undefined,
    servicePeriodStart: unixDate(periods.length ? Math.min(...periods.map((period) => period.start)) : invoice.period_start),
    servicePeriodEnd: unixDate(periods.length ? Math.max(...periods.map((period) => period.end)) : invoice.period_end),
    paidAt: unixDate(invoice.status_transitions.paid_at),
    failureCode: invoice.last_finalization_error?.code ?? eventFailure?.code,
    failureMessage: invoice.last_finalization_error?.message ?? eventFailure?.message,
    billingReason: invoice.billing_reason ?? undefined,
    paymentIntentId: subscriptionDetails?.metadata?.paymentIntentId,
    listingSubscriptionId: subscriptionDetails?.metadata?.listingSubscriptionId,
    livemode: invoice.livemode
  };
}

function invoiceFailureFromEvent(eventType?: string) {
  if (eventType === "invoice.payment_action_required") return { code: "payment_action_required", message: "Payment requires customer authentication or another action." };
  if (eventType === "invoice.payment_failed") return { code: "payment_failed", message: "Stripe could not collect this invoice payment." };
  if (eventType === "invoice.finalization_failed") return { code: "finalization_failed", message: "Stripe could not finalize this invoice." };
  if (eventType === "invoice.marked_uncollectible") return { code: "uncollectible", message: "This invoice was marked uncollectible." };
  return undefined;
}

function invoiceStatus(invoice: Stripe.Invoice, eventType?: string): StripeInvoiceSnapshot["status"] {
  if (eventType === "invoice.payment_action_required") return "action_required";
  if (eventType === "invoice.payment_failed" || eventType === "invoice.finalization_failed") return "failed";
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "uncollectible") return "uncollectible";
  if (invoice.status === "void") return "void";
  return "open";
}

export function stripeSubscriptionSnapshot(subscription: Stripe.Subscription): StripeSubscriptionSnapshot {
  const starts = subscription.items.data.map((item) => item.current_period_start).filter(isUnixTime);
  const ends = subscription.items.data.map((item) => item.current_period_end).filter(isUnixTime);
  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: stripeId(subscription.customer),
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodStart: starts.length ? unixDate(Math.min(...starts)) : undefined,
    currentPeriodEnd: ends.length ? unixDate(Math.max(...ends)) : undefined,
    trialEnd: unixDate(subscription.trial_end),
    listingSubscriptionId: subscription.metadata.listingSubscriptionId,
    paymentIntentId: subscription.metadata.paymentIntentId,
    livemode: subscription.livemode
  };
}

export async function retrieveStripeSubscriptionSnapshot(subscriptionId: string) {
  return stripeSubscriptionSnapshot(await stripe().subscriptions.retrieve(subscriptionId));
}

export async function retrieveStripeInvoiceUrl(invoiceId: string) {
  try {
    const invoice = await stripe().invoices.retrieve(invoiceId);
    return invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? undefined;
  } catch (error) {
    console.warn("Failed to retrieve Stripe invoice:", error);
    return undefined;
  }
}

export async function retrieveStripeReceiptPdf(invoiceId: string) {
  try {
    const invoice = await stripe().invoices.retrieve(invoiceId);
    if (!invoice.invoice_pdf) return undefined;
    const response = await fetch(invoice.invoice_pdf);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!response.ok || contentType !== "application/pdf") return undefined;
    const fileNameBase = invoice.number ?? invoice.id;
    return {
      data: Buffer.from(await response.arrayBuffer()),
      contentType: "application/pdf",
      fileName: `receipt-${String(fileNameBase).replace(/[^a-z0-9._-]/gi, "-")}.pdf`
    };
  } catch (error) {
    console.warn("Failed to retrieve Stripe receipt PDF:", error);
    return undefined;
  }
}

export async function setStripeSubscriptionCancelAtPeriodEnd(stripeSubscriptionId: string) {
  return stripeSubscriptionSnapshot(await stripe().subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true }));
}

export async function updateStripeSubscriptionTrialEnd(stripeSubscriptionId: string, trialEndsAt: Date) {
  return stripeSubscriptionSnapshot(await stripe().subscriptions.update(stripeSubscriptionId, {
    trial_end: Math.ceil(trialEndsAt.getTime() / 1000),
    proration_behavior: "none"
  }));
}

export async function cancelStripeTrialSubscription(stripeSubscriptionId: string) {
  const existing = await stripe().subscriptions.retrieve(stripeSubscriptionId);
  if (existing.status === "canceled") return stripeSubscriptionSnapshot(existing);
  return stripeSubscriptionSnapshot(await stripe().subscriptions.cancel(stripeSubscriptionId, { invoice_now: false, prorate: false }));
}

export async function createStripeBillingPortalSession(customerId: string, returnUrl?: string) {
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl ?? `${publicSiteUrl()}/listings`,
    configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim() || undefined
  });
  return { url: session.url };
}

function objectValue<T extends { id: string }>(value: string | T | null | undefined) {
  return value && typeof value === "object" ? value : undefined;
}

function stripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return undefined;
}

function isUnixTime(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function unixDate(value: number | null | undefined) {
  return isUnixTime(value) ? new Date(value * 1000) : undefined;
}
