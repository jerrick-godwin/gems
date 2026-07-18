import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { stripeInvoiceSnapshot, stripeSubscriptionSnapshot } from "./stripe.js";

const minute = 60;

test("stripeInvoiceSnapshot reads Clover subscription metadata and line-item service periods", () => {
  const invoice = {
    id: "in_clover_123",
    parent: {
      type: "subscription_details",
      subscription_details: {
        subscription: "sub_clover_123",
        metadata: {
          paymentIntentId: "attempt-123",
          listingSubscriptionId: "listing-subscription-123"
        }
      }
    },
    // Clover no longer uses this legacy field as the authoritative subscription link.
    subscription: "sub_legacy_should_not_win",
    customer: { id: "cus_123" },
    status: "paid",
    amount_paid: 125_000,
    amount_due: 125_000,
    total: 125_000,
    currency: "lkr",
    hosted_invoice_url: "https://invoice.stripe.test/in_clover_123",
    invoice_pdf: "https://invoice.stripe.test/in_clover_123.pdf",
    lines: {
      data: [
        { period: { start: 1_800_000_000 + minute, end: 1_802_000_000 } },
        { period: { start: 1_800_000_000, end: 1_803_000_000 } }
      ]
    },
    period_start: 1_799_000_000,
    period_end: 1_804_000_000,
    status_transitions: { paid_at: 1_800_000_120 },
    last_finalization_error: null,
    billing_reason: "subscription_cycle",
    livemode: false
  } as unknown as Stripe.Invoice;

  const snapshot = stripeInvoiceSnapshot(invoice, "invoice.paid");

  assert.equal(snapshot.stripeInvoiceId, "in_clover_123");
  assert.equal(snapshot.stripeSubscriptionId, "sub_clover_123");
  assert.equal(snapshot.stripeCustomerId, "cus_123");
  assert.equal(snapshot.paymentIntentId, "attempt-123");
  assert.equal(snapshot.listingSubscriptionId, "listing-subscription-123");
  assert.equal(snapshot.status, "paid");
  assert.equal(snapshot.chargedAmountMinor, 125_000);
  assert.equal(snapshot.chargedCurrency, "LKR");
  assert.equal(snapshot.servicePeriodStart?.toISOString(), new Date(1_800_000_000 * 1000).toISOString());
  assert.equal(snapshot.servicePeriodEnd?.toISOString(), new Date(1_803_000_000 * 1000).toISOString());
  assert.equal(snapshot.paidAt?.toISOString(), new Date(1_800_000_120 * 1000).toISOString());
  assert.equal(snapshot.billingReason, "subscription_cycle");
  assert.equal(snapshot.livemode, false);
});

test("stripeInvoiceSnapshot preserves action-required and failure details", () => {
  const invoice = {
    id: "in_action_required",
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: "sub_123", metadata: {} }
    },
    customer: "cus_123",
    status: "open",
    amount_paid: 0,
    amount_due: 75_000,
    total: 75_000,
    currency: "usd",
    hosted_invoice_url: null,
    invoice_pdf: null,
    lines: { data: [] },
    period_start: 1_810_000_000,
    period_end: 1_812_000_000,
    status_transitions: { paid_at: null },
    last_finalization_error: { code: "card_declined", message: "Authentication is required." },
    billing_reason: "subscription_cycle",
    livemode: true
  } as unknown as Stripe.Invoice;

  const snapshot = stripeInvoiceSnapshot(invoice, "invoice.payment_action_required");

  assert.equal(snapshot.status, "action_required");
  assert.equal(snapshot.chargedAmountMinor, 0);
  assert.equal(snapshot.failureCode, "card_declined");
  assert.equal(snapshot.failureMessage, "Authentication is required.");
  assert.equal(snapshot.livemode, true);
});

test("failed invoices persist only the amount Stripe actually collected", () => {
  const invoice = {
    id: "in_partially_paid_failure",
    parent: {
      type: "subscription_details",
      subscription_details: { subscription: "sub_123", metadata: {} }
    },
    customer: "cus_123",
    status: "open",
    amount_paid: 20_000,
    amount_due: 75_000,
    total: 95_000,
    currency: "lkr",
    hosted_invoice_url: null,
    invoice_pdf: null,
    lines: { data: [] },
    period_start: 1_810_000_000,
    period_end: 1_812_000_000,
    status_transitions: { paid_at: null },
    last_finalization_error: null,
    billing_reason: "subscription_cycle",
    livemode: false
  } as unknown as Stripe.Invoice;

  const snapshot = stripeInvoiceSnapshot(invoice, "invoice.payment_failed");
  assert.equal(snapshot.status, "failed");
  assert.equal(snapshot.chargedAmountMinor, 20_000);
  assert.equal(snapshot.failureCode, "payment_failed");
});

test("stripeSubscriptionSnapshot derives the Clover billing period from subscription items", () => {
  const subscription = {
    id: "sub_clover_456",
    customer: { id: "cus_456" },
    status: "trialing",
    cancel_at_period_end: true,
    trial_end: 1_830_000_000,
    metadata: {
      paymentIntentId: "attempt-456",
      listingSubscriptionId: "listing-subscription-456"
    },
    items: {
      data: [
        { current_period_start: 1_820_000_060, current_period_end: 1_824_000_000 },
        { current_period_start: 1_820_000_000, current_period_end: 1_825_000_000 }
      ]
    },
    livemode: false
  } as unknown as Stripe.Subscription;

  const snapshot = stripeSubscriptionSnapshot(subscription);

  assert.equal(snapshot.stripeSubscriptionId, "sub_clover_456");
  assert.equal(snapshot.stripeCustomerId, "cus_456");
  assert.equal(snapshot.status, "trialing");
  assert.equal(snapshot.cancelAtPeriodEnd, true);
  assert.equal(snapshot.currentPeriodStart?.toISOString(), new Date(1_820_000_000 * 1000).toISOString());
  assert.equal(snapshot.currentPeriodEnd?.toISOString(), new Date(1_825_000_000 * 1000).toISOString());
  assert.equal(snapshot.trialEnd?.toISOString(), new Date(1_830_000_000 * 1000).toISOString());
  assert.equal(snapshot.paymentIntentId, "attempt-456");
  assert.equal(snapshot.listingSubscriptionId, "listing-subscription-456");
});
