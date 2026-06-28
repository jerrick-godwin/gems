import Stripe from "stripe";
import {
  type PaymentIntent,
  type PaymentPurpose,
  type ListingPaymentQuote,
  type ListingSubscriptionPlan
} from "@gems/schemas";

const STRIPE_API_VERSION = "2026-02-25.clover";

const zeroDecimalCurrencies = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF"
]);

let stripeClient: Stripe | undefined;

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
  return (process.env.STRIPE_CURRENCY?.trim().toUpperCase() || "USD") as string;
}

function publicSiteUrl() {
  return process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "") || `http://localhost:${process.env.PORT ?? 4100}`;
}

function stripe() {
  const secretKey = stripeSecretKey();
  if (!secretKey) throw new Error("Payment service is not configured.");
  stripeClient ??= new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION as never,
    appInfo: {
      name: "gemslanka.lk",
      version: "0.1.0"
    }
  });
  return stripeClient;
}

function lkrAmount(amountLkr: number) {
  return String(Math.max(0, Math.round(amountLkr)));
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

function planIntervalCount(intent: PaymentIntent) {
  return intent.quote.plan.validityMonths ?? 1;
}

function recurringPriceData(intent: PaymentIntent, amountLkr: number, name: string, description: string) {
  return {
    currency: stripeCurrency().toLowerCase(),
    unit_amount: stripeAmount(amountLkr),
    recurring: {
      interval: "month" as const,
      interval_count: planIntervalCount(intent)
    },
    product_data: {
      name,
      description
    }
  };
}

function checkoutLineItems(intent: PaymentIntent) {
  const lineItems = [
    {
      quantity: 1,
      price_data: recurringPriceData(
        intent,
        intent.quote.basePriceLkr,
        `${intent.quote.plan.name} listing subscription`,
        `gemslanka.lk listing subscription base plan (${lkrAmount(intent.quote.basePriceLkr)} LKR)`
      )
    }
  ];

  if (intent.quote.extraPhotoCount > 0 && intent.quote.extraPhotoTotalLkr > 0) {
    lineItems.push({
      quantity: 1,
      price_data: recurringPriceData(
        intent,
        intent.quote.extraPhotoTotalLkr,
        `${intent.quote.extraPhotoCount} extra listing ${intent.quote.extraPhotoCount === 1 ? "photo" : "photos"}`,
        `Recurring extra listing photo allowance (${lkrAmount(intent.quote.extraPhotoTotalLkr)} LKR)`
      )
    });
  }

  return lineItems;
}

export async function createStripeCheckoutSession(intent: PaymentIntent, customerEmail?: string) {
  const siteUrl = publicSiteUrl();
  const normalizedCustomerEmail = customerEmail?.trim();
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    client_reference_id: intent.id,
    customer_email: normalizedCustomerEmail || undefined,
    success_url: `${siteUrl}/api/v1/payments/stripe/${intent.id}/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/api/v1/payments/stripe/${intent.id}/cancel`,
    metadata: {
      paymentIntentId: intent.id,
      listingId: intent.listingId,
      subscriptionId: intent.subscriptionId ?? "",
      planId: intent.planId
    },
    subscription_data: {
      metadata: {
        paymentIntentId: intent.id,
        listingId: intent.listingId,
        listingSubscriptionId: intent.subscriptionId ?? "",
        planId: intent.planId
      }
    },
    line_items: checkoutLineItems(intent)
  }, {
    idempotencyKey: intent.id
  });

  if (!session.id || !session.url) throw new Error("Payment service did not return a checkout URL.");
  return {
    gatewayReference: session.id,
    stripeCheckoutSessionId: session.id,
    paymentUrl: session.url
  };
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  const paymentStatus = session.payment_status;
  const status =
    session.status === "expired" ? "expired" as const :
    paymentStatus === "paid" ? "succeeded" as const :
    session.status === "complete" ? "pending" as const :
    "failed" as const;

  return {
    status,
    reference: stripeId(session.subscription) ?? session.id,
    stripeCheckoutSessionId: session.id,
    stripeSubscriptionId: stripeId(session.subscription),
    stripeCustomerId: stripeId(session.customer),
    stripeInvoiceId: stripeId((session as any).invoice)
  };
}

export function constructStripeWebhookEvent(payload: Buffer, signature: string | string[] | undefined) {
  const webhookSecret = stripeWebhookSecret();
  const stripeSignature = Array.isArray(signature) ? signature[0] : signature;
  if (!webhookSecret) throw new Error("Payment notification secret is not configured.");
  if (!stripeSignature) throw new Error("Payment notification signature is missing.");
  return stripe().webhooks.constructEvent(payload, stripeSignature, webhookSecret);
}

export async function retrieveStripeInvoiceUrl(invoiceId: string) {
  try {
    const invoice = await stripe().invoices.retrieve(invoiceId) as any;
    // Prefer invoice_pdf (available when invoice is finalized)
    if (invoice.invoice_pdf) return invoice.invoice_pdf as string;
    // Fall back to the charge's receipt_url
    const charge = await findStripeInvoiceReceiptCharge(invoice);
    if (charge?.receipt_url) return charge.receipt_url as string;
    return undefined;
  } catch (error) {
    console.warn("Failed to retrieve Stripe invoice:", error);
    return undefined;
  }
}

export async function retrieveStripeReceiptPdf(invoiceId: string) {
  try {
    const invoice = await stripe().invoices.retrieve(invoiceId) as any;

    // Prefer the invoice PDF URL (available when invoice is finalized)
    if (invoice.invoice_pdf) {
      const response = await fetch(invoice.invoice_pdf);
      if (response.ok) {
        const fileNameBase = invoice.number ?? invoice.id;
        return {
          data: Buffer.from(await response.arrayBuffer()),
          contentType: response.headers.get("content-type") ?? "application/pdf",
          fileName: `receipt-${String(fileNameBase).replace(/[^a-z0-9._-]/gi, "-")}.pdf`
        };
      }
    }

    // Fall back to the charge receipt URL
    const charge = await findStripeInvoiceReceiptCharge(invoice);
    if (charge?.receipt_url) {
      const receiptUrl = charge.receipt_url as string;
      const response = await fetch(receiptUrl);
      if (response.ok) {
        const fileNameBase = (charge as any).receipt_number ?? invoice.number ?? invoice.id;
        return {
          data: Buffer.from(await response.arrayBuffer()),
          contentType: response.headers.get("content-type") ?? "text/html",
          fileName: `receipt-${String(fileNameBase).replace(/[^a-z0-9._-]/gi, "-")}.html`
        };
      }
    }

    return undefined;
  } catch (error) {
    console.warn("Failed to retrieve Stripe receipt PDF:", error);
    return undefined;
  }
}

async function findStripeInvoiceReceiptCharge(invoice: any) {
  const directCharge = await resolveStripeCharge(invoice.charge);
  if (directCharge?.receipt_url) return directCharge;

  const invoicePaymentCharge = await findStripeReceiptChargeInInvoicePayments(invoice.payments?.data);
  if (invoicePaymentCharge?.receipt_url) return invoicePaymentCharge;

  const listedInvoicePayments = await stripe().invoicePayments.list({
    invoice: invoice.id,
    status: "paid",
    limit: 10
  });
  const listedPaymentCharge = await findStripeReceiptChargeInInvoicePayments(listedInvoicePayments.data);
  if (listedPaymentCharge?.receipt_url) return listedPaymentCharge;

  const paymentIntentCharge = await findStripeReceiptChargeForPaymentIntent(invoice.payment_intent);
  if (paymentIntentCharge?.receipt_url) return paymentIntentCharge;

  return undefined;
}

async function findStripeReceiptChargeInInvoicePayments(payments: any[] | undefined) {
  for (const invoicePayment of payments ?? []) {
    const payment = invoicePayment.payment ?? {};
    const charge = await resolveStripeCharge(payment.charge);
    if (charge?.receipt_url) return charge;

    const paymentIntentCharge = await findStripeReceiptChargeForPaymentIntent(payment.payment_intent);
    if (paymentIntentCharge?.receipt_url) return paymentIntentCharge;
  }

  return undefined;
}

async function findStripeReceiptChargeForPaymentIntent(paymentIntent: any) {
  const paymentIntentObject = typeof paymentIntent === "string"
    ? await stripe().paymentIntents.retrieve(paymentIntent, { expand: ["latest_charge"] }) as any
    : paymentIntent;

  if (!paymentIntentObject) return undefined;

  const latestCharge = await resolveStripeCharge(paymentIntentObject.latest_charge);
  if (latestCharge?.receipt_url) return latestCharge;

  if (typeof paymentIntentObject.id === "string") {
    const charges = await stripe().charges.list({ payment_intent: paymentIntentObject.id, limit: 10 });
    return charges.data.find((charge) => charge.receipt_url);
  }

  return undefined;
}

async function resolveStripeCharge(charge: any) {
  if (!charge) return undefined;
  if (typeof charge === "string") return stripe().charges.retrieve(charge);
  return charge;
}

export async function setStripeSubscriptionCancelAtPeriodEnd(stripeSubscriptionId: string) {
  await stripe().subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
}

function stripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return undefined;
}
