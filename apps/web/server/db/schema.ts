import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import type {
  CheckoutDetails,
  GemAttributes,
  ListingMedia,
  ListingStatus,
  ListingSubscriptionPlanId,
  ListingSubscriptionStatus,
  ListingPaymentQuote,
  ModerationStatus,
  OrderStatus,
  PaymentMethod,
  PaymentPurpose,
  PaymentStatus,
  PromotionCampaign,
  PromotionType,
  UserRole
} from "@gems/schemas";

export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  firebaseUid: varchar("firebase_uid").unique(),
  name: varchar("name").notNull(),
  phone: varchar("phone").notNull().default(""),
  email: varchar("email").notNull().unique(),
  role: varchar("role").$type<UserRole>().notNull().default("buyer"),
  locale: varchar("locale").notNull().default("en"),
  status: varchar("status").notNull().default("active"),
  profileImageKey: text("profile_image_key"),
  profileImageUrl: text("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const userSettings = pgTable("user_settings", {
  userId: varchar("user_id").references(() => users.id).primaryKey(),
  theme: varchar("theme").notNull().default("system"),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  language: varchar("language").notNull().default("en"),
  dashboardDefaultView: varchar("dashboard_default_view").notNull().default("buyer"),
  savedMarketplaceFilters: jsonb("saved_marketplace_filters").$type<Record<string, unknown>>().notNull().default({})
});

export const sellerProfiles = pgTable("seller_profiles", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  displayName: varchar("display_name").notNull(),
  businessName: varchar("business_name"),
  verificationStatus: varchar("verification_status").notNull().default("unverified"),
  shopSlug: varchar("shop_slug").notNull().unique(),
  memberSince: varchar("member_since").notNull(),
  location: varchar("location").notNull(),
  rating: numeric("rating", { precision: 2, scale: 1, mode: "number" }).notNull().default(0)
});

export const gemTypes = pgTable("gem_types", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  slug: varchar("slug").notNull().unique(),
  colorHint: varchar("color_hint").notNull()
});

export const locations = pgTable("locations", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull().unique()
});

export const listings = pgTable("listings", {
  id: varchar("id").primaryKey(),
  sellerId: varchar("seller_id").references(() => sellerProfiles.id).notNull(),
  gemTypeId: varchar("gem_type_id").references(() => gemTypes.id).notNull(),
  title: varchar("title").notNull(),
  description: text("description").notNull(),
  priceLkr: integer("price_lkr").notNull(),
  negotiable: boolean("negotiable").notNull().default(false),
  location: varchar("location").notNull(),
  status: varchar("status").$type<ListingStatus>().notNull().default("draft"),
  moderationStatus: varchar("moderation_status").$type<ModerationStatus>().notNull().default("not_submitted"),
  rejectionReason: text("rejection_reason"),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"),
  attributes: jsonb("attributes").$type<GemAttributes>().notNull(),
  media: jsonb("media").$type<ListingMedia[]>().notNull(),
  promoted: jsonb("promoted").$type<PromotionType[]>().notNull().default([]),
  campaigns: jsonb("campaigns").$type<PromotionCampaign[]>().notNull().default([]),
  stats: jsonb("stats").$type<{
    views: number;
    saves: number;
    phoneReveals: number;
    chats: number;
    whatsappClicks: number;
  }>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const listingSubscriptions = pgTable("listing_subscriptions", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  listingId: varchar("listing_id").references(() => listings.id).notNull(),
  planId: varchar("plan_id").$type<ListingSubscriptionPlanId>().notNull(),
  status: varchar("status").$type<ListingSubscriptionStatus>().notNull().default("pending_payment"),
  autoRenew: boolean("auto_renew").notNull().default(true),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  cancelledAt: timestamp("cancelled_at"),
  paymentIntentId: varchar("payment_intent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const paymentIntents = pgTable("payment_intents", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  listingId: varchar("listing_id").references(() => listings.id).notNull(),
  subscriptionId: varchar("subscription_id"),
  purpose: varchar("purpose").$type<PaymentPurpose>().notNull(),
  status: varchar("status").$type<PaymentStatus>().notNull().default("pending"),
  planId: varchar("plan_id").$type<ListingSubscriptionPlanId>().notNull(),
  quote: jsonb("quote").$type<ListingPaymentQuote>().notNull(),
  amountLkr: integer("amount_lkr").notNull(),
  currency: varchar("currency").notNull().default("LKR"),
  gateway: varchar("gateway").notNull().default("webxpay"),
  gatewayReference: varchar("gateway_reference"),
  paymentUrl: text("payment_url"),
  policyVersion: varchar("policy_version").notNull(),
  policyAcceptedAt: timestamp("policy_accepted_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const renewalEvents = pgTable("renewal_events", {
  id: varchar("id").primaryKey(),
  subscriptionId: varchar("subscription_id").references(() => listingSubscriptions.id).notNull(),
  paymentIntentId: varchar("payment_intent_id"),
  status: varchar("status").notNull(),
  gatewayReference: varchar("gateway_reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const policyAcceptances = pgTable("policy_acceptances", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  listingId: varchar("listing_id").references(() => listings.id),
  paymentIntentId: varchar("payment_intent_id"),
  policyVersion: varchar("policy_version").notNull(),
  acceptedAt: timestamp("accepted_at").defaultNow().notNull()
});

export const listingMedia = pgTable("listing_media", {
  id: varchar("id").primaryKey(),
  listingId: varchar("listing_id").references(() => listings.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  kind: varchar("kind").notNull(),
  storageKey: text("storage_key").notNull(),
  url: text("url").notNull(),
  alt: text("alt").notNull(),
  sortOrder: integer("sort_order").notNull().default(1),
  moderationStatus: varchar("moderation_status").$type<ModerationStatus>().notNull().default("queued"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const listingContacts = pgTable("listing_contacts", {
  listingId: varchar("listing_id").references(() => listings.id).primaryKey(),
  phone: varchar("phone").notNull(),
  remainingReveals: integer("remaining_reveals").notNull().default(0)
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey(),
  listingId: varchar("listing_id").references(() => listings.id).notNull(),
  buyerId: varchar("buyer_id").references(() => users.id),
  buyerName: varchar("buyer_name").notNull(),
  sellerId: varchar("seller_id").references(() => sellerProfiles.id).notNull(),
  status: varchar("status").notNull().default("new"),
  lastMessage: text("last_message").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const reports = pgTable("reports", {
  id: varchar("id").primaryKey(),
  listingId: varchar("listing_id").references(() => listings.id),
  reporterId: varchar("reporter_id").references(() => users.id),
  reason: varchar("reason").notNull(),
  status: varchar("status").notNull().default("open"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const savedSearches = pgTable("saved_searches", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  name: varchar("name").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const carts = pgTable("carts", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).unique().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const cartItems = pgTable("cart_items", {
  id: varchar("id").primaryKey(),
  cartId: varchar("cart_id").references(() => carts.id).notNull(),
  listingId: varchar("listing_id").references(() => listings.id).notNull(),
  quantity: integer("quantity").notNull().default(1),
  addedAt: timestamp("added_at").defaultNow().notNull()
}, (table) => ({
  cartListingUnique: uniqueIndex("cart_items_cart_listing_unique").on(table.cartId, table.listingId)
}));

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  invoiceNumber: varchar("invoice_number").notNull().unique(),
  totalLkr: integer("total_lkr").notNull(),
  status: varchar("status").$type<OrderStatus>().notNull().default("order_placed"),
  paymentMethod: varchar("payment_method").$type<PaymentMethod>().notNull().default("direct_bank_transfer"),
  billingDetails: jsonb("billing_details").$type<CheckoutDetails>().notNull(),
  deliveryDetails: jsonb("delivery_details").$type<CheckoutDetails>().notNull(),
  customerNote: text("customer_note"),
  reservationExpiresAt: timestamp("reservation_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey(),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  listingId: varchar("listing_id").notNull(),
  titleSnapshot: varchar("title_snapshot").notNull(),
  imageUrlSnapshot: text("image_url_snapshot"),
  productSummary: text("product_summary").notNull(),
  attributesSnapshot: jsonb("attributes_snapshot").$type<GemAttributes>(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceLkr: integer("unit_price_lkr").notNull()
});

export const wishlists = pgTable("wishlists", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  listingId: varchar("listing_id").references(() => listings.id).notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull()
}, (table) => ({
  userListingUnique: uniqueIndex("wishlists_user_listing_unique").on(table.userId, table.listingId)
}));
