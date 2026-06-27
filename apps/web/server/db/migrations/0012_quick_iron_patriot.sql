CREATE TABLE "listing_subscriptions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"status" varchar DEFAULT 'pending_payment' NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp,
	"expires_at" timestamp,
	"cancelled_at" timestamp,
	"payment_intent_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_disclosure" (
	"id" varchar PRIMARY KEY NOT NULL,
	"merchant_name" varchar NOT NULL,
	"email" varchar NOT NULL,
	"licence_number" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"idempotency_key" varchar,
	"subscription_id" varchar,
	"purpose" varchar NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"plan_id" varchar NOT NULL,
	"quote" jsonb NOT NULL,
	"amount_lkr" integer NOT NULL,
	"currency" varchar DEFAULT 'LKR' NOT NULL,
	"gateway" varchar DEFAULT 'stripe' NOT NULL,
	"gateway_reference" varchar,
	"stripe_checkout_session_id" varchar,
	"stripe_subscription_id" varchar,
	"stripe_customer_id" varchar,
	"stripe_invoice_id" varchar,
	"payment_url" text,
	"policy_version" varchar NOT NULL,
	"policy_accepted_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_acceptances" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"listing_id" varchar,
	"payment_intent_id" varchar,
	"policy_version" varchar NOT NULL,
	"accepted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renewal_events" (
	"id" varchar PRIMARY KEY NOT NULL,
	"subscription_id" varchar NOT NULL,
	"payment_intent_id" varchar,
	"status" varchar NOT NULL,
	"gateway_reference" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"price_lkr" integer NOT NULL,
	"included_photos" integer NOT NULL,
	"extra_photo_price_lkr" integer NOT NULL,
	"validity_months" integer NOT NULL,
	"eyebrow" varchar NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wishlists" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "wishlists" CASCADE;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "idempotency_key" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address" varchar DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD CONSTRAINT "listing_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD CONSTRAINT "listing_subscriptions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD CONSTRAINT "listing_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_events" ADD CONSTRAINT "renewal_events_subscription_id_listing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."listing_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_user_listing_idempotency_unique" ON "payment_intents" USING btree ("user_id","listing_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_seller_idempotency_unique" ON "listings" USING btree ("seller_id","idempotency_key");