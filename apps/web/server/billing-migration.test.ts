import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("./db/migrations/0017_billing_foundation.sql", import.meta.url),
  "utf8"
);

test("billing migration creates replay, retry, invoice, and audit records", () => {
  for (const table of ["billing_invoices", "stripe_webhook_events", "billing_operations", "admin_audit_logs"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  }
  assert.match(migration, /"id" varchar PRIMARY KEY NOT NULL,[\s\S]*?"type" varchar NOT NULL,[\s\S]*?"event_created" bigint NOT NULL/);
});

test("successful legacy attempts are backfilled once into immutable invoice identities", () => {
  assert.match(migration, /INSERT INTO "billing_invoices"[\s\S]*?FROM "payment_intents" AS payment/);
  assert.match(migration, /WHERE payment\."status" = 'succeeded'[\s\S]*?payment\."stripe_invoice_id" IS NOT NULL/);
  assert.match(migration, /ON CONFLICT \("stripe_invoice_id"\) DO NOTHING/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_stripe_invoice_id_unique"[\s\S]*?ON "billing_invoices" \("stripe_invoice_id"\)/
  );
});

test("invoice ordering metadata and legacy period-end cancellations are backfilled", () => {
  assert.match(migration, /"last_stripe_event_created" bigint/);
  assert.match(migration, /"last_stripe_event_id" varchar/);
  assert.match(migration, /ALTER TABLE "billing_invoices" ADD COLUMN IF NOT EXISTS "last_stripe_event_created" bigint/);
  assert.match(migration, /ALTER TABLE "billing_invoices" ADD COLUMN IF NOT EXISTS "last_stripe_event_id" varchar/);

  const cancellationBackfill = migration.match(
    /UPDATE "listing_subscriptions"\s+SET "cancel_at_period_end" = true[\s\S]*?--> statement-breakpoint/
  )?.[0];
  assert.ok(cancellationBackfill);
  assert.match(cancellationBackfill, /"status" = 'active'/);
  assert.match(cancellationBackfill, /"auto_renew" = false/);
  assert.doesNotMatch(cancellationBackfill, /cancelled_at/, "legacy cancellation timestamps must not exclude period-end cancellations");
});

test("billing identities and the one-subscription-per-listing invariant are unique", () => {
  const requiredUniqueIndexes = [
    ["users_stripe_customer_id_unique", "users", "stripe_customer_id"],
    ["listing_subscriptions_listing_id_unique", "listing_subscriptions", "listing_id"],
    ["listing_subscriptions_stripe_subscription_id_unique", "listing_subscriptions", "stripe_subscription_id"],
    ["payment_intents_stripe_checkout_session_id_unique", "payment_intents", "stripe_checkout_session_id"],
    ["billing_invoices_stripe_invoice_id_unique", "billing_invoices", "stripe_invoice_id"]
  ] as const;

  for (const [name, table, column] of requiredUniqueIndexes) {
    assert.match(
      migration,
      new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS "${name}"[\\s\\S]*?ON "${table}" \\(\\"${column}\\"\\)`),
      `${table}.${column} must have a safe unique index`
    );
  }
});
