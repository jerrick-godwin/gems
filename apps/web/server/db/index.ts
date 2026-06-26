import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema.js";
import { worldwideGemTypes } from "./gem-catalog.js";

const connectionString = process.env.DATABASE_URL;
export const hasDatabase = Boolean(connectionString);

if (!connectionString) {
  console.warn("DATABASE_URL is not set. Database operations will fail unless mocked.");
}

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString || "", { 
  prepare: false,
  onnotice: () => {} 
});
export const db = drizzle(client, { schema });

let compatibilityPromise: Promise<void> | undefined;

export async function ensureDatabaseCompatibility() {
  if (!hasDatabase) return;
  compatibilityPromise ??= (async () => {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS address varchar NOT NULL DEFAULT ''`);
    await db.execute(sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_checkout_session_id varchar`);
    await db.execute(sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar`);
    await db.execute(sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_customer_id varchar`);
    await db.execute(sql`ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_invoice_id varchar`);
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
  })();
  await compatibilityPromise;
}
