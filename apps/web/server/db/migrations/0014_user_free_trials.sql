-- Custom SQL migration file, put your code below! --

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_started_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trial_terminated_at" timestamp;
--> statement-breakpoint
UPDATE "users"
SET "trial_started_at" = "created_at"
WHERE "trial_started_at" IS NULL;
--> statement-breakpoint
UPDATE "users"
SET "trial_ends_at" = "created_at" + interval '14 days'
WHERE "trial_ends_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "trial_started_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "trial_ends_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "listing_subscriptions" ADD COLUMN IF NOT EXISTS "source" varchar NOT NULL DEFAULT 'paid';
