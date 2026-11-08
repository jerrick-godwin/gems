import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./db/index.js";

let nextCleanup = 0;

export async function reservePasswordReset(email: string) {
  const emailHash = createHash("sha256").update(email).digest("hex");
  if (Date.now() >= nextCleanup) {
    nextCleanup = Date.now() + 15 * 60 * 1000;
    await db.execute(sql`DELETE FROM password_reset_limits WHERE last_requested_at < now() - interval '1 hour'`);
  }
  // Cap distinct-recipient abuse before allocating another per-recipient row.
  const budget = await db.execute(sql`
    INSERT INTO password_reset_limits (email_hash, window_started_at, last_requested_at, request_count)
    VALUES ('global', now(), now(), 1)
    ON CONFLICT (email_hash) DO UPDATE SET
      request_count = CASE
        WHEN password_reset_limits.window_started_at <= now() - interval '1 minute' THEN 1
        ELSE password_reset_limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN password_reset_limits.window_started_at <= now() - interval '1 minute' THEN now()
        ELSE password_reset_limits.window_started_at
      END,
      last_requested_at = now()
    WHERE password_reset_limits.request_count < 120
      OR password_reset_limits.window_started_at <= now() - interval '1 minute'
    RETURNING email_hash
  `);
  if (budget.length === 0) return false;

  const reserved = await db.execute(sql`
    INSERT INTO password_reset_limits (email_hash, window_started_at, last_requested_at, request_count)
    VALUES (${emailHash}, now(), now(), 1)
    ON CONFLICT (email_hash) DO UPDATE SET
      request_count = CASE
        WHEN password_reset_limits.window_started_at <= now() - interval '1 hour' THEN 1
        ELSE password_reset_limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN password_reset_limits.window_started_at <= now() - interval '1 hour' THEN now()
        ELSE password_reset_limits.window_started_at
      END,
      last_requested_at = now()
    WHERE password_reset_limits.last_requested_at <= now() - interval '1 minute'
      AND (password_reset_limits.request_count < 5
        OR password_reset_limits.window_started_at <= now() - interval '1 hour')
    RETURNING email_hash
  `);
  return reserved.length > 0;
}
