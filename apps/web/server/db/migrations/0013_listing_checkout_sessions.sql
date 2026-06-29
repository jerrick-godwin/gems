CREATE TABLE IF NOT EXISTS "listing_checkout_sessions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"token_hash" varchar NOT NULL,
	"draft" jsonb NOT NULL,
	"media" jsonb NOT NULL,
	"selected_plan_id" varchar,
	"accepted_policies" boolean DEFAULT false NOT NULL,
	"status" varchar DEFAULT 'open' NOT NULL,
	"claimed_user_id" varchar,
	"listing_id" varchar,
	"payment_intent_id" varchar,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_checkout_sessions" ADD CONSTRAINT "listing_checkout_sessions_claimed_user_id_users_id_fk" FOREIGN KEY ("claimed_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "listing_checkout_sessions" ADD CONSTRAINT "listing_checkout_sessions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "listing_checkout_sessions_token_hash_unique" ON "listing_checkout_sessions" USING btree ("token_hash");
