import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GemsAdminApiClient } from "@gems/api-client";
import type { BillingHistoryPage, BillingInvoice, PaymentAttempt } from "@gems/schemas";
import { hasDatabase } from "../../../server/db/index.js";
import { updateListingModeration, updateListingStatus } from "../../../server/marketplace-repository.js";
import { extendUserTrial } from "../../../server/user-repository.js";
import {
  invoiceNeedsAttention,
  matchesBillingInvoice,
  mergeBillingHistory,
  normalizeBillingSummary
} from "./adminBilling.js";

const source = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const attempt = (id: string, createdAt: string): PaymentAttempt => ({
  id,
  userId: "user-1",
  listingId: "listing-1",
  purpose: "listing_subscription",
  status: "pending",
  planId: "basic",
  quote: {
    plan: {
      id: "basic",
      name: "Basic",
      priceLkr: 1000,
      includedPhotos: 1,
      extraPhotoPriceLkr: 100,
      validityMonths: 1,
      eyebrow: "Basic",
      summary: "Basic plan"
    },
    photoCount: 1,
    extraPhotoCount: 0,
    basePriceLkr: 1000,
    extraPhotoTotalLkr: 0,
    totalLkr: 1000
  },
  amountLkr: 1000,
  currency: "LKR",
  gateway: "stripe",
  policyVersion: "2026-01",
  policyAcceptedAt: createdAt,
  createdAt,
  updatedAt: createdAt
});

const invoice = (id: string, status: BillingInvoice["status"], createdAt: string): BillingInvoice => ({
  id,
  userId: "user-1",
  listingId: "listing-1",
  purpose: "listing_subscription_renewal",
  status,
  amountLkr: 1000,
  chargedAmountMinor: 100000,
  chargedCurrency: "lkr",
  stripeInvoiceId: `in_${id}`,
  livemode: false,
  createdAt,
  updatedAt: createdAt
});

test("mergeBillingHistory de-duplicates records and keeps newest first", () => {
  const current: BillingHistoryPage = {
    attempts: [attempt("attempt-1", "2026-01-01T00:00:00.000Z")],
    invoices: [invoice("invoice-1", "open", "2026-01-01T00:00:00.000Z")],
    nextCursor: "old"
  };
  const next: BillingHistoryPage = {
    attempts: [attempt("attempt-2", "2026-02-01T00:00:00.000Z")],
    invoices: [
      invoice("invoice-1", "paid", "2026-01-01T00:00:00.000Z"),
      invoice("invoice-2", "failed", "2026-02-01T00:00:00.000Z")
    ]
  };

  const merged = mergeBillingHistory(current, next);
  assert.deepEqual(merged.attempts.map(({ id }) => id), ["attempt-2", "attempt-1"]);
  assert.deepEqual(merged.invoices.map(({ id }) => id), ["invoice-2", "invoice-1"]);
  assert.equal(merged.invoices[1]?.status, "paid");
  assert.equal(merged.nextCursor, undefined);
});

test("invoice attention and search include failure and marketplace context", () => {
  const failed = {
    ...invoice("invoice-1", "action_required", "2026-01-01T00:00:00.000Z"),
    failureCode: "card_declined",
    failureMessage: "Authentication required"
  };
  assert.equal(invoiceNeedsAttention(failed), true);
  assert.equal(invoiceNeedsAttention(invoice("invoice-2", "paid", "2026-01-01T00:00:00.000Z")), false);
  assert.equal(matchesBillingInvoice(failed, "CARD_DECLINED"), true);
  assert.equal(matchesBillingInvoice(failed, "blue sapphire", { listingTitle: "Blue Sapphire" }), true);
  assert.equal(matchesBillingInvoice(failed, "ruby"), false);
});

test("normalizeBillingSummary accepts the current subscription-only action response", () => {
  const summary = normalizeBillingSummary({
    id: "subscription-1",
    userId: "user-1",
    listingId: "listing-1",
    planId: "basic",
    status: "active",
    source: "paid",
    autoRenew: false,
    cancelAtPeriodEnd: true,
    graceEndsAt: "2026-03-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });
  assert.equal(summary.subscription?.id, "subscription-1");
  assert.equal(summary.graceEndsAt, "2026-03-01T00:00:00.000Z");
});

test("audit history is exposed through the server, authenticated client, and admin UI", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestHeaders = new Headers();
  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ items: [], nextCursor: "next-audit-page" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const client = new GemsAdminApiClient("https://admin.example/api/v1");
    const page = await client.auditLogs("admin-token", { cursor: "audit cursor", limit: 25 });
    assert.deepEqual(page, { items: [], nextCursor: "next-audit-page" });
    assert.equal(requestUrl, "https://admin.example/api/v1/admin/audit?cursor=audit+cursor&limit=25");
    assert.equal(requestHeaders.get("authorization"), "Bearer admin-token");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const server = source("server/server.ts");
  const consoleSource = source("src/features/admin/AdminConsole.tsx");
  const panel = source("src/features/admin/AdminAuditPanel.tsx");
  assert.match(server, /request\.method === "GET" && path === "\/api\/v1\/admin\/audit"/);
  assert.match(server, /getAdminAuditLogs\(\{/);
  assert.match(consoleSource, /type AdminView = [^;]*"audit"/);
  assert.match(consoleSource, /label="Audit history" view="audit"/);
  assert.match(consoleSource, /activeView === "audit" && <AdminAuditPanel api=\{api\} token=\{token\}/);
  assert.match(panel, /api\.auditLogs\(token, \{ limit: 50 \}\)/);
});

test("archival wording and optimistic state retain billing and report history", () => {
  const activeListingRow = source("src/features/admin/ActiveListingRow.tsx");
  const reportRow = source("src/features/admin/ReportRow.tsx");
  const consoleSource = source("src/features/admin/AdminConsole.tsx");
  const repository = source("server/marketplace-repository.ts");

  assert.match(activeListingRow, /Archive and unpublish/);
  assert.match(activeListingRow, /Billing history is retained/);
  assert.match(activeListingRow, /const archived = await api\.removeListing\(token, listing\.id\);[\s\S]*?onUpdate\(archived\)/);
  assert.doesNotMatch(activeListingRow, /completely remove[\s\S]*cannot be undone/i);
  assert.match(reportRow, /Archive and unpublish[\s\S]*Billing and report history will be retained/);
  assert.match(reportRow, /const archived = await api\.removeListing\(token, listing\.id\);[\s\S]*?onRemoveListing\(archived\)/);
  assert.doesNotMatch(reportRow, /deletes it from the database/i);

  const updateStart = consoleSource.indexOf("  const updateListingSnapshot");
  const updateEnd = consoleSource.indexOf("\n\n  return (", updateStart);
  assert.ok(updateStart >= 0 && updateEnd > updateStart, "listing snapshot updater must remain present");
  const snapshotUpdater = consoleSource.slice(updateStart, updateEnd);
  assert.match(snapshotUpdater, /reportedListings: snapshot\.reportedListings\.map/);
  assert.doesNotMatch(snapshotUpdater, /reports\s*:/);

  const archiveStart = repository.indexOf("export async function removeListing");
  const archiveEnd = repository.indexOf("export async function resolveReport", archiveStart);
  assert.ok(archiveStart >= 0 && archiveEnd > archiveStart, "archive implementation must remain present");
  const archiveImplementation = repository.slice(archiveStart, archiveEnd);
  assert.match(archiveImplementation, /status: "paused"/);
  assert.match(archiveImplementation, /listing\.status = "paused"/);
  assert.doesNotMatch(archiveImplementation, /delete\(listingTable\)|update\(reportTable\)|database\.reports\s*=/);
});

test("legacy admin invoice links route live and test payments to the matching Stripe dashboard", () => {
  const expectedModeAwarePath = '${payment.livemode ? "" : "test/"}invoices/${payment.stripeInvoiceId}';
  for (const path of ["src/features/admin/ActiveListingRow.tsx", "src/features/admin/ReviewRow.tsx"]) {
    const row = source(path);
    assert.ok(row.includes(expectedModeAwarePath), `${path} must select the Stripe dashboard mode from payment.livemode`);
    assert.doesNotMatch(row, /dashboard\.stripe\.com\/invoices\/\$\{payment\.stripeInvoiceId\}/);
  }
});

test("trial extensions reject non-future dates before looking up user state", async () => {
  await assert.rejects(
    () => extendUserTrial("missing-user", new Date(Date.now() - 60_000)),
    /Trial end date must be in the future/
  );

  const consoleSource = source("src/features/admin/AdminConsole.tsx");
  assert.match(consoleSource, /min=\{minimumTrialEndDate\(trial\?\.endsAt\)\}/);
  assert.match(consoleSource, /tomorrow\.setDate\(tomorrow\.getDate\(\) \+ 1\)/);
});

test("paginated billing search does not merge the unbounded legacy payment snapshot", () => {
  const panel = source("src/features/admin/AdminBillingPanel.tsx");
  assert.match(panel, /const attempts = history\?\.attempts \?\? payments;/);
  assert.doesNotMatch(panel, /mergePaymentAttempts/);
  assert.match(panel, /loadBillingHistory\.call\(api, token, \{ limit: 50, search: search\.trim\(\) \|\| undefined \}\)/);
  assert.match(panel, /cursor: history\.nextCursor, limit: 50, search: search\.trim\(\) \|\| undefined/);

  const repository = source("server/user-repository.ts");
  const queryStart = repository.indexOf("async function queryBillingHistory");
  const queryEnd = repository.indexOf("function encodeBillingCursor", queryStart);
  assert.ok(queryStart >= 0 && queryEnd > queryStart, "billing history query must remain present");
  const query = repository.slice(queryStart, queryEnd);
  assert.ok(query.indexOf("const search = filters.search?.trim();") < query.indexOf("const [attemptRows, invoiceRows]"));
  assert.match(query, /attemptConditions\.push\(sql`/);
  assert.match(query, /invoiceConditions\.push\(sql`/);
  assert.match(query, /nextCursor: combined\.length > limit && lastEntry \? encodeBillingCursor/);
});

test("memory-mode moderation and publication fail closed without billing state", async (context) => {
  if (hasDatabase) {
    context.skip("memory-mode contract requires DATABASE_URL to be unset");
    return;
  }

  await assert.rejects(
    () => updateListingModeration("listing-without-database", "approve"),
    /PostgreSQL billing state is required to approve a listing/
  );
  await assert.rejects(
    () => updateListingStatus("listing-without-database", "live"),
    /PostgreSQL billing state is required to publish a listing/
  );
});
