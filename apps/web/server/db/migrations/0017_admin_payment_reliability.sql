-- Financial records retain historical listing IDs after listing removal.
ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_listing_id_listings_id_fk;
ALTER TABLE listing_subscriptions DROP CONSTRAINT IF EXISTS listing_subscriptions_listing_id_listings_id_fk;
ALTER TABLE payment_intents DROP CONSTRAINT IF EXISTS payment_intents_listing_id_fkey;
ALTER TABLE listing_subscriptions DROP CONSTRAINT IF EXISTS listing_subscriptions_listing_id_fkey;
CREATE INDEX IF NOT EXISTS listing_subscriptions_latest_idx ON listing_subscriptions (listing_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_payments_page_idx ON payment_intents (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_users_page_idx ON users (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS admin_reports_page_idx ON reports (created_at DESC, id DESC);
