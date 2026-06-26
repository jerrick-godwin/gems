ALTER TABLE payment_intents ALTER COLUMN gateway SET DEFAULT 'stripe';
UPDATE payment_intents SET gateway = 'stripe' WHERE gateway <> 'stripe';
ALTER TABLE orders ALTER COLUMN payment_method SET DEFAULT 'stripe';
UPDATE orders SET payment_method = 'stripe' WHERE payment_method <> 'stripe';
