CREATE INDEX IF NOT EXISTS "listings_public_featured_idx"
  ON "listings" ((jsonb_array_length("promoted")) DESC, "published_at" DESC, "id")
  WHERE "status" = 'live' AND "moderation_status" = 'approved';
CREATE INDEX IF NOT EXISTS "listings_public_newest_idx"
  ON "listings" ("published_at" DESC, "id")
  WHERE "status" = 'live' AND "moderation_status" = 'approved';
CREATE INDEX IF NOT EXISTS "listings_public_price_idx"
  ON "listings" ("price_lkr", "id")
  WHERE "status" = 'live' AND "moderation_status" = 'approved';
CREATE INDEX IF NOT EXISTS "listings_public_gem_type_idx"
  ON "listings" ("gem_type_id", "published_at" DESC)
  WHERE "status" = 'live' AND "moderation_status" = 'approved';
CREATE INDEX IF NOT EXISTS "listings_public_location_idx"
  ON "listings" ("location", "published_at" DESC)
  WHERE "status" = 'live' AND "moderation_status" = 'approved';
