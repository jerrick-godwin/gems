import type {
  Cart,
  CheckoutRequest,
  Conversation,
  GemType,
  Listing,
  ListingSubscription,
  ListingSubscriptionPlan,
  ListingSubscriptionPlanId,
  MarketplaceContent,
  Order,
  OrderStatus,
  PaymentIntent,
  PaymentReceipt,
  PromotionCampaign,
  Report,
  SavedSearch,
  SellerProfile,
  StorageUploadRequest,
  StorageUploadTarget,
  User,
  UserDashboard,
  UserSettings,
  PaginatedResponse
} from "@gems/schemas";

export interface MarketplaceSnapshot {
  gemTypes: GemType[];
  locations: string[];
  listings: Listing[];
  sellers: SellerProfile[];
  conversations: Conversation[];
  savedSearches: SavedSearch[];
  content: MarketplaceContent;
  subscriptionPlans: ListingSubscriptionPlan[];
}

export interface AdminSession {
  email: string;
  role: "admin";
}

export interface IdempotentRequestOptions {
  idempotencyKey?: string;
}



export interface AdminModerationSnapshot {
  listings: Listing[];
  liveListings: Listing[];
  orders: Order[];
  payments: PaymentIntent[];
  reportedListings: Listing[];
  reports: Report[];
  users: User[];
  sellers: SellerProfile[];
}

function normalizeApiBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

export class GemsApiClient {
  private readonly baseUrl: string;
  private readonly getAccessToken?: () => Promise<string | undefined>;

  constructor(baseUrl = "/api/v1", options: { getAccessToken?: () => Promise<string | undefined> } = {}) {
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
    this.getAccessToken = options.getAccessToken;
  }

  async snapshot(): Promise<MarketplaceSnapshot> {
    const response = await fetch(`${this.baseUrl}/snapshot`);
    if (!response.ok) throw new Error("Unable to load marketplace snapshot");
    return response.json() as Promise<MarketplaceSnapshot>;
  }

  async searchListings(params: Record<string, string>): Promise<PaginatedResponse<Listing>> {
    const searchParams = new URLSearchParams(params);
    const response = await fetch(`${this.baseUrl}/search/listings?${searchParams.toString()}`);
    if (!response.ok) throw new Error("Unable to search listings");
    return response.json() as Promise<PaginatedResponse<Listing>>;
  }

  async previewPhone(listingId: string) {
    const response = await fetch(`${this.baseUrl}/listings/${listingId}/reveal-phone`, { method: "POST" });
    if (!response.ok) throw new Error("Unable to reveal phone");
    return response.json() as Promise<{ phone: string; remainingReveals: number }>;
  }

  async revealPhone(listingId: string) {
    return this.authJson<{ phone: string; remainingReveals: number }>(`/listings/${listingId}/reveal-phone?full=1`, { method: "POST" });
  }

  async recordListingInteraction(listingId: string, type: "view" | "whatsapp_click"): Promise<void> {
    await fetch(`${this.baseUrl}/listings/${listingId}/interactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type })
    });
  }

  async reportListing(listingId: string, reason: string, notes?: string): Promise<void> {
    await this.authJson(`/listings/${listingId}/report`, {
      method: "POST",
      body: JSON.stringify({ reason, notes })
    });
  }

  async myReports(): Promise<Report[]> {
    return this.authJson("/users/me/reports");
  }

  async me(): Promise<{ user: User; settings: UserSettings }> {
    return this.authJson("/users/me");
  }

  async updateMe(patch: Partial<User>): Promise<User> {
    return this.authJson("/users/me", { method: "PATCH", body: JSON.stringify(patch) });
  }

  async settings(): Promise<UserSettings> {
    return this.authJson("/users/me/settings");
  }

  async updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
    return this.authJson("/users/me/settings", { method: "PATCH", body: JSON.stringify(patch) });
  }

  async dashboard(): Promise<UserDashboard> {
    return this.authJson("/users/me/dashboard");
  }

  async createListing(input: Partial<Listing>, options: IdempotentRequestOptions = {}): Promise<Listing> {
    return this.authJson("/listings", { method: "POST", body: JSON.stringify(input) }, options);
  }

  async removeMyListing(listingId: string): Promise<Listing> {
    return this.authJson(`/users/me/listings/${listingId}`, { method: "DELETE" });
  }

  async updateMyListing(listingId: string, updates: Partial<Listing>): Promise<Listing> {
    return this.authJson(`/users/me/listings/${listingId}`, { method: "PATCH", body: JSON.stringify(updates) });
  }

  async createListingPaymentIntent(listingId: string, request: { planId: ListingSubscriptionPlanId; photoCount: number; acceptedPolicies: boolean }, options: IdempotentRequestOptions = {}): Promise<PaymentIntent> {
    return this.authJson(`/listings/${listingId}/payment-intents`, { method: "POST", body: JSON.stringify(request) }, options);
  }

  async getListingSubscriptionPaymentIntent(subscriptionId: string): Promise<PaymentIntent> {
    return this.authJson(`/listing-subscriptions/${subscriptionId}/payment-intent`);
  }

  async getPaymentReceipt(paymentIntentId: string): Promise<PaymentReceipt> {
    return this.authJson(`/users/me/payment-intents/${paymentIntentId}/receipt`);
  }

  async downloadPaymentReceipt(paymentIntentId: string): Promise<{ blob: Blob; fileName: string }> {
    const response = await this.authRequest(`/users/me/payment-intents/${paymentIntentId}/receipt-pdf`);
    if (!response.ok) {
      const errorMsg = await readApiError(response);
      throw new Error(errorMsg);
    }
    const fileName = fileNameFromContentDisposition(response.headers.get("content-disposition")) ?? "stripe-receipt.pdf";
    return { blob: await response.blob(), fileName };
  }

  async cancelListingSubscription(subscriptionId: string): Promise<ListingSubscription> {
    return this.authJson(`/listing-subscriptions/${subscriptionId}/cancel`, { method: "PATCH" });
  }

  async cart(): Promise<Cart> {
    return this.authJson("/cart");
  }

  async addCartItem(listingId: string, quantity = 1): Promise<Cart> {
    return this.authJson("/cart/items", { method: "POST", body: JSON.stringify({ listingId, quantity }) });
  }

  async updateCartItem(itemId: string, quantity: number): Promise<Cart> {
    return this.authJson(`/cart/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity }) });
  }

  async removeCartItem(itemId: string): Promise<Cart> {
    return this.authJson(`/cart/items/${itemId}`, { method: "DELETE" });
  }

  async checkout(request: CheckoutRequest): Promise<Order> {
    return this.authJson("/checkout", { method: "POST", body: JSON.stringify(request) });
  }

  async orders(): Promise<Order[]> {
    return this.authJson("/orders");
  }

  async createStorageUpload(request: StorageUploadRequest): Promise<StorageUploadTarget> {
    return this.authJson("/storage/uploads", { method: "POST", body: JSON.stringify(request) });
  }

  private async authJson<T>(path: string, init: RequestInit = {}, options: IdempotentRequestOptions = {}): Promise<T> {
    const response = await this.authRequest(path, init, options);
    return response.json() as Promise<T>;
  }

  private async authRequest(path: string, init: RequestInit = {}, options: IdempotentRequestOptions = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    const token = await this.getAccessToken?.();
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);

    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) throw new Error(await readApiError(response));
    return response;
  }
}

function fileNameFromContentDisposition(value: string | null) {
  if (!value) return undefined;
  const match = value.match(/filename="([^"]+)"/i) ?? value.match(/filename=([^;]+)/i);
  return match?.[1]?.trim();
}

export class GemsAdminApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl = "/api/v1") {
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
  }



  async me(token: string): Promise<AdminSession> {
    const response = await fetch(`${this.baseUrl}/admin/auth/me`, {
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error("Admin session expired");
    return response.json() as Promise<AdminSession>;
  }

  async getPaymentReceipt(token: string, paymentIntentId: string): Promise<PaymentReceipt> {
    const response = await fetch(`${this.baseUrl}/admin/payment-intents/${paymentIntentId}/receipt`, {
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to load receipt");
    return response.json() as Promise<PaymentReceipt>;
  }

  async moderationSnapshot(token: string): Promise<AdminModerationSnapshot> {
    const [listings, reports, liveListings, orders, payments, reportedListings, users, sellers] = await Promise.all([
      this.moderationListings(token),
      this.reports(token),
      this.liveListings(token),
      this.orders(token),
      this.payments(token),
      this.reportedListings(token),
      this.users(token),
      this.sellers(token)
    ]);
    return { listings, reports, liveListings, orders, payments, reportedListings, users, sellers };
  }

  async users(token: string): Promise<User[]> {
    const response = await fetch(`${this.baseUrl}/admin/users`, {
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to load users");
    return response.json() as Promise<User[]>;
  }

  async sellers(token: string): Promise<SellerProfile[]> {
    const response = await fetch(`${this.baseUrl}/admin/sellers`, {
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to load sellers");
    return response.json() as Promise<SellerProfile[]>;
  }

  async moderationListings(token: string): Promise<Listing[]> {
    const response = await fetch(`${this.baseUrl}/admin/moderation/listings`, {
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to load moderation listings");
    return response.json() as Promise<Listing[]>;
  }

  async reports(token: string): Promise<Report[]> {
    const response = await fetch(`${this.baseUrl}/admin/reports`, {
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to load reports");
    return response.json() as Promise<Report[]>;
  }

  async reportedListings(token: string): Promise<Listing[]> {
    const response = await fetch(`${this.baseUrl}/admin/reports/listings`, {
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to load reported listings");
    return response.json() as Promise<Listing[]>;
  }

  async resolveReport(token: string, reportId: string): Promise<Report> {
    const response = await fetch(`${this.baseUrl}/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to resolve report");
    return response.json() as Promise<Report>;
  }

  async moderateListing(token: string, listingId: string, decision: "approve" | "reject", reason?: string): Promise<Listing> {
    const response = await fetch(`${this.baseUrl}/admin/moderation/listings/${listingId}`, {
      method: "PATCH",
      headers: {
        ...adminHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify({ decision, reason })
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to update listing moderation");
    return response.json() as Promise<Listing>;
  }

  async updateListingStatus(token: string, listingId: string, status: "live" | "paused"): Promise<Listing> {
    const response = await fetch(`${this.baseUrl}/admin/listings/${listingId}/status`, {
      method: "PATCH",
      headers: {
        ...adminHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify({ status })
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to update listing status");
    return response.json() as Promise<Listing>;
  }

  async liveListings(token: string): Promise<Listing[]> {
    const response = await fetch(`${this.baseUrl}/admin/listings`, {
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to load live listings");
    return response.json() as Promise<Listing[]>;
  }

  async orders(token: string): Promise<Order[]> {
    const response = await fetch(`${this.baseUrl}/admin/orders`, {
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to load orders");
    return response.json() as Promise<Order[]>;
  }

  async payments(token: string): Promise<PaymentIntent[]> {
    const response = await fetch(`${this.baseUrl}/admin/payments`, {
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to load payments");
    return response.json() as Promise<PaymentIntent[]>;
  }

  async downloadPaymentReceipt(token: string, paymentIntentId: string): Promise<{ blob: Blob; fileName: string }> {
    const response = await fetch(`${this.baseUrl}/admin/payment-intents/${paymentIntentId}/receipt-pdf`, {
      headers: adminHeaders(token)
    });
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Admin session expired");
      }
      const errorMsg = await readApiError(response);
      throw new Error(errorMsg);
    }
    const fileName = fileNameFromContentDisposition(response.headers.get("content-disposition")) ?? "stripe-receipt.pdf";
    return { blob: await response.blob(), fileName };
  }

  async updateOrderStatus(token: string, orderId: string, status: OrderStatus): Promise<Order> {
    const response = await fetch(`${this.baseUrl}/admin/orders/${orderId}/status`, {
      method: "PATCH",
      headers: {
        ...adminHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify({ status })
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to update order status");
    return response.json() as Promise<Order>;
  }

  async removeListing(token: string, listingId: string): Promise<Listing> {
    const response = await fetch(`${this.baseUrl}/admin/listings/${listingId}`, {
      method: "DELETE",
      headers: adminHeaders(token)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to remove listing");
    return response.json() as Promise<Listing>;
  }

  async createCampaign(token: string, listingId: string, campaign: Omit<PromotionCampaign, "id">): Promise<Listing> {
    const response = await fetch(`${this.baseUrl}/admin/listings/${listingId}/campaigns`, {
      method: "POST",
      headers: {
        ...adminHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify(campaign)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to create campaign");
    return response.json() as Promise<Listing>;
  }

  async updateCampaign(token: string, listingId: string, campaignId: string, updates: Partial<PromotionCampaign>): Promise<Listing> {
    const response = await fetch(`${this.baseUrl}/admin/listings/${listingId}/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: {
        ...adminHeaders(token),
        "content-type": "application/json"
      },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin session expired" : "Unable to update campaign");
    return response.json() as Promise<Listing>;
  }
}

function adminHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`
  };
}

async function readApiError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    return typeof body.error === "string" ? sanitizeApiError(body.error) : "API request failed";
  } catch {
    return "API request failed";
  }
}

function sanitizeApiError(message: string) {
  return [
    /\bFirebase(?: Authentication| Admin(?: SDK)?)?\b/i,
    /\bStripe\b/i,
    /\bSupabase\b/i,
    /\bAuth0\b/i,
    /\bClerk\b/i,
    /\bResend\b/i,
    /\bVercel\b/i,
    /\bPostgres(?:ql)?\b/i,
    /\bMongo(?:DB)?\b/i,
    /\bRedis\b/i,
    /\bVITE_(?:ADMIN_)?FIREBASE_[A-Z0-9_]+\b/,
    /\bauth\/[a-z0-9-]+\b/i
  ].some((pattern) => pattern.test(message))
    ? "Request failed. Please try again."
    : message;
}
