import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PaymentAttempt } from "@gems/schemas";
import {
  PAYMENT_ATTEMPT_MAX_POLLS,
  PAYMENT_ATTEMPT_POLL_INTERVAL_MS,
  paymentReturnReferenceFromSearch,
  pollPaymentAttempt,
  receiptReferenceFromSearch,
  removePaymentReturnParams
} from "./billing.js";
import { customerNavigationPath } from "./customer.js";

const myListingsSource = readFileSync(new URL("../features/account/MyListingsView.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const userRepositorySource = readFileSync(new URL("../../server/user-repository.ts", import.meta.url), "utf8");

function sourceSection(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function attempt(status: PaymentAttempt["status"]): PaymentAttempt {
  return { status } as PaymentAttempt;
}

test("payment reconciliation uses the approved thirty-second bound", () => {
  assert.equal(PAYMENT_ATTEMPT_POLL_INTERVAL_MS, 2_000);
  assert.equal(PAYMENT_ATTEMPT_MAX_POLLS, 15);
});

test("receipt references prefer billing invoices while accepting legacy payment intent links", () => {
  assert.deepEqual(receiptReferenceFromSearch("?billingInvoiceId=invoice-1&paymentIntentId=attempt-1"), {
    kind: "billing-invoice",
    id: "invoice-1"
  });
  assert.deepEqual(receiptReferenceFromSearch("?paymentIntentId=legacy-attempt"), {
    kind: "payment-attempt",
    id: "legacy-attempt"
  });
});

test("receipt navigation preserves its identifier through an authentication transition", () => {
  assert.equal(customerNavigationPath("receipt", { replace: true }, {
    pathname: "/receipt",
    search: "?paymentIntentId=attempt%2Fwith%20spaces",
    hash: ""
  }), "/receipt?paymentIntentId=attempt%2Fwith%20spaces");
  assert.equal(customerNavigationPath("my_listings", {}, {
    pathname: "/receipt",
    search: "?paymentIntentId=attempt-1",
    hash: ""
  }), "/listings");
});

test("payment return parsing keeps an attempt reference and removes transient query parameters", () => {
  assert.deepEqual(paymentReturnReferenceFromSearch("?payment=pending&paymentAttemptId=attempt-1"), {
    result: "pending",
    paymentAttemptId: "attempt-1"
  });
  const url = new URL("https://gemslanka.lk/listings?payment=pending&paymentAttemptId=attempt-1&source=email#billing");
  assert.equal(removePaymentReturnParams(url), "/listings?source=email#billing");
});

test("payment attempt polling stops at a terminal status", async () => {
  const statuses: PaymentAttempt["status"][] = ["pending", "scheduled", "succeeded"];
  let calls = 0;
  const result = await pollPaymentAttempt({
    load: async () => attempt(statuses[calls++]!),
    maxPolls: 6,
    wait: async () => {}
  });
  assert.equal(result.state, "settled");
  assert.equal(result.polls, 3);
  assert.equal(calls, 3);
});

test("payment attempt polling is bounded while a payment remains pending", async () => {
  let calls = 0;
  const result = await pollPaymentAttempt({
    load: async () => {
      calls += 1;
      return attempt("pending");
    },
    maxPolls: 4,
    wait: async () => {}
  });
  assert.equal(result.state, "exhausted");
  assert.equal(result.polls, 4);
  assert.equal(calls, 4);
});

test("a stalled payment status request still respects the polling deadline", { timeout: 500 }, async () => {
  let calls = 0;
  const startedAt = Date.now();
  const result = await pollPaymentAttempt({
    load: () => {
      calls += 1;
      return new Promise<PaymentAttempt>(() => {});
    },
    maxPolls: 2,
    intervalMs: 20,
    requestTimeoutMs: 5,
    wait: async () => {}
  });

  assert.equal(result.state, "exhausted");
  assert.equal(result.polls, 2);
  assert.equal(calls, 2);
  assert.ok(Date.now() - startedAt < 200, "a single unresolved request must not outlive the bounded poll window");
});

test("newer dashboard attempts win over stale billing-history copies", () => {
  const mergeSource = sourceSection(
    myListingsSource,
    "function mergePaymentAttempts",
    "function mergeBillingHistoryPages"
  );

  assert.match(mergeSource, /\[\.\.\.historyAttempts,\s*\.\.\.dashboardPayments\]/);
  assert.match(
    mergeSource,
    /new Date\(attempt\.updatedAt\)\.getTime\(\)\s*>=\s*new Date\(existing\.updatedAt\)\.getTime\(\)/
  );
});

test("customer billing exposes cursor-based load-more independently of listing pages", () => {
  const loadMoreSource = sourceSection(
    myListingsSource,
    "const handleLoadMoreBilling",
    "const handleDownloadReceipt"
  );

  assert.match(loadMoreSource, /api\.billingHistory\(\{\s*cursor:\s*billingHistory\.nextCursor\s*\}\)/);
  assert.match(loadMoreSource, /mergeBillingHistoryPages\(current,\s*nextPage\)/);
  assert.match(
    myListingsSource,
    /\{billingHistory\.nextCursor\s*&&\s*\([\s\S]*?handleLoadMoreBilling\(\)[\s\S]*?Load more billing history/
  );
});

test("renewal invoice failures recover through Billing Portal instead of generic checkout retry", () => {
  const retrySource = sourceSection(
    myListingsSource,
    "function isRetryableInitialPayment",
    "function getPaymentActionLabel"
  );

  assert.match(retrySource, /isAwaitingInitialPayment\(subscription\)/);
  assert.doesNotMatch(retrySource, /invoice|BillingInvoice/);
  assert.match(
    myListingsSource,
    /needsPortalRecovery\s*=\s*Boolean\([\s\S]*?invoice\.status === "failed"[\s\S]*?invoice\.status === "action_required"[\s\S]*?invoice\.status === "uncollectible"/
  );
  assert.match(
    myListingsSource,
    /\{needsPortalRecovery\s*&&\s*\([\s\S]*?handleManageBilling\(\)[\s\S]*?Fix Payment Method/
  );
});

test("signup and password-reset auth detours retain a same-origin receipt returnTo", () => {
  const authHelpersSource = sourceSection(appSource, "function authReturnPath", "const viewSeo");

  assert.match(authHelpersSource, /search\)\.get\("returnTo"\)/);
  assert.match(authHelpersSource, /target\.origin\s*!==\s*location\.origin/);
  assert.match(authHelpersSource, /returnTo=\$\{encodeURIComponent\(returnPath\)\}/);
  assert.match(
    appSource,
    /onNavigate=\{\(nextView\)\s*=>\s*navigateToView\(nextView,\s*\{\s*path:\s*authDetourPath\(nextView,\s*returnPath\)\s*\}\)\}/
  );
  assert.match(appSource, /const navigateWithinAuth\s*=\s*\(nextView: View\)\s*=>\s*navigateToView\(nextView,\s*\{\s*path:\s*authDetourPath\(nextView,\s*returnPath\)\s*\}\)/);
});

test("non-paid customer invoices cannot resolve as receipts", () => {
  const receiptResolverSource = sourceSection(
    userRepositorySource,
    "export async function getBillingInvoiceReceipt(",
    "export async function getAdminBillingInvoiceReceipt("
  );

  assert.match(
    receiptResolverSource,
    /invoice\?\.status === "paid"\s*\?\s*buildPaymentReceiptForInvoice\(invoice\)\s*:\s*undefined/
  );
});
