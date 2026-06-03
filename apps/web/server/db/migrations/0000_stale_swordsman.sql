CREATE TABLE "cart_items" (
	"id" varchar PRIMARY KEY NOT NULL,
	"cart_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "carts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY NOT NULL,
	"listing_id" varchar NOT NULL,
	"buyer_id" varchar,
	"buyer_name" varchar NOT NULL,
	"seller_id" varchar NOT NULL,
	"status" varchar DEFAULT 'new' NOT NULL,
	"last_message" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gem_types" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"color_hint" varchar NOT NULL,
	CONSTRAINT "gem_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "listing_contacts" (
	"listing_id" varchar PRIMARY KEY NOT NULL,
	"phone" varchar NOT NULL,
	"remaining_reveals" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_media" (
	"id" varchar PRIMARY KEY NOT NULL,
	"listing_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"kind" varchar NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"alt" text NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"moderation_status" varchar DEFAULT 'queued' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"seller_id" varchar NOT NULL,
	"gem_type_id" varchar NOT NULL,
	"title" varchar NOT NULL,
	"description" text NOT NULL,
	"price_lkr" integer NOT NULL,
	"negotiable" boolean DEFAULT false NOT NULL,
	"location" varchar NOT NULL,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"moderation_status" varchar DEFAULT 'not_submitted' NOT NULL,
	"rejection_reason" text,
	"published_at" timestamp,
	"expires_at" timestamp,
	"attributes" jsonb NOT NULL,
	"media" jsonb NOT NULL,
	"promoted" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"campaigns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stats" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" varchar PRIMARY KEY NOT NULL,
	"order_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"price_lkr" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"total_lkr" integer NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"reservation_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" varchar PRIMARY KEY NOT NULL,
	"listing_id" varchar,
	"reporter_id" varchar,
	"reason" varchar NOT NULL,
	"status" varchar DEFAULT 'open' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"name" varchar NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_profiles" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"display_name" varchar NOT NULL,
	"business_name" varchar,
	"verification_status" varchar DEFAULT 'unverified' NOT NULL,
	"shop_slug" varchar NOT NULL,
	"member_since" varchar NOT NULL,
	"location" varchar NOT NULL,
	"rating" numeric(2, 1) DEFAULT 0 NOT NULL,
	CONSTRAINT "seller_profiles_shop_slug_unique" UNIQUE("shop_slug")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"theme" varchar DEFAULT 'system' NOT NULL,
	"notifications_enabled" boolean DEFAULT true NOT NULL,
	"language" varchar DEFAULT 'en' NOT NULL,
	"dashboard_default_view" varchar DEFAULT 'buyer' NOT NULL,
	"saved_marketplace_filters" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"firebase_uid" varchar,
	"name" varchar NOT NULL,
	"phone" varchar DEFAULT '' NOT NULL,
	"email" varchar NOT NULL,
	"role" varchar DEFAULT 'buyer' NOT NULL,
	"locale" varchar DEFAULT 'en' NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"profile_image_key" text,
	"profile_image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_firebase_uid_unique" UNIQUE("firebase_uid"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" varchar PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"listing_id" varchar NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_contacts" ADD CONSTRAINT "listing_contacts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_seller_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."seller_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_gem_type_id_gem_types_id_fk" FOREIGN KEY ("gem_type_id") REFERENCES "public"."gem_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_cart_listing_unique" ON "cart_items" USING btree ("cart_id","listing_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_user_listing_unique" ON "wishlists" USING btree ("user_id","listing_id");