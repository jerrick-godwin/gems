import assert from "node:assert/strict";
import test from "node:test";
import { isImpersonationReadyMessage, isImpersonationStartMessage } from "./impersonationMessages";

test("impersonation messages require matching nonces and complete payloads", () => {
  assert.equal(isImpersonationReadyMessage({ type: "gems:impersonation-ready", requestId: "right" }, "right"), true);
  assert.equal(isImpersonationReadyMessage({ type: "gems:impersonation-ready", requestId: "wrong" }, "right"), false);
  assert.equal(isImpersonationStartMessage({ type: "gems:impersonation-start", requestId: "right", customToken: "token", userId: "user", email: "u@example.com" }, "right"), true);
  assert.equal(isImpersonationStartMessage({ type: "gems:impersonation-start", requestId: "right", customToken: "", userId: "user", email: "u@example.com" }, "right"), false);
});
