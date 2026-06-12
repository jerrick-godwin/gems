export type UserRole = "guest" | "buyer" | "seller" | "verified_seller" | "moderator" | "admin";
export type ListingStatus = "draft" | "pending_review" | "live" | "rejected" | "expired" | "promoted";
export type ModerationStatus = "not_submitted" | "queued" | "needs_changes" | "approved" | "rejected";
export type Treatment = "untreated" | "heated" | "diffused" | "filled";
export type CertificateStatus = "none" | "seller_provided" | "admin_verified";
export type PromotionType = "bump" | "top" | "urgent" | "featured" | "scheduled";
export type ListingSubscriptionPlanId = "basic" | "pro" | "plus";
export type ListingSubscriptionStatus = "pending_payment" | "active" | "past_due" | "cancelled" | "expired";
export type PaymentPurpose = "listing_subscription" | "listing_subscription_renewal";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "cancelled";

export interface ListingSubscriptionPlan {
  id: ListingSubscriptionPlanId;
  name: string;
  priceLkr: number;
  includedPhotos: number;
  extraPhotoPriceLkr: number;
  validityMonths: number;
}

export const listingSubscriptionPlans: ListingSubscriptionPlan[] = [
  { id: "basic", name: "Basic", priceLkr: 500, includedPhotos: 3, extraPhotoPriceLkr: 250, validityMonths: 1 },
  { id: "pro", name: "Pro", priceLkr: 1000, includedPhotos: 6, extraPhotoPriceLkr: 500, validityMonths: 2 },
  { id: "plus", name: "Plus", priceLkr: 20000, includedPhotos: 10, extraPhotoPriceLkr: 500, validityMonths: 3 }
];

export interface ListingPaymentQuote {
  plan: ListingSubscriptionPlan;
  photoCount: number;
  extraPhotoCount: number;
  basePriceLkr: number;
  extraPhotoTotalLkr: number;
  totalLkr: number;
}

export interface ListingSubscriptionSummary {
  id: string;
  listingId: string;
  planId: ListingSubscriptionPlanId;
  status: ListingSubscriptionStatus;
  autoRenew: boolean;
  startsAt?: string;
  expiresAt?: string;
  cancelledAt?: string;
}

export interface PromotionCampaign {
  id: string;
  type: PromotionType;
  status: "scheduled" | "active" | "paused" | "stopped";
  startsAt: string;
  endsAt: string;
}

export interface User {
  id: string;
  firebaseUid?: string;
  name: string;
  phone: string;
  email: string;
  role: UserRole;
  locale: "en" | "si" | "ta";
  status: "active" | "suspended";
  profileImageUrl?: string;
  profileImageKey?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SellerProfile {
  id: string;
  userId: string;
  displayName: string;
  businessName?: string;
  verificationStatus: "unverified" | "identity_verified" | "business_verified";
  shopSlug: string;
  memberSince: string;
  location: string;
  rating: number;
}

export interface GemType {
  id: string;
  name: string;
  slug: string;
  colorHint: string;
}

export interface GemAttributes {
  carat: number;
  dimensions: string;
  shape: string;
  cut: string;
  color: string;
  clarity: string;
  origin: string;
  treatment: Treatment;
  certificateStatus: CertificateStatus;
  labName?: string;
  reportNumber?: string;
}

export interface ListingMedia {
  id: string;
  listingId: string;
  kind: "photo" | "video" | "certificate";
  url: string;
  alt: string;
  order: number;
  moderationStatus: ModerationStatus;
}

export interface Listing {
  id: string;
  sellerId: string;
  gemTypeId: string;
  title: string;
  description: string;
  priceLkr: number;
  negotiable: boolean;
  location: string;
  status: ListingStatus;
  moderationStatus: ModerationStatus;
  rejectionReason?: string;
  publishedAt?: string;
  expiresAt?: string;
  attributes: GemAttributes;
  media: ListingMedia[];
  promoted: PromotionType[];
  campaigns: PromotionCampaign[];
  stats: {
    views: number;
    saves: number;
    phoneReveals: number;
    chats: number;
    whatsappClicks: number;
  };
  subscription?: ListingSubscriptionSummary;
}

export interface ListingSubscription extends ListingSubscriptionSummary {
  userId: string;
  paymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentIntent {
  id: string;
  userId: string;
  listingId: string;
  subscriptionId?: string;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  planId: ListingSubscriptionPlanId;
  quote: ListingPaymentQuote;
  amountLkr: number;
  currency: "LKR";
  gateway: "webxpay";
  gatewayReference?: string;
  paymentUrl?: string;
  policyVersion: string;
  policyAcceptedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  listingId: string;
  buyerName: string;
  sellerId: string;
  status: "new" | "active" | "closed";
  lastMessage: string;
  updatedAt: string;
}

export interface Report {
  id: string;
  listingId: string;
  listing?: Listing;
  reporterId?: string;
  reason: "fake_certificate" | "misrepresented_gem" | "scam_attempt" | "duplicate" | "wrong_details" | "abusive_seller";
  status: "open" | "investigating" | "resolved";
  notes: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  filters: Partial<GemAttributes> & {
    gemTypeId?: string;
    location?: string;
    minPrice?: number;
    maxPrice?: number;
  };
}

export interface PromotionProduct {
  name: string;
  price: string;
  detail: string;
  icon: "bell" | "sparkles" | "star";
}

export interface SellerMetric {
  label: string;
  value: string;
}

export interface MarketplaceContent {
  safetyTips: string[];
  promotions: PromotionProduct[];
  sellerMetrics: SellerMetric[];
}

export interface UserSettings {
  userId: string;
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
  language: "en" | "si" | "ta";
  dashboardDefaultView: "buyer" | "seller";
  savedMarketplaceFilters: Record<string, unknown>;
}

export interface CartItem {
  id: string;
  listingId: string;
  listing?: Listing;
  quantity: number;
  addedAt: string;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  listingId: string;
  titleSnapshot: string;
  imageUrlSnapshot?: string;
  productSummary: string;
  attributesSnapshot?: GemAttributes;
  quantity: number;
  unitPriceLkr: number;
}

export const orderStatuses = [
  "order_placed",
  "verification_in_progress",
  "verification_failed",
  "dispatch_in_progress",
  "dispatched",
  "delivered",
  "closed",
  "rejected"
] as const;

export type OrderStatus = typeof orderStatuses[number];
export type PaymentMethod = "direct_bank_transfer";

export interface CheckoutDetails {
  fullName: string;
  email: string;
  mobile: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  district: string;
  postalCode: string;
  country: string;
}

export interface CheckoutRequest {
  billingDetails: CheckoutDetails;
  deliveryDetails: CheckoutDetails;
  paymentMethod: PaymentMethod;
  customerNote?: string;
}

export interface Order {
  id: string;
  userId: string;
  invoiceNumber: string;
  items: OrderItem[];
  totalLkr: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  billingDetails: CheckoutDetails;
  deliveryDetails: CheckoutDetails;
  customerNote?: string;
  reservationExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WishlistItem {
  id: string;
  userId: string;
  listingId: string;
  listing?: Listing;
  addedAt: string;
}

export interface UserDashboard {
  user: User;
  settings: UserSettings;
  sellerListings: Listing[];
  conversations: Conversation[];
  wishlistCount: number;
  cartCount: number;
  recentOrders: Order[];
  listingSubscriptions: ListingSubscription[];
  recentPayments: PaymentIntent[];
}

export interface StorageUploadRequest {
  scope: "profile" | "listing-media" | "listing-certificate";
  fileName: string;
  contentType: string;
  listingId?: string;
}

export interface StorageUploadTarget {
  blobKey: string;
  uploadUrl: string;
  readUrl?: string;
  expiresAt: string;
}

export function formatLkr(value: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0
  }).format(value);
}

export function getListingSubscriptionPlan(planId: ListingSubscriptionPlanId) {
  const plan = listingSubscriptionPlans.find((item) => item.id === planId);
  if (!plan) throw new Error("Unknown listing subscription plan.");
  return plan;
}

export function quoteListingSubscription(planId: ListingSubscriptionPlanId, photoCount: number): ListingPaymentQuote {
  const plan = getListingSubscriptionPlan(planId);
  const normalizedPhotoCount = Math.max(0, Math.floor(photoCount));
  const extraPhotoCount = Math.max(0, normalizedPhotoCount - plan.includedPhotos);
  const extraPhotoTotalLkr = extraPhotoCount * plan.extraPhotoPriceLkr;
  return {
    plan,
    photoCount: normalizedPhotoCount,
    extraPhotoCount,
    basePriceLkr: plan.priceLkr,
    extraPhotoTotalLkr,
    totalLkr: plan.priceLkr + extraPhotoTotalLkr
  };
}

export function orderStatusLabel(status: OrderStatus) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function validateCheckoutDetails(input: Partial<CheckoutDetails>, label: "Billing" | "Delivery" = "Billing") {
  const requiredFields: Array<keyof CheckoutDetails> = ["fullName", "email", "mobile", "addressLine1", "city", "district", "postalCode", "country"];
  const errors: string[] = [];
  for (const field of requiredFields) {
    if (typeof input[field] !== "string" || !input[field]?.trim()) {
      errors.push(`${label} ${field} is required.`);
    }
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    errors.push(`${label} email is invalid.`);
  }
  return errors;
}

export function validateCheckoutRequest(input: Partial<CheckoutRequest>) {
  const errors = [
    ...validateCheckoutDetails(input.billingDetails ?? {}, "Billing"),
    ...validateCheckoutDetails(input.deliveryDetails ?? {}, "Delivery")
  ];
  if (input.paymentMethod !== "direct_bank_transfer") {
    errors.push("Payment method must be direct bank transfer.");
  }
  return errors;
}

export function validateGemListing(listing: Pick<Listing, "title" | "priceLkr" | "attributes" | "media">) {
  const errors: string[] = [];
  if (listing.title.trim().length < 8) errors.push("Title must be at least 8 characters.");
  if (listing.priceLkr <= 0) errors.push("Price must be greater than zero.");
  if (listing.attributes.carat <= 0) errors.push("Carat weight is required.");
  if (!listing.attributes.shape) errors.push("Shape is required.");
  if (!listing.attributes.color) errors.push("Color is required.");
  if (!listing.attributes.origin) errors.push("Origin is required.");
  if (!listing.media.some((item) => item.kind === "photo")) errors.push("At least one gem photo is required.");
  return errors;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
