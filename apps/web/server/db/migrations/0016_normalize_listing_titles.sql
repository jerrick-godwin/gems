WITH normalized_listing_titles AS (
  SELECT
    listing.id,
    string_agg(
      upper(left(part.word, 1)) || substr(part.word, 2),
      ' ' ORDER BY part.position
    ) AS title
  FROM listings AS listing
  CROSS JOIN LATERAL regexp_split_to_table(
    btrim(listing.title),
    '[[:space:]]+'
  ) WITH ORDINALITY AS part(word, position)
  GROUP BY listing.id
)
UPDATE listings AS listing
SET
  title = normalized.title,
  updated_at = now()
FROM normalized_listing_titles AS normalized
WHERE listing.id = normalized.id
  AND listing.title IS DISTINCT FROM normalized.title;

WITH normalized_checkout_titles AS (
  SELECT
    checkout.id,
    string_agg(
      upper(left(part.word, 1)) || substr(part.word, 2),
      ' ' ORDER BY part.position
    ) AS title
  FROM listing_checkout_sessions AS checkout
  CROSS JOIN LATERAL regexp_split_to_table(
    btrim(checkout.draft->>'title'),
    '[[:space:]]+'
  ) WITH ORDINALITY AS part(word, position)
  WHERE checkout.status IN ('open', 'claimed')
    AND nullif(btrim(checkout.draft->>'title'), '') IS NOT NULL
  GROUP BY checkout.id
)
UPDATE listing_checkout_sessions AS checkout
SET
  draft = jsonb_set(checkout.draft, '{title}', to_jsonb(normalized.title), false),
  updated_at = now()
FROM normalized_checkout_titles AS normalized
WHERE checkout.id = normalized.id
  AND checkout.draft->>'title' IS DISTINCT FROM normalized.title;
