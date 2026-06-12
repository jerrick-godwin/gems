CREATE TABLE IF NOT EXISTS "listing_subscriptions" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "listing_id" varchar NOT NULL REFERENCES "listings"("id"),
  "plan_id" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'pending_payment',
  "auto_renew" boolean NOT NULL DEFAULT true,
  "starts_at" timestamp,
  "expires_at" timestamp,
  "cancelled_at" timestamp,
  "payment_intent_id" varchar,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "listing_id" varchar NOT NULL REFERENCES "listings"("id"),
  "subscription_id" varchar,
  "purpose" varchar NOT NULL,
  "status" varchar NOT NULL DEFAULT 'pending',
  "plan_id" varchar NOT NULL,
  "quote" jsonb NOT NULL,
  "amount_lkr" integer NOT NULL,
  "currency" varchar NOT NULL DEFAULT 'LKR',
  "gateway" varchar NOT NULL DEFAULT 'webxpay',
  "gateway_reference" varchar,
  "payment_url" text,
  "policy_version" varchar NOT NULL,
  "policy_accepted_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "renewal_events" (
  "id" varchar PRIMARY KEY NOT NULL,
  "subscription_id" varchar NOT NULL REFERENCES "listing_subscriptions"("id"),
  "payment_intent_id" varchar,
  "status" varchar NOT NULL,
  "gateway_reference" varchar,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "policy_acceptances" (
  "id" varchar PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id"),
  "listing_id" varchar REFERENCES "listings"("id"),
  "payment_intent_id" varchar,
  "policy_version" varchar NOT NULL,
  "accepted_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "listing_subscriptions_listing_id_idx" ON "listing_subscriptions" ("listing_id");
CREATE INDEX IF NOT EXISTS "listing_subscriptions_user_id_idx" ON "listing_subscriptions" ("user_id");
CREATE INDEX IF NOT EXISTS "payment_intents_listing_id_idx" ON "payment_intents" ("listing_id");
CREATE INDEX IF NOT EXISTS "payment_intents_user_id_idx" ON "payment_intents" ("user_id");
