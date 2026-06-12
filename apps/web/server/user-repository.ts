import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type {
  Cart,
  CartItem,
  CheckoutDetails,
  CheckoutRequest,
  GemAttributes,
  Listing,
  ListingMedia,
  ListingSubscription,
  ListingSubscriptionPlanId,
  Order,
  OrderItem,
  OrderStatus,
  PaymentIntent,
  PaymentStatus,
  StorageUploadRequest,
  User,
  UserDashboard,
  UserRole,
  UserSettings,
  WishlistItem
} from "@gems/schemas";
import { listingSubscriptionPlans, orderStatuses, quoteListingSubscription, validateCheckoutRequest } from "@gems/schemas";
import type { FirebaseAuthClaims } from "./auth.js";
import { db, hasDatabase } from "./db/index.js";
import { cartItems, carts, conversations, listingSubscriptions, listings, orderItems, orders, paymentIntents, policyAcceptances, sellerProfiles, userSettings, users, wishlists } from "./db/schema.js";
import { getMutableMarketplaceDatabase, type MarketplaceDatabase } from "./marketplace-repository.js";
import { createUserUploadTarget, createSignedReadUrl } from "./storage.js";
import { createWebxpayPaymentUrl } from "./webxpay.js";

type UserPatch = Partial<Pick<User, "name" | "phone" | "locale" | "profileImageKey" | "profileImageUrl">>;
type SettingsPatch = Partial<Pick<UserSettings, "theme" | "notificationsEnabled" | "language" | "dashboardDefaultView" | "savedMarketplaceFilters">>;

interface ListingInput {
  title?: string;
  gemTypeId?: string;
  description?: string;
  priceLkr?: number;
  negotiable?: boolean;
  location?: string;
  attributes?: Partial<GemAttributes>;
  media?: ListingMedia[];
}

interface MemoryState {
  database: MarketplaceDatabase;
  users: User[];
  settings: UserSettings[];
  carts: Cart[];
  orders: Order[];
  wishlists: WishlistItem[];
  listingSubscriptions: ListingSubscription[];
  paymentIntents: PaymentIntent[];
}

let memoryState: MemoryState | undefined;
let checkoutOrderSchemaPromise: Promise<void> | undefined;

export async function getOrCreateUserFromClaims(claims: FirebaseAuthClaims) {
  if (hasDatabase) {
    const existing = await db.select().from(users).where(eq(users.firebaseUid, claims.uid)).limit(1);
    if (existing[0]) return toUser(existing[0]);

    const existingByEmail = await db.select().from(users).where(eq(users.email, claims.email)).limit(1);
    if (existingByEmail[0]) {
      const [updated] = await db
        .update(users)
        .set({
          firebaseUid: claims.uid,
          name: existingByEmail[0].name || claims.name,
          updatedAt: new Date()
        })
        .where(eq(users.id, existingByEmail[0].id))
        .returning();
      await ensureSettings(updated.id);
      return toUser(updated);
    }

    const created = await db
      .insert(users)
      .values({
        id: randomUUID(),
        firebaseUid: claims.uid,
        name: claims.name,
        email: claims.email,
        phone: "",
        role: "buyer"
      })
      .returning();
    await ensureSettings(created[0].id);
    return toUser(created[0]);
  }

  const state = await getMemoryState();
  const existing = state.users.find((user) => user.firebaseUid === claims.uid || user.email === claims.email);
  if (existing) return existing;

  const user: User = {
    id: claims.uid === "local-user" ? "user-local" : `user-${randomUUID()}`,
    firebaseUid: claims.uid,
    name: claims.name,
    phone: "",
    email: claims.email,
    role: "buyer",
    locale: "en",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.users.push(user);
  state.settings.push(defaultSettings(user.id));
  return user;
}

export async function getAllUsers() {
  if (hasDatabase) return (await db.select().from(users)).map(toUser);
  return (await getMemoryState()).users;
}

export async function getUserProfile(userId: string) {
  const [user, settings] = await Promise.all([getUser(userId), getSettings(userId)]);
  return { user, settings };
}

export async function updateUserProfile(userId: string, patch: UserPatch) {
  if (hasDatabase) {
    const [updated] = await db
      .update(users)
      .set({
        name: patch.name,
        phone: patch.phone,
        locale: patch.locale,
        profileImageKey: patch.profileImageKey,
        profileImageUrl: patch.profileImageUrl,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    return toUser(updated);
  }

  const state = await getMemoryState();
  const user = findMemoryUser(state, userId);
  Object.assign(user, withoutUndefined(patch), { updatedAt: new Date().toISOString() });
  return user;
}

export async function getSettings(userId: string): Promise<UserSettings> {
  if (hasDatabase) {
    const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (existing[0]) return toSettings(existing[0]);
    return ensureSettings(userId);
  }

  const state = await getMemoryState();
  const settings = state.settings.find((item) => item.userId === userId);
  if (settings) return settings;
  const created = defaultSettings(userId);
  state.settings.push(created);
  return created;
}

export async function updateSettings(userId: string, patch: SettingsPatch) {
  if (hasDatabase) {
    await ensureSettings(userId);
    const [updated] = await db.update(userSettings).set(withoutUndefined(patch)).where(eq(userSettings.userId, userId)).returning();
    return toSettings(updated);
  }

  const state = await getMemoryState();
  const settings = state.settings.find((item) => item.userId === userId) ?? defaultSettings(userId);
  if (!state.settings.includes(settings)) state.settings.push(settings);
  Object.assign(settings, withoutUndefined(patch));
  return settings;
}

export async function getCart(userId: string): Promise<Cart> {
  if (hasDatabase) {
    const cart = await ensureCart(userId);
    const rows = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
    const listingRows = await db.select().from(listings);
    return {
      id: cart.id,
      userId,
      updatedAt: cart.updatedAt.toISOString(),
      items: rows.map((item) => ({
        id: item.id,
        listingId: item.listingId,
        quantity: item.quantity,
        addedAt: item.addedAt.toISOString(),
        listing: listingRows.find((listing) => listing.id === item.listingId) ? toListing(listingRows.find((listing) => listing.id === item.listingId)!) : undefined
      }))
    };
  }

  const state = await getMemoryState();
  return ensureMemoryCart(state, userId);
}

export async function addCartItem(userId: string, listingId: string, quantity = 1) {
  if (hasDatabase) {
    const cart = await ensureCart(userId);
    const existing = await db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.listingId, listingId)))
      .limit(1);
    if (existing[0]) {
      await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, existing[0].id));
    } else {
      await db.insert(cartItems).values({ id: randomUUID(), cartId: cart.id, listingId, quantity });
    }
    await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id));
    return getCart(userId);
  }

  const state = await getMemoryState();
  const cart = ensureMemoryCart(state, userId);
  const existing = cart.items.find((item) => item.listingId === listingId);
  if (existing) existing.quantity = quantity;
  else cart.items.push({ id: `cart-item-${randomUUID()}`, listingId, quantity, addedAt: new Date().toISOString(), listing: state.database.listings.find((listing) => listing.id === listingId) });
  cart.updatedAt = new Date().toISOString();
  return cart;
}

export async function updateCartItem(userId: string, itemId: string, quantity: number) {
  if (hasDatabase) {
    const cart = await ensureCart(userId);
    await db.update(cartItems).set({ quantity: Math.max(1, quantity) }).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
    return getCart(userId);
  }

  const cart = ensureMemoryCart(await getMemoryState(), userId);
  const item = cart.items.find((entry) => entry.id === itemId);
  if (item) item.quantity = Math.max(1, quantity);
  cart.updatedAt = new Date().toISOString();
  return cart;
}

export async function removeCartItem(userId: string, itemId: string) {
  if (hasDatabase) {
    const cart = await ensureCart(userId);
    await db.delete(cartItems).where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cart.id)));
    return getCart(userId);
  }

  const cart = ensureMemoryCart(await getMemoryState(), userId);
  cart.items = cart.items.filter((item) => item.id !== itemId);
  cart.updatedAt = new Date().toISOString();
  return cart;
}

export async function getWishlist(userId: string) {
  if (hasDatabase) {
    const rows = await db.select().from(wishlists).where(eq(wishlists.userId, userId));
    const listingRows = await db.select().from(listings);
    return rows.map((item) => ({
      id: item.id,
      userId: item.userId,
      listingId: item.listingId,
      addedAt: item.addedAt.toISOString(),
      listing: listingRows.find((listing) => listing.id === item.listingId) ? toListing(listingRows.find((listing) => listing.id === item.listingId)!) : undefined
    }));
  }

  const state = await getMemoryState();
  return state.wishlists
    .filter((item) => item.userId === userId)
    .map((item) => ({ ...item, listing: state.database.listings.find((listing) => listing.id === item.listingId) }));
}

export async function addWishlistItem(userId: string, listingId: string) {
  if (hasDatabase) {
    const existing = await db.select().from(wishlists).where(and(eq(wishlists.userId, userId), eq(wishlists.listingId, listingId))).limit(1);
    if (!existing[0]) await db.insert(wishlists).values({ id: randomUUID(), userId, listingId });
    return getWishlist(userId);
  }

  const state = await getMemoryState();
  if (!state.wishlists.some((item) => item.userId === userId && item.listingId === listingId)) {
    state.wishlists.push({ id: `wishlist-${randomUUID()}`, userId, listingId, addedAt: new Date().toISOString() });
  }
  return getWishlist(userId);
}

export async function removeWishlistItem(userId: string, listingId: string) {
  if (hasDatabase) {
    await db.delete(wishlists).where(and(eq(wishlists.userId, userId), eq(wishlists.listingId, listingId)));
    return getWishlist(userId);
  }

  const state = await getMemoryState();
  state.wishlists = state.wishlists.filter((item) => item.userId !== userId || item.listingId !== listingId);
  return getWishlist(userId);
}

export async function createCheckoutReservation(userId: string, request: CheckoutRequest): Promise<Order> {
  const errors = validateCheckoutRequest(request);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  const cart = await getCart(userId);
  const cartItemsWithListings = cart.items.filter((item) => item.listing?.moderationStatus === "approved");
  if (cart.items.length === 0 || cartItemsWithListings.length === 0) {
    throw new Error("Cart is empty");
  }
  if (cartItemsWithListings.length !== cart.items.length) {
    throw new Error("Cart contains unavailable listings");
  }

  const totalLkr = cartItemsWithListings.reduce((total, item) => total + (item.listing?.priceLkr ?? 0) * item.quantity, 0);
  const now = new Date();
  const reservationExpiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const invoiceNumber = generateInvoiceNumber(now);

  if (hasDatabase) {
    await ensureCheckoutOrderSchema();
    const [order] = await db.insert(orders).values({
      id: randomUUID(),
      userId,
      invoiceNumber,
      totalLkr,
      status: "order_placed",
      paymentMethod: "direct_bank_transfer",
      billingDetails: normalizeCheckoutDetails(request.billingDetails),
      deliveryDetails: normalizeCheckoutDetails(request.deliveryDetails),
      customerNote: normalizeOptionalString(request.customerNote),
      reservationExpiresAt
    }).returning();
    if (cartItemsWithListings.length > 0) {
      await db.insert(orderItems).values(
        cartItemsWithListings.map((item) => {
          const listing = item.listing!;
          return {
          id: randomUUID(),
          orderId: order.id,
          listingId: item.listingId,
          titleSnapshot: listing.title,
          imageUrlSnapshot: listing.media[0]?.url,
          productSummary: productSummary(listing),
          attributesSnapshot: listing.attributes,
          quantity: item.quantity,
          unitPriceLkr: listing.priceLkr
        };
        })
      );
    }
    await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    return getOrder(order.id, userId);
  }

  const state = await getMemoryState();
  const order: Order = {
    id: `order-${randomUUID()}`,
    userId,
    invoiceNumber,
    items: cartItemsWithListings.map<OrderItem>((item) => {
      const listing = item.listing!;
      return {
        id: `order-item-${randomUUID()}`,
        listingId: item.listingId,
        titleSnapshot: listing.title,
        imageUrlSnapshot: listing.media[0]?.url,
        productSummary: productSummary(listing),
        attributesSnapshot: listing.attributes,
        quantity: item.quantity,
        unitPriceLkr: listing.priceLkr
      };
    }),
    totalLkr,
    status: "order_placed",
    paymentMethod: "direct_bank_transfer",
    billingDetails: normalizeCheckoutDetails(request.billingDetails),
    deliveryDetails: normalizeCheckoutDetails(request.deliveryDetails),
    customerNote: normalizeOptionalString(request.customerNote),
    reservationExpiresAt: reservationExpiresAt.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  state.orders.push(order);
  cart.items = [];
  cart.updatedAt = now.toISOString();
  return order;
}

export async function getOrders(userId: string): Promise<Order[]> {
  if (hasDatabase) {
    await ensureCheckoutOrderSchema();
    const rows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
    return Promise.all(rows.map((order) => getOrder(order.id, userId)));
  }

  return (await getMemoryState()).orders
    .filter((order) => order.userId === userId)
    .map(normalizeMemoryOrderImages)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAdminOrders(): Promise<Order[]> {
  if (hasDatabase) {
    await ensureCheckoutOrderSchema();
    const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));
    return Promise.all(rows.map((order) => getOrder(order.id)));
  }

  return [...(await getMemoryState()).orders]
    .map(normalizeMemoryOrderImages)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAdminPaymentIntents(): Promise<PaymentIntent[]> {
  if (hasDatabase) {
    const rows = await db.select().from(paymentIntents).orderBy(desc(paymentIntents.createdAt));
    return rows.map(toPaymentIntent);
  }

  return [...(await getMemoryState()).paymentIntents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order | undefined> {
  if (!orderStatuses.includes(status)) {
    throw new Error("Invalid order status");
  }

  if (hasDatabase) {
    await ensureCheckoutOrderSchema();
    const [updated] = await db.update(orders).set({ status, updatedAt: new Date() }).where(eq(orders.id, orderId)).returning();
    return updated ? getOrder(updated.id) : undefined;
  }

  const order = (await getMemoryState()).orders.find((item) => item.id === orderId);
  if (!order) return undefined;
  order.status = status;
  order.updatedAt = new Date().toISOString();
  return normalizeMemoryOrderImages(order);
}

export async function getDashboard(userId: string): Promise<UserDashboard> {
  const [{ user, settings }, wishlist, subscriptions, payments] = await Promise.all([
    getUserProfile(userId),
    getWishlist(userId),
    getListingSubscriptions(userId),
    getPaymentIntents(userId)
  ]);

  if (hasDatabase) {
    const sellerRows = await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId));
    const sellerIds = new Set(sellerRows.map((seller) => seller.id));
    const [listingRows, conversationRows] = await Promise.all([db.select().from(listings), db.select().from(conversations)]);
    return {
      user,
      settings,
      sellerListings: listingRows.filter((listing) => sellerIds.has(listing.sellerId)).map(toListing),
      conversations: conversationRows
        .filter((conversation) => sellerIds.has(conversation.sellerId))
        .map((conversation) => ({
          id: conversation.id,
          listingId: conversation.listingId,
          buyerName: conversation.buyerName,
          sellerId: conversation.sellerId,
          status: conversation.status as "new" | "active" | "closed",
          lastMessage: conversation.lastMessage,
          updatedAt: conversation.updatedAt.toISOString()
      })),
      wishlistCount: wishlist.length,
      cartCount: 0,
      recentOrders: [],
      listingSubscriptions: subscriptions,
      recentPayments: payments.slice(0, 10)
    };
  }

  const state = await getMemoryState();
  const sellerIds = new Set(state.database.sellers.filter((seller) => seller.userId === userId).map((seller) => seller.id));
  return {
    user,
    settings,
    sellerListings: state.database.listings.filter((listing) => sellerIds.has(listing.sellerId)),
    conversations: state.database.conversations.filter((conversation) => sellerIds.has(conversation.sellerId)),
    wishlistCount: wishlist.length,
    cartCount: 0,
    recentOrders: [],
    listingSubscriptions: subscriptions,
    recentPayments: payments.slice(0, 10)
  };
}

export async function createListing(userId: string, input: ListingInput) {
  const seller = await ensureSellerProfile(userId);
  const now = new Date();
  const listing: Listing = {
    id: `gem-${randomUUID()}`,
    sellerId: seller.id,
    gemTypeId: input.gemTypeId ?? "sapphire",
    title: input.title ?? "Untitled gem listing",
    description: input.description ?? "",
    priceLkr: Number(input.priceLkr ?? 0),
    negotiable: Boolean(input.negotiable),
    location: input.location ?? seller.location,
    status: "draft",
    moderationStatus: "not_submitted",
    attributes: {
      carat: Number(input.attributes?.carat ?? 0),
      dimensions: input.attributes?.dimensions ?? "",
      shape: input.attributes?.shape ?? "",
      cut: input.attributes?.cut ?? "",
      color: input.attributes?.color ?? "",
      clarity: input.attributes?.clarity ?? "",
      origin: input.attributes?.origin ?? "",
      treatment: input.attributes?.treatment ?? "untreated",
      certificateStatus: input.attributes?.certificateStatus ?? "none",
      labName: input.attributes?.labName,
      reportNumber: input.attributes?.reportNumber
    },
    media: input.media ?? [],
    promoted: [],
    campaigns: [],
    stats: { views: 0, saves: 0, phoneReveals: 0, chats: 0, whatsappClicks: 0 },
    publishedAt: undefined,
    expiresAt: undefined
  };

  if (hasDatabase) {
    await db.insert(listings).values({
      ...listing,
      id: listing.id,
      publishedAt: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now
    });
  } else {
    (await getMemoryState()).database.listings.push(listing);
  }
  return listing;
}

export async function removeUserListing(userId: string, listingId: string) {
  const seller = await ensureSellerProfile(userId);
  let deletedFromDb;
  
  if (hasDatabase) {
    const [deleted] = await db.delete(listings).where(and(eq(listings.id, listingId), eq(listings.sellerId, seller.id))).returning();
    if (deleted) deletedFromDb = toListing(deleted);
  }

  const state = await getMemoryState();
  const index = state.database.listings.findIndex((l) => l.id === listingId && l.sellerId === seller.id);
  let deletedFromJson;
  
  if (index >= 0) {
    deletedFromJson = state.database.listings[index];
    state.database.listings.splice(index, 1);
  }
  
  return deletedFromDb || deletedFromJson;
}

export async function updateUserListing(userId: string, listingId: string, input: Partial<ListingInput>) {
  const seller = await ensureSellerProfile(userId);
  if (hasDatabase) {
    const existingRows = await db.select().from(listings).where(and(eq(listings.id, listingId), eq(listings.sellerId, seller.id))).limit(1);
    if (!existingRows[0]) return undefined;

    const existing = existingRows[0];
    const updatedAttributes = { ...existing.attributes, ...input.attributes };
    
    const updates: any = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) updates.description = input.description;
    if (input.priceLkr !== undefined) updates.priceLkr = Number(input.priceLkr);
    if (input.location !== undefined) updates.location = input.location;
    if (input.gemTypeId !== undefined) updates.gemTypeId = input.gemTypeId;
    if (input.media !== undefined) updates.media = input.media;
    if (input.attributes !== undefined) updates.attributes = updatedAttributes;
    
    if (existing.moderationStatus !== "not_submitted" || existing.status !== "draft") {
      updates.moderationStatus = "queued";
      updates.status = "pending_review";
    }
    updates.updatedAt = new Date();

    const [updated] = await db.update(listings).set(updates).where(eq(listings.id, listingId)).returning();
    return toListing(updated);
  }

  const state = await getMemoryState();
  const listing = state.database.listings.find((l) => l.id === listingId && l.sellerId === seller.id);
  if (!listing) return undefined;
  
  if (input.title !== undefined) listing.title = input.title;
  if (input.description !== undefined) listing.description = input.description;
  if (input.priceLkr !== undefined) listing.priceLkr = Number(input.priceLkr);
  if (input.location !== undefined) listing.location = input.location;
  if (input.gemTypeId !== undefined) listing.gemTypeId = input.gemTypeId;
  if (input.media !== undefined) listing.media = input.media;
  if (input.attributes !== undefined) listing.attributes = { ...listing.attributes, ...input.attributes } as GemAttributes;
  
  if (listing.moderationStatus !== "not_submitted" || listing.status !== "draft") {
    listing.moderationStatus = "queued";
    listing.status = "pending_review";
  }
  return listing;
}

export async function createListingPaymentIntent(userId: string, listingId: string, input: { planId?: string; photoCount?: number; acceptedPolicies?: boolean }): Promise<PaymentIntent> {
  const seller = await ensureSellerProfile(userId);
  const planId = input.planId as ListingSubscriptionPlanId;
  if (!listingSubscriptionPlans.some((plan) => plan.id === planId)) {
    throw new Error("Select a valid listing subscription plan.");
  }
  if (!input.acceptedPolicies) {
    throw new Error("Terms and Privacy Policy acceptance is required before payment.");
  }

  const quote = quoteListingSubscription(planId, Number(input.photoCount ?? 0));
  const now = new Date();
  const policyVersion = "2026-06-11";

  if (hasDatabase) {
    const rows = await db.select().from(listings).where(and(eq(listings.id, listingId), eq(listings.sellerId, seller.id))).limit(1);
    if (!rows[0]) throw new Error("Listing not found.");

    const [subscription] = await db.insert(listingSubscriptions).values({
      id: `sub-${randomUUID()}`,
      userId,
      listingId,
      planId,
      status: "pending_payment",
      autoRenew: true,
      createdAt: now,
      updatedAt: now
    }).returning();

    const intentId = `pay-${randomUUID()}`;
    let intent: PaymentIntent = {
      id: intentId,
      userId,
      listingId,
      subscriptionId: subscription.id,
      purpose: "listing_subscription",
      status: "pending",
      planId,
      quote,
      amountLkr: quote.totalLkr,
      currency: "LKR",
      gateway: "webxpay",
      policyVersion,
      policyAcceptedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    intent = { ...intent, paymentUrl: createWebxpayPaymentUrl(intent) };

    const [inserted] = await db.insert(paymentIntents).values({
      id: intent.id,
      userId,
      listingId,
      subscriptionId: subscription.id,
      purpose: intent.purpose,
      status: intent.status,
      planId,
      quote,
      amountLkr: intent.amountLkr,
      currency: intent.currency,
      gateway: intent.gateway,
      paymentUrl: intent.paymentUrl,
      policyVersion,
      policyAcceptedAt: now,
      createdAt: now,
      updatedAt: now
    }).returning();

    await db.update(listingSubscriptions).set({ paymentIntentId: intent.id }).where(eq(listingSubscriptions.id, subscription.id));
    await db.insert(policyAcceptances).values({ id: `policy-${randomUUID()}`, userId, listingId, paymentIntentId: intent.id, policyVersion, acceptedAt: now });
    return toPaymentIntent(inserted);
  }

  const state = await getMemoryState();
  const listing = state.database.listings.find((item) => item.id === listingId && item.sellerId === seller.id);
  if (!listing) throw new Error("Listing not found.");
  const subscription: ListingSubscription = {
    id: `sub-${randomUUID()}`,
    userId,
    listingId,
    planId,
    status: "pending_payment",
    autoRenew: true,
    paymentIntentId: undefined,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  let intent: PaymentIntent = {
    id: `pay-${randomUUID()}`,
    userId,
    listingId,
    subscriptionId: subscription.id,
    purpose: "listing_subscription",
    status: "pending",
    planId,
    quote,
    amountLkr: quote.totalLkr,
    currency: "LKR",
    gateway: "webxpay",
    policyVersion,
    policyAcceptedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  intent = { ...intent, paymentUrl: createWebxpayPaymentUrl(intent) };
  subscription.paymentIntentId = intent.id;
  state.listingSubscriptions.push(subscription);
  state.paymentIntents.push(intent);
  return intent;
}

export async function confirmPaymentIntent(intentId: string, status: PaymentStatus, gatewayReference?: string) {
  if (hasDatabase) {
    const rows = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1);
    if (!rows[0]) return undefined;
    const existing = toPaymentIntent(rows[0]);
    if (existing.status === "succeeded") return existing;
    const nextStatus = status === "succeeded" ? "succeeded" : status === "cancelled" ? "cancelled" : "failed";
    const [updated] = await db.update(paymentIntents).set({ status: nextStatus, gatewayReference, updatedAt: new Date() }).where(eq(paymentIntents.id, intentId)).returning();
    if (nextStatus === "succeeded") await activateListingSubscription(updated.subscriptionId ?? undefined, intentId);
    return toPaymentIntent(updated);
  }

  const state = await getMemoryState();
  const intent = state.paymentIntents.find((item) => item.id === intentId);
  if (!intent) return undefined;
  if (intent.status === "succeeded") return intent;
  intent.status = status === "succeeded" ? "succeeded" : status === "cancelled" ? "cancelled" : "failed";
  intent.gatewayReference = gatewayReference;
  intent.updatedAt = new Date().toISOString();
  if (intent.status === "succeeded") await activateListingSubscription(intent.subscriptionId, intentId);
  return intent;
}

export async function cancelListingSubscription(userId: string, subscriptionId: string) {
  const now = new Date();
  if (hasDatabase) {
    const [updated] = await db.update(listingSubscriptions).set({ autoRenew: false, cancelledAt: now, updatedAt: now }).where(and(eq(listingSubscriptions.id, subscriptionId), eq(listingSubscriptions.userId, userId))).returning();
    return updated ? toListingSubscription(updated) : undefined;
  }

  const subscription = (await getMemoryState()).listingSubscriptions.find((item) => item.id === subscriptionId && item.userId === userId);
  if (!subscription) return undefined;
  subscription.autoRenew = false;
  subscription.cancelledAt = now.toISOString();
  subscription.updatedAt = now.toISOString();
  return subscription;
}

export async function createStorageUpload(userId: string, request: StorageUploadRequest) {
  return createUserUploadTarget(userId, request);
}

async function ensureSettings(userId: string) {
  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (existing[0]) return toSettings(existing[0]);
  const [created] = await db.insert(userSettings).values(defaultSettings(userId)).returning();
  return toSettings(created);
}

async function ensureCart(userId: string) {
  const existing = await db.select().from(carts).where(eq(carts.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db.insert(carts).values({ id: randomUUID(), userId }).returning();
  return created;
}

async function getUser(userId: string): Promise<User> {
  if (hasDatabase) {
    const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing[0]) throw new Error("User not found");
    return toUser(existing[0]);
  }

  return findMemoryUser(await getMemoryState(), userId);
}

async function getOrder(orderId: string, userId?: string): Promise<Order> {
  await ensureCheckoutOrderSchema();
  const whereClause = userId ? and(eq(orders.id, orderId), eq(orders.userId, userId)) : eq(orders.id, orderId);
  const orderRows = await db.select().from(orders).where(whereClause).limit(1);
  if (!orderRows[0]) throw new Error("Order not found");
  const itemRows = await db.select().from(orderItems).where(eq(orderItems.orderId, orderRows[0].id));
  return {
    id: orderRows[0].id,
    userId: orderRows[0].userId,
    invoiceNumber: orderRows[0].invoiceNumber,
    totalLkr: orderRows[0].totalLkr,
    status: orderRows[0].status,
    paymentMethod: orderRows[0].paymentMethod,
    billingDetails: orderRows[0].billingDetails,
    deliveryDetails: orderRows[0].deliveryDetails,
    customerNote: orderRows[0].customerNote ?? undefined,
    reservationExpiresAt: orderRows[0].reservationExpiresAt?.toISOString(),
    createdAt: orderRows[0].createdAt.toISOString(),
    updatedAt: orderRows[0].updatedAt.toISOString(),
    items: itemRows.map((item) => ({
      id: item.id,
      listingId: item.listingId,
      titleSnapshot: item.titleSnapshot,
      imageUrlSnapshot: normalizeOrderImageUrl(item.imageUrlSnapshot),
      productSummary: item.productSummary,
      attributesSnapshot: item.attributesSnapshot ?? undefined,
      quantity: item.quantity,
      unitPriceLkr: item.unitPriceLkr
    }))
  };
}

async function ensureCheckoutOrderSchema() {
  if (!hasDatabase) return;
  checkoutOrderSchemaPromise ??= (async () => {
    await db.execute(sql`alter table order_items drop constraint if exists order_items_listing_id_listings_id_fk`);
    await db.execute(sql`alter table orders add column if not exists invoice_number varchar`);
    await db.execute(sql`alter table orders add column if not exists payment_method varchar not null default 'direct_bank_transfer'`);
    await db.execute(sql`alter table orders add column if not exists billing_details jsonb not null default '{}'::jsonb`);
    await db.execute(sql`alter table orders add column if not exists delivery_details jsonb not null default '{}'::jsonb`);
    await db.execute(sql`alter table orders add column if not exists customer_note text`);
    await db.execute(sql`update orders set status = 'order_placed' where status = 'pending'`);
    await db.execute(sql`
      update orders
      set invoice_number = concat('INV-', to_char(coalesce(created_at, now()), 'YYYYMMDD'), '-', upper(substr(md5(id), 1, 6)))
      where invoice_number is null or invoice_number = ''
    `);
    await db.execute(sql`alter table orders alter column invoice_number set not null`);
    await db.execute(sql`create unique index if not exists orders_invoice_number_unique on orders(invoice_number)`);
    await db.execute(sql`alter table order_items add column if not exists title_snapshot varchar`);
    await db.execute(sql`alter table order_items add column if not exists image_url_snapshot text`);
    await db.execute(sql`alter table order_items add column if not exists product_summary text`);
    await db.execute(sql`alter table order_items add column if not exists attributes_snapshot jsonb`);
    await db.execute(sql`alter table order_items add column if not exists quantity integer not null default 1`);
    await db.execute(sql`alter table order_items add column if not exists unit_price_lkr integer`);
    await db.execute(sql`
      update order_items oi
      set
        title_snapshot = coalesce(oi.title_snapshot, l.title, oi.listing_id),
        image_url_snapshot = coalesce(oi.image_url_snapshot, l.media->0->>'url'),
        product_summary = coalesce(
          oi.product_summary,
          concat_ws(' · ', l.attributes->>'carat' || ' ct', l.attributes->>'color', l.attributes->>'shape')
        ),
        attributes_snapshot = coalesce(oi.attributes_snapshot, l.attributes),
        unit_price_lkr = coalesce(oi.unit_price_lkr, oi.price_lkr, 0)
      from listings l
      where oi.listing_id = l.id
    `);
    await db.execute(sql`
      update order_items
      set
        title_snapshot = coalesce(title_snapshot, listing_id),
        product_summary = coalesce(product_summary, ''),
        unit_price_lkr = coalesce(unit_price_lkr, price_lkr, 0)
    `);
    await db.execute(sql`alter table order_items alter column title_snapshot set not null`);
    await db.execute(sql`alter table order_items alter column product_summary set not null`);
    await db.execute(sql`alter table order_items alter column unit_price_lkr set not null`);
    await db.execute(sql`alter table order_items alter column price_lkr drop not null`);
  })();
  return checkoutOrderSchemaPromise;
}

function normalizeCheckoutDetails(details: CheckoutDetails): CheckoutDetails {
  return {
    fullName: details.fullName.trim(),
    email: details.email.trim(),
    mobile: details.mobile.trim(),
    addressLine1: details.addressLine1.trim(),
    addressLine2: normalizeOptionalString(details.addressLine2),
    city: details.city.trim(),
    district: details.district.trim(),
    postalCode: details.postalCode.trim(),
    country: details.country.trim()
  };
}

function normalizeOptionalString(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function generateInvoiceNumber(date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");
  return `INV-${stamp}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function productSummary(listing: Listing) {
  return [
    `${listing.attributes.carat} ct`,
    listing.attributes.color,
    listing.attributes.shape,
    listing.attributes.treatment,
    listing.location
  ].filter(Boolean).join(" · ");
}

async function ensureSellerProfile(userId: string) {
  if (hasDatabase) {
    const existing = await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId)).limit(1);
    if (existing[0]) return existing[0];
    const user = await getUser(userId);
    const [created] = await db
      .insert(sellerProfiles)
      .values({
        id: `seller-${randomUUID()}`,
        userId,
        displayName: user.name,
        shopSlug: `${user.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${randomUUID().slice(0, 8)}`,
        memberSince: String(new Date().getFullYear()),
        location: "Sri Lanka",
        rating: 0
      })
      .returning();
    return created;
  }

  const state = await getMemoryState();
  const existing = state.database.sellers.find((seller) => seller.userId === userId);
  if (existing) return existing;
  const user = findMemoryUser(state, userId);
  const seller = {
    id: `seller-${randomUUID()}`,
    userId,
    displayName: user.name,
    verificationStatus: "unverified" as const,
    shopSlug: `${user.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${randomUUID().slice(0, 8)}`,
    memberSince: String(new Date().getFullYear()),
    location: "Sri Lanka",
    rating: 0
  };
  state.database.sellers.push(seller);
  return seller;
}

async function getMemoryState() {
  if (memoryState) return memoryState;
  memoryState = {
    database: await getMutableMarketplaceDatabase(),
    users: [],
    settings: [],
    carts: [],
    orders: [],
    wishlists: [],
    listingSubscriptions: [],
    paymentIntents: []
  };
  return memoryState;
}

async function getListingSubscriptions(userId: string): Promise<ListingSubscription[]> {
  if (hasDatabase) {
    const rows = await db.select().from(listingSubscriptions).where(eq(listingSubscriptions.userId, userId)).orderBy(desc(listingSubscriptions.createdAt));
    return rows.map(toListingSubscription);
  }
  return (await getMemoryState()).listingSubscriptions.filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function getPaymentIntents(userId: string): Promise<PaymentIntent[]> {
  if (hasDatabase) {
    const rows = await db.select().from(paymentIntents).where(eq(paymentIntents.userId, userId)).orderBy(desc(paymentIntents.createdAt));
    return rows.map(toPaymentIntent);
  }
  return (await getMemoryState()).paymentIntents.filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function activateListingSubscription(subscriptionId: string | undefined, paymentIntentId: string) {
  if (!subscriptionId) return;
  const now = new Date();

  if (hasDatabase) {
    const rows = await db.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, subscriptionId)).limit(1);
    const subscription = rows[0];
    if (!subscription) return;
    const plan = listingSubscriptionPlans.find((item) => item.id === subscription.planId);
    if (!plan) return;
    const expiresAt = addMonths(now, plan.validityMonths);
    await db.update(listingSubscriptions).set({
      status: "active",
      startsAt: now,
      expiresAt,
      paymentIntentId,
      updatedAt: now
    }).where(eq(listingSubscriptions.id, subscriptionId));
    await db.update(listings).set({
      status: "pending_review",
      moderationStatus: "queued",
      expiresAt,
      updatedAt: now
    }).where(eq(listings.id, subscription.listingId));
    return;
  }

  const state = await getMemoryState();
  const subscription = state.listingSubscriptions.find((item) => item.id === subscriptionId);
  if (!subscription) return;
  const plan = listingSubscriptionPlans.find((item) => item.id === subscription.planId);
  if (!plan) return;
  const expiresAt = addMonths(now, plan.validityMonths);
  subscription.status = "active";
  subscription.startsAt = now.toISOString();
  subscription.expiresAt = expiresAt.toISOString();
  subscription.paymentIntentId = paymentIntentId;
  subscription.updatedAt = now.toISOString();
  const listing = state.database.listings.find((item) => item.id === subscription.listingId);
  if (listing) {
    listing.status = "pending_review";
    listing.moderationStatus = "queued";
    listing.expiresAt = expiresAt.toISOString();
  }
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function ensureMemoryCart(state: MemoryState, userId: string): Cart {
  const existing = state.carts.find((cart) => cart.userId === userId);
  if (existing) {
    existing.items = existing.items.map((item) => ({ ...item, listing: state.database.listings.find((listing) => listing.id === item.listingId) }));
    return existing;
  }
  const cart: Cart = { id: `cart-${randomUUID()}`, userId, items: [], updatedAt: new Date().toISOString() };
  state.carts.push(cart);
  return cart;
}

function findMemoryUser(state: MemoryState, userId: string) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) throw new Error("User not found");
  return user;
}

function defaultSettings(userId: string): UserSettings {
  return {
    userId,
    theme: "system",
    notificationsEnabled: true,
    language: "en",
    dashboardDefaultView: "buyer",
    savedMarketplaceFilters: {}
  };
}

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    firebaseUid: row.firebaseUid ?? undefined,
    name: row.name,
    phone: row.phone,
    email: row.email,
    role: row.role,
    locale: row.locale as User["locale"],
    status: row.status as User["status"],
    profileImageKey: row.profileImageKey ?? undefined,
    profileImageUrl: row.profileImageUrl ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function normalizeOrderImageUrl(value?: string | null) {
  if (!value) return undefined;
  if (value.startsWith("mock-read://")) {
    return createSignedReadUrl(value.slice("mock-read://".length));
  }
  if (value.startsWith("users/")) {
    return createSignedReadUrl(value);
  }
  return value;
}

function normalizeMemoryOrderImages(order: Order): Order {
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      imageUrlSnapshot: normalizeOrderImageUrl(item.imageUrlSnapshot)
    }))
  };
}

function toSettings(row: typeof userSettings.$inferSelect): UserSettings {
  return {
    userId: row.userId,
    theme: row.theme as UserSettings["theme"],
    notificationsEnabled: row.notificationsEnabled,
    language: row.language as UserSettings["language"],
    dashboardDefaultView: row.dashboardDefaultView as UserSettings["dashboardDefaultView"],
    savedMarketplaceFilters: row.savedMarketplaceFilters
  };
}

function toListing(row: typeof listings.$inferSelect): Listing {
  const campaigns = (row as any).campaigns ?? [];
  const now = new Date().toISOString();
  const activePromotions = new Set<import("@gems/schemas").PromotionType>((row as any).promoted ?? []);
  
  for (const campaign of campaigns) {
    if (campaign.status === "active" && campaign.startsAt <= now && campaign.endsAt >= now) {
      activePromotions.add(campaign.type);
    }
  }

  const media = Array.isArray(row.media) ? row.media.map((m: any) => {
    if (m.id && m.id.startsWith("users/")) {
      return { ...m, url: createSignedReadUrl(m.id) };
    }
    return m;
  }) : [];
  
  return {
    id: row.id,
    sellerId: row.sellerId,
    gemTypeId: row.gemTypeId,
    title: row.title,
    description: row.description,
    priceLkr: row.priceLkr,
    negotiable: row.negotiable,
    location: row.location,
    status: row.status as Listing["status"],
    moderationStatus: row.moderationStatus as Listing["moderationStatus"],
    rejectionReason: (row as any).rejectionReason ?? undefined,
    publishedAt: row.publishedAt?.toISOString(),
    expiresAt: row.expiresAt?.toISOString(),
    attributes: row.attributes as any,
    media: media as any,
    promoted: Array.from(activePromotions),
    campaigns,
    stats: row.stats as any
  };
}

function toListingSubscription(row: typeof listingSubscriptions.$inferSelect): ListingSubscription {
  return {
    id: row.id,
    userId: row.userId,
    listingId: row.listingId,
    planId: row.planId,
    status: row.status,
    autoRenew: row.autoRenew,
    startsAt: row.startsAt?.toISOString(),
    expiresAt: row.expiresAt?.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString(),
    paymentIntentId: row.paymentIntentId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toPaymentIntent(row: typeof paymentIntents.$inferSelect): PaymentIntent {
  return {
    id: row.id,
    userId: row.userId,
    listingId: row.listingId,
    subscriptionId: row.subscriptionId ?? undefined,
    purpose: row.purpose,
    status: row.status,
    planId: row.planId,
    quote: row.quote,
    amountLkr: row.amountLkr,
    currency: "LKR",
    gateway: "webxpay",
    gatewayReference: row.gatewayReference ?? undefined,
    paymentUrl: row.paymentUrl ?? undefined,
    policyVersion: row.policyVersion,
    policyAcceptedAt: row.policyAcceptedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function withoutUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
