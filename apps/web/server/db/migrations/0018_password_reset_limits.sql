CREATE TABLE IF NOT EXISTS "password_reset_limits" (
  "email_hash" varchar PRIMARY KEY,
  "window_started_at" timestamptz NOT NULL,
  "last_requested_at" timestamptz NOT NULL,
  "request_count" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_limits_last_requested_idx"
  ON "password_reset_limits" ("last_requested_at");
