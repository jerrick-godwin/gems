create table if not exists users (
  id varchar primary key,
  firebase_uid varchar unique,
  name varchar not null,
  phone varchar not null default '',
  email varchar not null unique,
  role varchar not null default 'buyer',
  locale varchar not null default 'en',
  status varchar not null default 'active',
  profile_image_key text,
  profile_image_url text,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists user_settings (
  user_id varchar primary key references users(id),
  theme varchar not null default 'system',
  notifications_enabled boolean not null default true,
  language varchar not null default 'en',
  dashboard_default_view varchar not null default 'buyer',
  saved_marketplace_filters jsonb not null default '{}'::jsonb
);

create table if not exists seller_profiles (
  id varchar primary key,
  user_id varchar not null references users(id),
  display_name varchar not null,
  business_name varchar,
  verification_status varchar not null default 'unverified',
  shop_slug varchar not null unique,
  member_since varchar not null,
  location varchar not null,
  rating numeric(2, 1) not null default 0
);

create table if not exists gem_types (
  id varchar primary key,
  name varchar not null,
  slug varchar not null unique,
  color_hint varchar not null
);

create table if not exists listings (
  id varchar primary key,
  seller_id varchar not null references seller_profiles(id),
  gem_type_id varchar not null references gem_types(id),
  title varchar not null,
  description text not null,
  price_lkr integer not null,
  negotiable boolean not null default false,
  location varchar not null,
  status varchar not null default 'draft',
  moderation_status varchar not null default 'not_submitted',
  published_at timestamp,
  expires_at timestamp,
  attributes jsonb not null,
  media jsonb not null,
  promoted jsonb not null default '[]'::jsonb,
  stats jsonb not null,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists listing_media (
  id varchar primary key,
  listing_id varchar not null references listings(id),
  user_id varchar not null references users(id),
  kind varchar not null,
  storage_key text not null,
  url text not null,
  alt text not null,
  sort_order integer not null default 1,
  moderation_status varchar not null default 'queued',
  created_at timestamp not null default now()
);

create table if not exists listing_contacts (
  listing_id varchar primary key references listings(id),
  phone varchar not null,
  remaining_reveals integer not null default 0
);

create table if not exists conversations (
  id varchar primary key,
  listing_id varchar not null references listings(id),
  buyer_id varchar references users(id),
  buyer_name varchar not null,
  seller_id varchar not null references seller_profiles(id),
  status varchar not null default 'new',
  last_message text not null default '',
  updated_at timestamp not null default now()
);

create table if not exists reports (
  id varchar primary key,
  listing_id varchar references listings(id),
  reporter_id varchar references users(id),
  reason varchar not null,
  status varchar not null default 'open',
  notes text not null default '',
  created_at timestamp not null default now()
);

create table if not exists saved_searches (
  id varchar primary key,
  user_id varchar references users(id),
  name varchar not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamp not null default now()
);

create table if not exists carts (
  id varchar primary key,
  user_id varchar not null unique references users(id),
  updated_at timestamp not null default now()
);

create table if not exists cart_items (
  id varchar primary key,
  cart_id varchar not null references carts(id),
  listing_id varchar not null references listings(id),
  quantity integer not null default 1,
  added_at timestamp not null default now()
);

create unique index if not exists cart_items_cart_listing_unique on cart_items(cart_id, listing_id);

create table if not exists orders (
  id varchar primary key,
  user_id varchar not null references users(id),
  total_lkr integer not null,
  status varchar not null default 'pending',
  reservation_expires_at timestamp,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

create table if not exists order_items (
  id varchar primary key,
  order_id varchar not null references orders(id),
  listing_id varchar not null references listings(id),
  price_lkr integer not null
);

create table if not exists wishlists (
  id varchar primary key,
  user_id varchar not null references users(id),
  listing_id varchar not null references listings(id),
  added_at timestamp not null default now()
);

create unique index if not exists wishlists_user_listing_unique on wishlists(user_id, listing_id);
create index if not exists listings_status_idx on listings(moderation_status, status, gem_type_id, location);
