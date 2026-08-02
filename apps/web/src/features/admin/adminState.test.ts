import assert from "node:assert/strict";
import test from "node:test";
import type { AdminModerationSnapshot } from "@gems/api-client";
import type { Listing } from "@gems/schemas";
import { classifyAdminListing, parseAdminLocation, resolveAdminDeepLink } from "./adminState";

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "listing-1",
    sellerId: "seller-1",
    gemTypeId: "ruby",
    title: "Ruby",
    description: "",
    priceLkr: 1000,
    negotiable: false,
    location: "Colombo",
    status: "live",
    moderationStatus: "approved",
    attributes: { carat: 1, dimensions: "", shape: "", cut: "", color: "red", clarity: "", origin: "Sri Lanka", treatment: "untreated", certificateStatus: "none" },
    media: [],
    promoted: [],
    campaigns: [],
    stats: { views: 0, saves: 0, phoneReveals: 0, chats: 0, whatsappClicks: 0 },
    ...overrides
  };
}

test("admin locations map exact records and section queries", () => {
  assert.deepEqual(parseAdminLocation("/admin/reports/report%201"), { view: "moderation", target: { kind: "report", id: "report 1" } });
  assert.deepEqual(parseAdminLocation("/admin/listings/listing-1"), { view: "listings", target: { kind: "listing", id: "listing-1" } });
  assert.deepEqual(parseAdminLocation("/admin/subscriptions/sub-1"), { view: "payments", target: { kind: "subscription", id: "sub-1" } });
  assert.deepEqual(parseAdminLocation("/admin", "?view=users"), { view: "users" });
});

test("listing classification gives rejected and archived states precedence", () => {
  const now = new Date("2026-08-02T12:00:00Z");
  assert.equal(classifyAdminListing(listing(), now), "live");
  assert.equal(classifyAdminListing(listing({ status: "pending_review", moderationStatus: "queued", subscription: { id: "s", listingId: "listing-1", planId: "p", status: "active", source: "paid", autoRenew: true } }), now), "queued");
  assert.equal(classifyAdminListing(listing({ status: "draft", moderationStatus: "not_submitted" }), now), "unpaid");
  assert.equal(classifyAdminListing(listing({ status: "paused" }), now), "archived");
  assert.equal(classifyAdminListing(listing({ status: "rejected", moderationStatus: "rejected" }), now), "rejected");
  assert.equal(classifyAdminListing(listing({ status: "expired", subscription: { id: "s", listingId: "listing-1", planId: "p", status: "expired", source: "trial", autoRenew: false } }), now), "archived");
});

test("queued listing deep links resolve to moderation", () => {
  const queued = listing({ status: "pending_review", moderationStatus: "queued", subscription: { id: "s", listingId: "listing-1", planId: "p", status: "active", source: "paid", autoRenew: true } });
  const snapshot = { listings: [queued], liveListings: [], reports: [], payments: [] } as unknown as AdminModerationSnapshot;
  assert.deepEqual(resolveAdminDeepLink(snapshot, { kind: "listing", id: queued.id }), { view: "moderation", found: true });
  assert.deepEqual(resolveAdminDeepLink(snapshot, { kind: "listing", id: "missing" }), { view: "listings", found: false });
});
