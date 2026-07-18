ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_customer_id" varchar;
--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" varchar;
--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD COLUMN IF NOT EXISTS "stripe_customer_id" varchar;
--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD COLUMN IF NOT EXISTS "stripe_status" varchar;
--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD COLUMN IF NOT EXISTS "scheduled_conversion_at" timestamp;
--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD COLUMN IF NOT EXISTS "cancel_at_period_end" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD COLUMN IF NOT EXISTS "grace_ends_at" timestamp;
--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD COLUMN IF NOT EXISTS "last_stripe_event_created" bigint;
--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD COLUMN IF NOT EXISTS "last_stripe_event_id" varchar;
--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "stripe_livemode" boolean;
--> statement-breakpoint

-- A listing has one billing lifecycle. Preserve the strongest/current row,
-- repoint dependent history, and remove only superseded subscription shells.
WITH ranked_subscriptions AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "listing_id"
      ORDER BY
        CASE "status"
          WHEN 'active' THEN 0
          WHEN 'past_due' THEN 1
          WHEN 'pending_payment' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        CASE "source" WHEN 'paid' THEN 0 ELSE 1 END,
        "updated_at" DESC,
        "created_at" DESC,
        "id"
    ) AS canonical_id
  FROM "listing_subscriptions"
)
UPDATE "payment_intents" AS payment
SET "subscription_id" = ranked.canonical_id
FROM ranked_subscriptions AS ranked
WHERE payment."subscription_id" = ranked."id"
  AND ranked."id" <> ranked.canonical_id;
--> statement-breakpoint

WITH ranked_subscriptions AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "listing_id"
      ORDER BY
        CASE "status"
          WHEN 'active' THEN 0
          WHEN 'past_due' THEN 1
          WHEN 'pending_payment' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        CASE "source" WHEN 'paid' THEN 0 ELSE 1 END,
        "updated_at" DESC,
        "created_at" DESC,
        "id"
    ) AS canonical_id
  FROM "listing_subscriptions"
)
UPDATE "renewal_events" AS renewal
SET "subscription_id" = ranked.canonical_id
FROM ranked_subscriptions AS ranked
WHERE renewal."subscription_id" = ranked."id"
  AND ranked."id" <> ranked.canonical_id;
--> statement-breakpoint

WITH ranked_subscriptions AS (
  SELECT
    "id",
    "listing_id",
    first_value("id") OVER (
      PARTITION BY "listing_id"
      ORDER BY
        CASE "status"
          WHEN 'active' THEN 0
          WHEN 'past_due' THEN 1
          WHEN 'pending_payment' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        CASE "source" WHEN 'paid' THEN 0 ELSE 1 END,
        "updated_at" DESC,
        "created_at" DESC,
        "id"
    ) AS canonical_id,
    "starts_at",
    "expires_at",
    "updated_at"
  FROM "listing_subscriptions"
), merged_lifecycle AS (
  SELECT
    canonical_id,
    min("starts_at") AS starts_at,
    max("expires_at") AS expires_at,
    max("updated_at") AS updated_at
  FROM ranked_subscriptions
  GROUP BY canonical_id
)
UPDATE "listing_subscriptions" AS subscription
SET
  "starts_at" = coalesce(subscription."starts_at", merged.starts_at),
  "expires_at" = CASE
    WHEN subscription."expires_at" IS NULL THEN merged.expires_at
    WHEN merged.expires_at IS NULL THEN subscription."expires_at"
    ELSE greatest(subscription."expires_at", merged.expires_at)
  END,
  "updated_at" = greatest(subscription."updated_at", merged.updated_at)
FROM merged_lifecycle AS merged
WHERE subscription."id" = merged.canonical_id;
--> statement-breakpoint

WITH preferred_attempts AS (
  SELECT DISTINCT ON ("subscription_id")
    "subscription_id",
    "id" AS payment_attempt_id
  FROM "payment_intents"
  WHERE "subscription_id" IS NOT NULL
  ORDER BY
    "subscription_id",
    CASE "status" WHEN 'succeeded' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
    "updated_at" DESC,
    "created_at" DESC,
    "id"
)
UPDATE "listing_subscriptions" AS subscription
SET "payment_intent_id" = preferred.payment_attempt_id
FROM preferred_attempts AS preferred
WHERE subscription."id" = preferred."subscription_id";
--> statement-breakpoint

WITH ranked_subscriptions AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "listing_id"
      ORDER BY
        CASE "status"
          WHEN 'active' THEN 0
          WHEN 'past_due' THEN 1
          WHEN 'pending_payment' THEN 2
          WHEN 'cancelled' THEN 3
          WHEN 'expired' THEN 4
          ELSE 5
        END,
        CASE "source" WHEN 'paid' THEN 0 ELSE 1 END,
        "updated_at" DESC,
        "created_at" DESC,
        "id"
    ) AS position
  FROM "listing_subscriptions"
)
DELETE FROM "listing_subscriptions" AS subscription
USING ranked_subscriptions AS ranked
WHERE subscription."id" = ranked."id"
  AND ranked.position > 1;
--> statement-breakpoint

-- Promote only customer IDs that have one unambiguous internal owner.
WITH customer_owners AS (
  SELECT
    "stripe_customer_id",
    count(DISTINCT "user_id") AS owner_count
  FROM "payment_intents"
  WHERE "stripe_customer_id" IS NOT NULL
  GROUP BY "stripe_customer_id"
), ranked_customers AS (
  SELECT
    payment."user_id",
    payment."stripe_customer_id",
    row_number() OVER (
      PARTITION BY payment."user_id"
      ORDER BY
        CASE payment."status" WHEN 'succeeded' THEN 0 ELSE 1 END,
        payment."updated_at" DESC,
        payment."created_at" DESC,
        payment."id"
    ) AS position
  FROM "payment_intents" AS payment
  INNER JOIN customer_owners AS owner
    ON owner."stripe_customer_id" = payment."stripe_customer_id"
   AND owner.owner_count = 1
)
UPDATE "users" AS app_user
SET "stripe_customer_id" = customer."stripe_customer_id"
FROM ranked_customers AS customer
WHERE app_user."id" = customer."user_id"
  AND app_user."stripe_customer_id" IS NULL
  AND customer.position = 1;
--> statement-breakpoint

-- Promote only subscription IDs that resolve to one canonical subscription.
WITH subscription_owners AS (
  SELECT
    "stripe_subscription_id",
    count(DISTINCT "subscription_id") AS owner_count
  FROM "payment_intents"
  WHERE "stripe_subscription_id" IS NOT NULL
    AND "subscription_id" IS NOT NULL
  GROUP BY "stripe_subscription_id"
), ranked_stripe_subscriptions AS (
  SELECT
    payment."subscription_id",
    payment."stripe_subscription_id",
    payment."stripe_customer_id",
    row_number() OVER (
      PARTITION BY payment."subscription_id"
      ORDER BY
        CASE payment."status" WHEN 'succeeded' THEN 0 ELSE 1 END,
        payment."updated_at" DESC,
        payment."created_at" DESC,
        payment."id"
    ) AS position
  FROM "payment_intents" AS payment
  INNER JOIN subscription_owners AS owner
    ON owner."stripe_subscription_id" = payment."stripe_subscription_id"
   AND owner.owner_count = 1
  WHERE payment."subscription_id" IS NOT NULL
)
UPDATE "listing_subscriptions" AS subscription
SET
  "stripe_subscription_id" = stripe_subscription."stripe_subscription_id",
  "stripe_customer_id" = coalesce(subscription."stripe_customer_id", stripe_subscription."stripe_customer_id"),
  "stripe_status" = coalesce(
    subscription."stripe_status",
    CASE subscription."status"
      WHEN 'active' THEN 'active'
      WHEN 'past_due' THEN 'past_due'
      WHEN 'pending_payment' THEN 'incomplete'
      WHEN 'cancelled' THEN 'canceled'
      WHEN 'expired' THEN 'incomplete_expired'
      ELSE NULL
    END
  )
FROM ranked_stripe_subscriptions AS stripe_subscription
WHERE subscription."id" = stripe_subscription."subscription_id"
  AND subscription."stripe_subscription_id" IS NULL
  AND stripe_subscription.position = 1;
--> statement-breakpoint

UPDATE "listing_subscriptions"
SET "cancel_at_period_end" = true
WHERE "stripe_subscription_id" IS NOT NULL
  AND "status" = 'active'
  AND "auto_renew" = false;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_invoices" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "listing_id" varchar NOT NULL REFERENCES "listings"("id"),
  "subscription_id" varchar REFERENCES "listing_subscriptions"("id"),
  "payment_attempt_id" varchar REFERENCES "payment_intents"("id"),
  "purpose" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'open',
  "amount_lkr" integer NOT NULL,
  "charged_amount_minor" integer NOT NULL,
  "charged_currency" varchar NOT NULL,
  "stripe_invoice_id" varchar NOT NULL,
  "stripe_customer_id" varchar,
  "stripe_subscription_id" varchar,
  "hosted_invoice_url" text,
  "invoice_pdf_url" text,
  "service_period_start" timestamp,
  "service_period_end" timestamp,
  "paid_at" timestamp,
  "failure_code" varchar,
  "failure_message" text,
  "livemode" boolean NOT NULL DEFAULT false,
  "last_stripe_event_created" bigint,
  "last_stripe_event_id" varchar,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD COLUMN IF NOT EXISTS "last_stripe_event_created" bigint;
--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD COLUMN IF NOT EXISTS "last_stripe_event_id" varchar;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_stripe_invoice_id_unique"
  ON "billing_invoices" ("stripe_invoice_id");
--> statement-breakpoint

-- Preserve successful legacy checkout receipts as immutable invoice records.
-- Historical rows only stored the application LKR quote, so the actual Stripe
-- amount/currency can be repaired by a later webhook or reconciliation pass.
INSERT INTO "billing_invoices" (
  "id",
  "user_id",
  "listing_id",
  "subscription_id",
  "payment_attempt_id",
  "purpose",
  "status",
  "amount_lkr",
  "charged_amount_minor",
  "charged_currency",
  "stripe_invoice_id",
  "stripe_customer_id",
  "stripe_subscription_id",
  "service_period_start",
  "service_period_end",
  "paid_at",
  "livemode",
  "created_at",
  "updated_at"
)
SELECT DISTINCT ON (payment."stripe_invoice_id")
  'invoice-migrated-' || md5(payment."stripe_invoice_id"),
  payment."user_id",
  payment."listing_id",
  payment."subscription_id",
  payment."id",
  payment."purpose",
  'paid',
  payment."amount_lkr",
  payment."amount_lkr" * 100,
  coalesce(nullif(payment."currency", ''), 'LKR'),
  payment."stripe_invoice_id",
  payment."stripe_customer_id",
  payment."stripe_subscription_id",
  subscription."starts_at",
  subscription."expires_at",
  payment."updated_at",
  false,
  payment."created_at",
  payment."updated_at"
FROM "payment_intents" AS payment
LEFT JOIN "listing_subscriptions" AS subscription
  ON subscription."id" = payment."subscription_id"
WHERE payment."status" = 'succeeded'
  AND payment."stripe_invoice_id" IS NOT NULL
ORDER BY payment."stripe_invoice_id", payment."updated_at" DESC, payment."id"
ON CONFLICT ("stripe_invoice_id") DO NOTHING;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "id" varchar PRIMARY KEY NOT NULL,
  "type" varchar NOT NULL,
  "object_id" varchar NOT NULL,
  "event_created" bigint NOT NULL,
  "processed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_operations" (
  "id" varchar PRIMARY KEY NOT NULL,
  "type" varchar NOT NULL,
  "status" varchar NOT NULL,
  "target_id" varchar NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "next_attempt_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" varchar PRIMARY KEY NOT NULL,
  "actor_email" varchar NOT NULL,
  "action" varchar NOT NULL,
  "target_type" varchar NOT NULL,
  "target_id" varchar NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "result" varchar NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "users_stripe_customer_id_unique"
  ON "users" ("stripe_customer_id");
--> statement-breakpoint
WITH ranked_checkout_sessions AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "stripe_checkout_session_id"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id"
    ) AS position
  FROM "payment_intents"
  WHERE "stripe_checkout_session_id" IS NOT NULL
)
UPDATE "payment_intents" AS payment
SET "stripe_checkout_session_id" = NULL
FROM ranked_checkout_sessions AS ranked
WHERE payment."id" = ranked."id"
  AND ranked.position > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_stripe_checkout_session_id_unique"
  ON "payment_intents" ("stripe_checkout_session_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "listing_subscriptions_listing_id_unique"
  ON "listing_subscriptions" ("listing_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "listing_subscriptions_stripe_subscription_id_unique"
  ON "listing_subscriptions" ("stripe_subscription_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_stripe_invoice_id_unique"
  ON "billing_invoices" ("stripe_invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_invoices_user_created_idx"
  ON "billing_invoices" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_invoices_listing_created_idx"
  ON "billing_invoices" ("listing_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_webhook_events_object_id_idx"
  ON "stripe_webhook_events" ("object_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_operations_status_next_attempt_idx"
  ON "billing_operations" ("status", "next_attempt_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_logs_target_created_idx"
  ON "admin_audit_logs" ("target_type", "target_id", "created_at");
