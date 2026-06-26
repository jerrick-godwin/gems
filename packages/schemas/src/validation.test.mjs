import assert from "node:assert/strict";
import test from "node:test";
import { orderStatuses, quoteListingSubscription, validateCheckoutRequest, validateGemListing } from "./index.ts";

const validDetails = {
  fullName: "Jerrick Godwin",
  email: "buyer@example.com",
  mobile: "+94771234567",
  addressLine1: "42 Gem Street",
  addressLine2: "Suite 2",
  city: "Colombo",
  district: "Western",
  postalCode: "00100",
  country: "Sri Lanka"
};

test("checkout request accepts complete Stripe details", () => {
  assert.deepEqual(validateCheckoutRequest({
    billingDetails: validDetails,
    deliveryDetails: validDetails,
    paymentMethod: "stripe"
  }), []);
});

test("checkout request rejects missing details and unsupported payment methods", () => {
  const errors = validateCheckoutRequest({
    billingDetails: { ...validDetails, fullName: "" },
    deliveryDetails: { ...validDetails, email: "not-an-email" },
    paymentMethod: "card"
  });
  assert.ok(errors.some((error) => error.includes("Billing fullName")));
  assert.ok(errors.some((error) => error.includes("Delivery email is invalid")));
  assert.ok(errors.some((error) => error.includes("Stripe")));
});

test("admin order statuses match the supported workflow", () => {
  assert.deepEqual(orderStatuses, [
    "order_placed",
    "verification_in_progress",
    "verification_failed",
    "dispatch_in_progress",
    "dispatched",
    "delivered",
    "closed",
    "rejected"
  ]);
});

test("listing subscription pricing follows plan photo allowances", () => {
  assert.equal(quoteListingSubscription("basic", 3).totalLkr, 500);
  assert.equal(quoteListingSubscription("basic", 4).totalLkr, 750);
  assert.equal(quoteListingSubscription("pro", 6).totalLkr, 1000);
  assert.equal(quoteListingSubscription("pro", 7).totalLkr, 1500);
  assert.equal(quoteListingSubscription("plus", 10).totalLkr, 20000);
  assert.equal(quoteListingSubscription("plus", 11).totalLkr, 20500);
});

test("gem listing validation allows optional dimensions, shape, and cut", () => {
  assert.deepEqual(validateGemListing({
    title: "Ceylon Blue Sapphire",
    priceLkr: 3500000,
    attributes: {
      carat: 5.4,
      dimensions: "",
      shape: "",
      cut: "",
      color: "Royal blue",
      clarity: "Eye clean",
      origin: "Ratnapura",
      treatment: "untreated",
      certificateStatus: "none"
    },
    media: [{
      id: "media-1",
      listingId: "listing-1",
      kind: "photo",
      url: "https://example.com/gem.jpg",
      alt: "Gem photo",
      order: 0,
      moderationStatus: "not_submitted"
    }]
  }), []);
});
