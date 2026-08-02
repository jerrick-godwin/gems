import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { isAdminDocumentPath } from "./admin-routing.js";
import { assertValidTrialExtension, planSitewideTrialExtensions } from "./user-repository.js";

test("nested admin paths resolve to the admin document", () => {
  assert.equal(isAdminDocumentPath("/admin"), true);
  assert.equal(isAdminDocumentPath("/admin/reports/report-1"), true);
  assert.equal(isAdminDocumentPath("/administrator"), false);
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const vercel = JSON.parse(readFileSync(resolve(webRoot, "vercel.json"), "utf8")) as { routes: Array<{ src?: string; dest?: string }> };
  const route = vercel.routes.find((candidate) => candidate.dest === "/admin.html");
  assert.ok(route?.src && new RegExp(route.src).test("/admin/listings/listing-1"));
});

test("the account surface renders marketplace content for isolated impersonation", () => {
  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const appSource = readFileSync(resolve(webRoot, "src/App.tsx"), "utf8");
  assert.match(appSource, /view === "market" && \(\s*<Marketplace/);
});

test("individual trial extensions reject invalid, past, and non-increasing dates", () => {
  assert.throws(() => assertValidTrialExtension(new Date("invalid")), /Valid trial end date/);
  assert.throws(() => assertValidTrialExtension(new Date(Date.now() - 60_000)), /current date and time/);
  const current = new Date(Date.now() + 86_400_000 * 10);
  assert.throws(() => assertValidTrialExtension(new Date(current.getTime() - 1), current), /current trial end date/);
  assert.doesNotThrow(() => assertValidTrialExtension(new Date(current.getTime() + 1), current));
});

test("sitewide trial planning preserves later expiries", () => {
  const requested = new Date("2030-06-01T00:00:00Z");
  const later = new Date("2030-07-01T00:00:00Z");
  const plan = planSitewideTrialExtensions([
    { id: "short", trialEndsAt: new Date("2030-05-01T00:00:00Z") },
    { id: "long", trialEndsAt: later }
  ], requested);
  assert.equal(plan.extendedCount, 1);
  assert.equal(plan.preservedCount, 1);
  assert.equal(plan.users.find((user) => user.id === "long")?.effectiveEndsAt.toISOString(), later.toISOString());
});
