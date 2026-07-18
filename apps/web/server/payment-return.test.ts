import assert from "node:assert/strict";
import test from "node:test";
import { paymentReturnLocation } from "./payment-return.js";

test("successful payments return to their receipt", () => {
  assert.equal(
    paymentReturnLocation("intent/with spaces", "succeeded"),
    "/receipt?paymentIntentId=intent%2Fwith%20spaces"
  );
});

test("incomplete payments return to My Listings with a visible notice", () => {
  assert.equal(paymentReturnLocation("intent-1", "scheduled"), "/listings?payment=scheduled&paymentAttemptId=intent-1");
  assert.equal(paymentReturnLocation("intent-1", "pending"), "/listings?payment=pending&paymentAttemptId=intent-1");
  assert.equal(paymentReturnLocation("intent-1", "cancelled"), "/listings?payment=cancelled&paymentAttemptId=intent-1");
  assert.equal(paymentReturnLocation("intent-1", "expired"), "/listings?payment=expired&paymentAttemptId=intent-1");
  assert.equal(paymentReturnLocation("intent-1", "failed"), "/listings?payment=failed&paymentAttemptId=intent-1");
});
