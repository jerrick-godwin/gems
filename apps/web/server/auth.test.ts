import assert from "node:assert/strict";
import test from "node:test";
import { authorizeAdminClaims, parseAdminAllowedEmails } from "./auth.js";

test("parseAdminAllowedEmails normalizes case and whitespace", () => {
  assert.deepEqual(
    [...parseAdminAllowedEmails(" Admin@Example.com,finance@example.com, ADMIN@example.com ")],
    ["admin@example.com", "finance@example.com"]
  );
});

test("authorizeAdminClaims requires the explicit Firebase admin claim", () => {
  assert.throws(
    () => authorizeAdminClaims({ email: "admin@example.com" }, "admin@example.com"),
    /required admin claim/
  );
  assert.throws(
    () => authorizeAdminClaims({ email: "admin@example.com", admin: "true" }, "admin@example.com"),
    /required admin claim/
  );
});

test("authorizeAdminClaims matches ADMIN_ALLOWED_EMAILS case-insensitively", () => {
  assert.deepEqual(
    authorizeAdminClaims(
      { email: "Admin@Example.COM", admin: true },
      "owner@example.com, admin@example.com"
    ),
    { email: "Admin@Example.COM", role: "admin" }
  );
});

test("authorizeAdminClaims rejects missing or unlisted email addresses", () => {
  assert.throws(
    () => authorizeAdminClaims({ email: undefined, admin: true }, "admin@example.com"),
    /missing email claim/
  );
  assert.throws(
    () => authorizeAdminClaims({ email: "other@example.com", admin: true }, "admin@example.com"),
    /not allowed/
  );
  assert.throws(
    () => authorizeAdminClaims({ email: "admin@example.com", admin: true }, ""),
    /allowlist is not configured/
  );
});
