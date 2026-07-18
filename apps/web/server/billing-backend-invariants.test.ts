import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const serverSource = readFileSync(new URL("./server.ts", import.meta.url), "utf8");
const repositorySource = readFileSync(new URL("./user-repository.ts", import.meta.url), "utf8");
const stripeSource = readFileSync(new URL("./stripe.ts", import.meta.url), "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("the webhook route uses the transactional processor and retries in-flight deliveries", () => {
  const route = sourceBetween(
    serverSource,
    'if (request.method === "POST" && path === "/api/v1/payments/stripe/webhook")',
    'if (request.method === "PUT" && path === "/api/v1/storage/local-upload")'
  );

  assert.match(route, /processStripeWebhookEventTransaction\([\s\S]*?\(\) => handleStripeWebhookEvent\(event\)/);
  assert.match(route, /result === "retry"[\s\S]*?sendJson\(response, 503/);
  assert.doesNotMatch(route, /beginStripeWebhookEvent|completeStripeWebhookEvent|releaseStripeWebhookEvent/);
});

test("the webhook processor marks an event only after its handler succeeds", async (context) => {
  if (process.env.DATABASE_URL) {
    context.skip("The isolated behavior check uses the repository's in-memory webhook ledger.");
    return;
  }

  const { processStripeWebhookEventTransaction } = await import("./user-repository.js");
  const input = {
    id: `evt-test-${Date.now()}-${Math.random()}`,
    type: "invoice.paid",
    objectId: "in-test",
    eventCreated: 1_900_000_000
  };
  let calls = 0;

  await assert.rejects(
    processStripeWebhookEventTransaction(input, async () => {
      calls += 1;
      throw new Error("roll back this delivery");
    }),
    /roll back this delivery/
  );
  assert.equal(
    await processStripeWebhookEventTransaction(input, async () => {
      calls += 1;
    }),
    "processed"
  );
  assert.equal(await processStripeWebhookEventTransaction(input, async () => { calls += 1; }), "duplicate");
  assert.equal(calls, 2);
});

test("invoice updates are ordered per invoice and carry Stripe event identity", () => {
  const recorder = sourceBetween(
    repositorySource,
    "export async function recordStripeBillingInvoice",
    "export async function syncStripeSubscriptionSnapshot"
  );

  const orderCheck = recorder.indexOf("const invoiceEventIsOlder");
  const conflictUpdate = recorder.indexOf(".onConflictDoUpdate");
  assert.ok(orderCheck >= 0 && conflictUpdate > orderCheck, "invoice order must be checked before its upsert");
  assert.match(recorder, /const preserveExistingState[\s\S]*?invoiceEventIsOlder/);
  assert.match(recorder, /const invoiceEventFields = stripeEventFields\(eventCreated, eventId/);
  assert.match(recorder, /\.\.\.invoiceEventFields/);

  const invoiceWebhookCalls = [...serverSource.matchAll(
    /recordStripeBillingInvoice\(stripeInvoiceSnapshot\(invoice, event\.type\), event\.created, event\.id\)/g
  )];
  assert.equal(invoiceWebhookCalls.length, 3, "every handled invoice event group must persist its event ID");
});

test("renewal invoices cannot rewrite checkout-attempt status", () => {
  const recorder = sourceBetween(
    repositorySource,
    "export async function recordStripeBillingInvoice",
    "export async function syncStripeSubscriptionSnapshot"
  );
  const paymentAttemptUpdates = [...recorder.matchAll(/await tx\.update\(paymentIntents\)/g)];
  assert.ok(paymentAttemptUpdates.length > 0);

  for (const update of paymentAttemptUpdates) {
    const prefix = recorder.slice(Math.max(0, update.index! - 100), update.index);
    assert.match(prefix, /if \(isInitialInvoice\) \{\s*$/, "payment attempt updates must be initial-invoice-only");
  }
  assert.match(recorder, /paymentAttemptId: existingInvoice\?\.paymentAttemptId \?\? \(isInitialInvoice \? attempt\.id : null\)/);
});

test("pending billing operations have a lease-aware processor and protected cron entry points", () => {
  const processor = sourceBetween(
    repositorySource,
    "export async function processPendingBillingOperations",
    "export async function syncStripeSubscriptionStatus"
  );
  assert.match(processor, /eq\(billingOperations\.status, "pending"\)/);
  assert.match(processor, /status: "processing"/);
  assert.match(processor, /executeBillingOperation\(claimed\.type, claimed\.targetId, claimed\.payload\)/);
  assert.match(processor, /staleProcessingBefore/);

  const cronRoute = sourceBetween(
    serverSource,
    'if (request.method === "GET" && path === "/api/v1/internal/billing-operations")',
    'if (request.method === "POST" && path === "/api/v1/payments/stripe/webhook")'
  );
  assert.match(cronRoute, /CRON_SECRET/);
  assert.match(cronRoute, /readBearerToken\(request\)/);
  assert.match(cronRoute, /processPendingBillingOperations\(50\)/);
  assert.match(serverSource, /setInterval\([\s\S]*?processPendingBillingOperations\(20\)[\s\S]*?60_000/);
});

test("Stripe reconciliation paginates and persists the complete invoice history", () => {
  const listAll = sourceBetween(
    stripeSource,
    "export async function retrieveStripeInvoiceSnapshots",
    "export function stripeInvoiceSnapshot"
  );
  assert.match(listAll, /invoices\.list\(\{ subscription: subscriptionId, limit: 100, starting_after: startingAfter \}\)/);
  assert.match(listAll, /page\.has_more/);
  assert.match(listAll, /startingAfter = page\.data\.at\(-1\)\?\.id/);

  const reconcile = sourceBetween(
    repositorySource,
    "export async function reconcileListingSubscription",
    "export async function getListingBillingSummary"
  );
  assert.match(reconcile, /retrieveStripeInvoiceSnapshots\(stripeSubscriptionId\)/);
  assert.match(reconcile, /for \(const invoice of invoices\) await recordStripeBillingInvoice\(invoice\)/);
  assert.doesNotMatch(reconcile, /retrieveLatestStripeInvoiceSnapshot/);
});
