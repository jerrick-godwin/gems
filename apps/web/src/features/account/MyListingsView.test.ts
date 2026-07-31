import assert from "node:assert/strict";
import test from "node:test";
import type { Listing, ListingSubscriptionSummary } from "@gems/schemas";
import { deriveAccessStatus, deriveListingStatus } from "./MyListingsView";

const baseListing: Listing = {
  id: "listing-1",
  sellerId: "seller-1",
  gemTypeId: "sapphire",
  title: "Blue Sapphire",
  description: "Test listing",
  priceLkr: 250000,
  negotiable: false,
  location: "Colombo",
  status: "live",
  moderationStatus: "approved",
  attributes: {
    carat: 1,
    dimensions: "1x1",
    shape: "Oval",
    cut: "Brilliant",
    color: "Blue",
    clarity: "Eye clean",
    origin: "Sri Lanka",
    treatment: "untreated",
    certificateStatus: "none"
  },
  media: [],
  promoted: [],
  campaigns: [],
  stats: { views: 0, saves: 0, phoneReveals: 0, chats: 0, whatsappClicks: 0 }
};

const baseSubscription: ListingSubscriptionSummary = {
  id: "subscription-1",
  listingId: baseListing.id,
  planId: "plan-1",
  status: "active",
  source: "paid",
  autoRenew: true,
  expiresAt: "2026-09-30T00:00:00.000Z",
  paymentStatus: "paid"
};

test("listing status gives rejection and moderation changes precedence over payment-independent state", () => {
  assert.equal(deriveListingStatus({ ...baseListing, status: "promoted", moderationStatus: "rejected" }).label, "Rejected");
  assert.equal(deriveListingStatus({ ...baseListing, status: "live", moderationStatus: "needs_changes" }).label, "Changes requested");
  assert.equal(deriveListingStatus({ ...baseListing, status: "promoted", moderationStatus: "approved" }).label, "Promoted");
});

test("listing status presents every supported management state", () => {
  assert.equal(deriveListingStatus(baseListing).label, "Live");
  assert.equal(deriveListingStatus({ ...baseListing, status: "pending_review", moderationStatus: "queued" }).label, "In review");
  assert.equal(deriveListingStatus({ ...baseListing, status: "paused" }).label, "Paused");
  assert.equal(deriveListingStatus({ ...baseListing, status: "draft", moderationStatus: "not_submitted" }).label, "Draft");
  assert.equal(deriveListingStatus({ ...baseListing, status: "expired" }).label, "Closed");
});

test("billing state stays separate and covers failed, pending, trial, renewal, and expiry", () => {
  const now = new Date("2026-07-31T00:00:00.000Z");
  assert.equal(deriveAccessStatus({ ...baseSubscription, paymentStatus: "failed" }, undefined, now).status.label, "Payment required");
  assert.equal(deriveAccessStatus({ ...baseSubscription, status: "pending_payment", paymentStatus: "pending" }, undefined, now).status.label, "Payment pending");
  assert.equal(deriveAccessStatus({ ...baseSubscription, source: "trial", paymentStatus: "paid" }, undefined, now).status.label, "Trial active");
  assert.equal(deriveAccessStatus({ ...baseSubscription, autoRenew: true }, undefined, now).status.label, "Renews automatically");
  assert.equal(deriveAccessStatus({ ...baseSubscription, autoRenew: false }, undefined, now).status.label, "Renewal cancelled");
  assert.equal(deriveAccessStatus({ ...baseSubscription, status: "expired", expiresAt: "2026-06-01T00:00:00.000Z" }, undefined, now).status.label, "Access ended");
});
