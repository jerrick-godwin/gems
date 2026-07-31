import assert from "node:assert/strict";
import test from "node:test";
import type { ListingSubscription, PaymentIntent } from "@gems/schemas";
import { effectiveListingPaymentStatus, listingPaymentRecoveryKind } from "./listing-payment-recovery.js";

const now = new Date("2026-07-31T00:00:00.000Z");

function subscription(overrides: Partial<ListingSubscription> = {}): ListingSubscription {
  return {
    id: "sub-1",
    userId: "user-1",
    listingId: "listing-1",
    planId: "plan-1",
    status: "pending_payment",
    source: "paid",
    autoRenew: true,
    paymentIntentId: "pay-1",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function payment(overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: "pay-1",
    userId: "user-1",
    listingId: "listing-1",
    subscriptionId: "sub-1",
    purpose: "listing_subscription",
    status: "pending",
    planId: "plan-1",
    quote: {} as PaymentIntent["quote"],
    amountLkr: 1000,
    currency: "LKR",
    gateway: "stripe",
    policyVersion: "test",
    policyAcceptedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  };
}

test("derives payment-aware listing statuses", () => {
  assert.equal(effectiveListingPaymentStatus(subscription(), [payment()]), "pending");
  assert.equal(effectiveListingPaymentStatus(subscription({ status: "past_due" }), [payment({ status: "succeeded" })]), "failed");
  assert.equal(effectiveListingPaymentStatus(subscription({ status: "cancelled" }), [payment({ status: "cancelled" })]), "required");
  assert.equal(effectiveListingPaymentStatus(subscription({ status: "expired" }), [payment({ status: "expired" })]), "required");
  assert.equal(effectiveListingPaymentStatus(subscription({ status: "active" }), [payment({ status: "succeeded" })]), "paid");
});

test("selects the correct payment recovery path", () => {
  assert.equal(listingPaymentRecoveryKind(subscription(), payment({ paymentUrl: "https://checkout.example/open" }), now), "reuse_checkout");
  assert.equal(listingPaymentRecoveryKind(subscription({ status: "past_due" }), payment({ status: "failed" }), now), "new_checkout");
  assert.equal(listingPaymentRecoveryKind(subscription({ status: "past_due", startsAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-08-31T00:00:00.000Z" }), payment({ status: "succeeded", stripeInvoiceId: "in_1" }), now), "hosted_invoice");
  assert.equal(listingPaymentRecoveryKind(subscription({ status: "expired", startsAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-07-01T00:00:00.000Z" }), payment({ status: "succeeded" }), now), "new_checkout");
  assert.equal(listingPaymentRecoveryKind(subscription({ status: "active", startsAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-08-31T00:00:00.000Z" }), payment({ status: "succeeded" }), now), "not_required");
  assert.equal(listingPaymentRecoveryKind(subscription({ status: "expired", source: "trial" }), undefined, now), "trial_checkout");
});
