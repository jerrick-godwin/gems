ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_checkout_session_id varchar;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_customer_id varchar;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS stripe_invoice_id varchar;

UPDATE payment_intents
SET stripe_checkout_session_id = gateway_reference
WHERE gateway = 'stripe'
  AND stripe_checkout_session_id IS NULL
  AND gateway_reference LIKE 'cs_%';

UPDATE payment_intents
SET stripe_subscription_id = gateway_reference
WHERE gateway = 'stripe'
  AND stripe_subscription_id IS NULL
  AND gateway_reference LIKE 'sub_%';

CREATE INDEX IF NOT EXISTS "payment_intents_stripe_checkout_session_id_idx" ON "payment_intents" ("stripe_checkout_session_id");
CREATE INDEX IF NOT EXISTS "payment_intents_stripe_subscription_id_idx" ON "payment_intents" ("stripe_subscription_id");
