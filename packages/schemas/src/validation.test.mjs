import assert from "node:assert/strict";
import test from "node:test";
import { orderStatuses, validateCheckoutRequest } from "./index.ts";

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

test("checkout request accepts complete direct bank transfer details", () => {
  assert.deepEqual(validateCheckoutRequest({
    billingDetails: validDetails,
    deliveryDetails: validDetails,
    paymentMethod: "direct_bank_transfer"
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
  assert.ok(errors.some((error) => error.includes("direct bank transfer")));
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
