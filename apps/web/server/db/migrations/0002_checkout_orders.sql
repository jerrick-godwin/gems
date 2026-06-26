alter table order_items drop constraint if exists order_items_listing_id_listings_id_fk;

alter table orders add column if not exists invoice_number varchar;
alter table orders add column if not exists payment_method varchar not null default 'stripe';
update orders set payment_method = 'stripe' where payment_method <> 'stripe';
alter table orders add column if not exists billing_details jsonb not null default '{}'::jsonb;
alter table orders add column if not exists delivery_details jsonb not null default '{}'::jsonb;
alter table orders add column if not exists customer_note text;

update orders
set status = 'order_placed'
where status = 'pending';

update orders
set invoice_number = concat('INV-', to_char(coalesce(created_at, now()), 'YYYYMMDD'), '-', upper(substr(md5(id), 1, 6)))
where invoice_number is null or invoice_number = '';

alter table orders alter column invoice_number set not null;
create unique index if not exists orders_invoice_number_unique on orders(invoice_number);

alter table order_items add column if not exists title_snapshot varchar;
alter table order_items add column if not exists image_url_snapshot text;
alter table order_items add column if not exists product_summary text;
alter table order_items add column if not exists quantity integer not null default 1;
alter table order_items add column if not exists unit_price_lkr integer;

update order_items oi
set
  title_snapshot = coalesce(oi.title_snapshot, l.title, oi.listing_id),
  image_url_snapshot = coalesce(oi.image_url_snapshot, l.media->0->>'url'),
  product_summary = coalesce(
    oi.product_summary,
    concat_ws(' · ', l.attributes->>'carat' || ' ct', l.attributes->>'color', l.attributes->>'shape')
  ),
  unit_price_lkr = coalesce(oi.unit_price_lkr, oi.price_lkr, 0)
from listings l
where oi.listing_id = l.id;

update order_items
set
  title_snapshot = coalesce(title_snapshot, listing_id),
  product_summary = coalesce(product_summary, ''),
  unit_price_lkr = coalesce(unit_price_lkr, price_lkr, 0);

alter table order_items alter column title_snapshot set not null;
alter table order_items alter column product_summary set not null;
alter table order_items alter column unit_price_lkr set not null;
alter table order_items alter column price_lkr drop not null;
