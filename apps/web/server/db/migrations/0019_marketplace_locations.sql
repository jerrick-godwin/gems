CREATE TABLE IF NOT EXISTS "locations" (
  "id" varchar PRIMARY KEY,
  "name" varchar NOT NULL UNIQUE
);
--> statement-breakpoint
INSERT INTO "locations" ("id", "name") VALUES ('sri-lanka', 'Sri Lanka')
ON CONFLICT DO NOTHING;
