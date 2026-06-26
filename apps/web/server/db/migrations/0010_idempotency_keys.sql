ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "listings_seller_idempotency_unique" ON "listings" ("seller_id", "idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_intents_user_listing_idempotency_unique" ON "payment_intents" ("user_id", "listing_id", "idempotency_key");
