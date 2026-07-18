import assert from "node:assert/strict";
import test from "node:test";
import { createPaymentCancelToken, isValidPaymentCancelToken } from "./user-repository.js";

test("payment cancellation tokens are expiring, signed, and bound to one attempt", (context) => {
  const previousSecret = process.env.PAYMENT_RETURN_SECRET;
  process.env.PAYMENT_RETURN_SECRET = "test-only-payment-return-secret";
  context.after(() => {
    if (previousSecret === undefined) delete process.env.PAYMENT_RETURN_SECRET;
    else process.env.PAYMENT_RETURN_SECRET = previousSecret;
  });

  const token = createPaymentCancelToken("attempt-1", new Date(Date.now() + 60_000));
  assert.equal(isValidPaymentCancelToken("attempt-1", token), true);
  assert.equal(isValidPaymentCancelToken("attempt-2", token), false, "a token cannot cancel a different attempt");

  const [expiry, signature] = token.split(".");
  assert.ok(expiry && signature);
  const tamperedSignature = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
  assert.equal(isValidPaymentCancelToken("attempt-1", `${expiry}.${tamperedSignature}`), false);

  const expired = createPaymentCancelToken("attempt-1", new Date(Date.now() - 1_000));
  assert.equal(isValidPaymentCancelToken("attempt-1", expired), false);
  assert.equal(isValidPaymentCancelToken("attempt-1", "not-a-token"), false);
  assert.equal(isValidPaymentCancelToken("attempt-1", undefined), false);
});
