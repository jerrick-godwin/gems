-- Custom SQL migration file, put your code below! --

CREATE TABLE IF NOT EXISTS "subscription_plans" (
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

ALTER TABLE "listing_subscriptions" ADD CONSTRAINT "listing_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;