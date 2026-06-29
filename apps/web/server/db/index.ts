import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema.js";
import { worldwideGemTypes } from "./gem-catalog.js";

const connectionString = process.env.DATABASE_URL;
export const hasDatabase = Boolean(connectionString);

if (!connectionString) {
  console.warn("DATABASE_URL is not set. API requests require PostgreSQL.");
}

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString || "", { 
  prepare: false,
  onnotice: () => {} 
});
export const db = drizzle(client, { schema });

let compatibilityPromise: Promise<void> | undefined;

export function requireDatabase() {
  if (!hasDatabase) throw new Error("DATABASE_URL is required.");
}

export async function ensureDatabaseCompatibility(options: { force?: boolean } = {}) {
  if (!hasDatabase) return;
  if (!options.force && process.env.RUNTIME_DATABASE_COMPATIBILITY !== "true") return;
  compatibilityPromise ??= (async () => {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS address varchar NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_checkout_session_id varchar`);
    await db.execute(sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar`);
    await db.execute(sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_customer_id varchar`);
    await db.execute(sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_invoice_id varchar`);
    await db.execute(sql`ALTER TABLE listings ADD COLUMN IF NOT EXISTS idempotency_key varchar`);
    await db.execute(sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS idempotency_key varchar`);
    await db.execute(sql`
      UPDATE payment_intents
      SET stripe_checkout_session_id = gateway_reference
      WHERE gateway = 'stripe'
        AND stripe_checkout_session_id IS NULL
        AND gateway_reference LIKE 'cs_%'
    `);
    await db.execute(sql`
      UPDATE payment_intents
      SET stripe_subscription_id = gateway_reference
      WHERE gateway = 'stripe'
        AND stripe_subscription_id IS NULL
        AND gateway_reference LIKE 'sub_%'
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "payment_intents_stripe_checkout_session_id_idx" ON "payment_intents" ("stripe_checkout_session_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "payment_intents_stripe_subscription_id_idx" ON "payment_intents" ("stripe_subscription_id")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "listings_seller_idempotency_unique" ON "listings" ("seller_id", "idempotency_key")`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_user_listing_idempotency_unique" ON "payment_intents" ("user_id", "listing_id", "idempotency_key")`);
    await db.insert(schema.gemTypes)
      .values(worldwideGemTypes)
      .onConflictDoUpdate({
        target: schema.gemTypes.id,
        set: {
          name: sql`excluded.name`,
          slug: sql`excluded.slug`,
          colorHint: sql`excluded.color_hint`
        }
      });
    await db.execute(sql`CREATE TABLE IF NOT EXISTS "merchant_disclosure" (
      "id" varchar PRIMARY KEY NOT NULL,
      "merchant_name" varchar NOT NULL,
      "email" varchar NOT NULL,
      "licence_number" varchar NOT NULL
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS "listing_checkout_sessions" (
      "id" varchar PRIMARY KEY NOT NULL,
      "token_hash" varchar NOT NULL,
      "draft" jsonb NOT NULL,
      "media" jsonb NOT NULL,
      "selected_plan_id" varchar,
      "accepted_policies" boolean DEFAULT false NOT NULL,
      "status" varchar DEFAULT 'open' NOT NULL,
      "claimed_user_id" varchar REFERENCES "users"("id"),
      "listing_id" varchar REFERENCES "listings"("id"),
      "payment_intent_id" varchar,
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "listing_checkout_sessions_token_hash_unique" ON "listing_checkout_sessions" ("token_hash")`);
    await db.execute(sql`
      INSERT INTO "merchant_disclosure" ("id", "merchant_name", "email", "licence_number")
      VALUES ('global', 'KRISTIANA MAGRET GEM & JEWELLERY', 'info@gemslanka.lk', '20266DL39394')
      ON CONFLICT ("id") DO NOTHING
    `);
  })();
  await compatibilityPromise;
}
