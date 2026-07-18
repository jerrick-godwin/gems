import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  Cart,
  CartItem,
  BillingHistoryPage,
  BillingInvoice,
  CheckoutDetails,
  CreateListingCheckoutSessionRequest,
  CreateListingCheckoutSessionResponse,
  CheckoutRequest,
  GemAttributes,
  ListingCheckoutDraft,
  ListingCheckoutCompletionResult,
  ListingCheckoutMedia,
  ListingCheckoutSession,
  Listing,
  ListingBillingSummary,
  ListingMedia,
  ListingSubscription,
  ListingSubscriptionPlanId,
  ListingSubscriptionStatus,
  Order,
  OrderItem,
  OrderStatus,
  PaymentIntent,
  PaymentAttempt,
  PaymentReceipt,
  PaymentStatus,
  StorageUploadRequest,
  UpdateListingCheckoutDraftRequest,
  UpdateListingCheckoutSessionRequest,
  User,
  UserDashboard,
  UserTrialSummary,
  UserRole,
  UserSettings
} from "@gems/schemas";
import { orderStatuses, quoteListingSubscription, validateCheckoutRequest, type ListingSubscriptionPlan } from "@gems/schemas";
import type { FirebaseAuthClaims } from "./auth.js";
import { db, hasDatabase } from "./db/index.js";
import { adminAuditLogs, billingInvoices, billingOperations, cartItems, carts, conversations, listingCheckoutSessions, listingContacts, listingMedia, listingSubscriptions, listings, orderItems, orders, paymentIntents, policyAcceptances, renewalEvents, reports, sellerProfiles, stripeWebhookEvents, userSettings, users, subscriptionPlans } from "./db/schema.js";
import { normalizeListingTitle } from "./listing-title.js";
import { getMutableMarketplaceDatabase, type MarketplaceDatabase } from "./marketplace-repository.js";
import { createListingCheckoutUploadTarget, createUserUploadTarget, createSignedReadUrl, deleteBlob, ensureListingCardThumbnail } from "./storage.js";
import { cancelStripeTrialSubscription, createOrRetrieveStripeCustomer, createStripeBillingPortalSession, createStripeCheckoutSession, expireStripeCheckoutSession, isStripeConfigured, retrieveStripeCheckoutSession, retrieveStripeInvoiceSnapshots, retrieveStripeSubscriptionSnapshot, setStripeSubscriptionCancelAtPeriodEnd, updateStripeSubscriptionTrialEnd, retrieveStripeInvoiceUrl, retrieveStripeReceiptPdf, type StripeInvoiceSnapshot, type StripeSubscriptionSnapshot } from "./stripe.js";

type UserPatch = Partial<Pick<User, "name" | "phone" | "address" | "locale" | "profileImageKey" | "profileImageUrl">>;
type SettingsPatch = Partial<Pick<UserSettings, "theme" | "notificationsEnabled" | "language" | "dashboardDefaultView" | "savedMarketplaceFilters">>;

export class DuplicatePhoneNumberError extends Error {
  constructor() {
    super("Phone number is already in use.");
    this.name = "DuplicatePhoneNumberError";
  }
}

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
  listingCheckoutSessions: ListingCheckoutSessionRecord[];
  listingSubscriptions: ListingSubscription[];
  subscriptionPlans: ListingSubscriptionPlan[];
  paymentIntents: PaymentIntent[];
  listingIdempotencyKeys: Record<string, string>;
  paymentIntentIdempotencyKeys: Record<string, string>;
}

interface ListingCheckoutSessionRecord {
  id: string;
  tokenHash: string;
  draft: ListingCheckoutDraft;
  media: ListingCheckoutMedia[];
  selectedPlanId?: string;
  acceptedPolicies: boolean;
  status: "open" | "claimed" | "used" | "expired";
  claimedUserId?: string;
  listingId?: string;
  paymentIntentId?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

let memoryState: MemoryState | undefined;
let checkoutOrderSchemaPromise: Promise<void> | undefined;
const processedMemoryRenewalEventIds = new Set<string>();
const listingCheckoutSessionTtlHours = Number(process.env.LISTING_CHECKOUT_SESSION_TTL_HOURS ?? 24);
const maxListingCheckoutPhotoCount = 15;
const maxListingCheckoutFileSize = 2 * 1024 * 1024;
const userTrialDays = 14;

interface StripePaymentState {
  stripeCheckoutSessionId?: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  stripeInvoiceId?: string;
  scheduledFor?: string;
  livemode?: boolean;
  eventCreated?: number;
  eventId?: string;
}

type BillingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const stripeWebhookTransaction = new AsyncLocalStorage<BillingTransaction>();

async function withBillingTransaction<T>(work: (transaction: BillingTransaction) => Promise<T>): Promise<T> {
  const activeTransaction = stripeWebhookTransaction.getStore();
  return activeTransaction ? work(activeTransaction) : db.transaction(work);
}

function isOlderStripeEvent(eventCreated: number | undefined, lastEventCreated: number | null | undefined) {
  return eventCreated !== undefined && lastEventCreated !== null && lastEventCreated !== undefined && eventCreated < lastEventCreated;
}

function stripeEventFields(
  eventCreated: number | undefined,
  eventId: string | undefined,
  lastEventCreated: number | null | undefined,
  lastEventId: string | null | undefined
) {
  if (eventCreated === undefined || (lastEventCreated !== null && lastEventCreated !== undefined && eventCreated < lastEventCreated)) {
    return {
      lastStripeEventCreated: lastEventCreated ?? undefined,
      lastStripeEventId: lastEventId ?? undefined
    };
  }
  return {
    lastStripeEventCreated: eventCreated,
    lastStripeEventId: eventId ?? lastEventId ?? undefined
  };
}

function listingPaymentGateway(): PaymentIntent["gateway"] {
  if (!isStripeConfigured()) throw new Error("Payment collection is not configured.");
  return "stripe";
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildUserTrial(startedAt: Date | string | undefined, endsAt: Date | string | undefined, terminatedAt?: Date | string | null): UserTrialSummary {
  const start = startedAt ? new Date(startedAt) : new Date();
  const end = endsAt ? new Date(endsAt) : addDays(start, userTrialDays);
  const terminated = terminatedAt ? new Date(terminatedAt) : undefined;
  return {
    status: terminated ? "terminated" : end > new Date() ? "active" : "expired",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    terminatedAt: terminated?.toISOString()
  };
}

function isTrialActiveForUser(user: User) {
  return user.trial?.status === "active" && Boolean(user.trial.endsAt);
}

async function prepareGatewayPayment(userId: string, intent: PaymentIntent): Promise<PaymentIntent> {
  const user = await getUser(userId);
  let existingCustomerId: string | undefined;
  let trialEndsAt: Date | undefined;

  if (hasDatabase) {
    const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    existingCustomerId = userRow?.stripeCustomerId ?? undefined;
    if (intent.subscriptionId) {
      const [subscription] = await db.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, intent.subscriptionId)).limit(1);
      if (subscription?.source === "trial" && subscription.expiresAt && subscription.expiresAt > new Date()) {
        trialEndsAt = subscription.expiresAt;
      }
    }
  } else if (intent.subscriptionId) {
    const subscription = (await getMemoryState()).listingSubscriptions.find((item) => item.id === intent.subscriptionId);
    if (subscription?.source === "trial" && subscription.expiresAt && new Date(subscription.expiresAt) > new Date()) {
      trialEndsAt = new Date(subscription.expiresAt);
    }
  }

  const customerId = await createOrRetrieveStripeCustomer({
    userId,
    email: user.email,
    name: user.name,
    existingCustomerId
  });
  if (hasDatabase && customerId !== existingCustomerId) {
    await db.update(users).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  const stripePayment = await createStripeCheckoutSession(intent, {
    customerId,
    trialEndsAt,
    cancelToken: createPaymentCancelToken(intent.id)
  });
  if (hasDatabase && intent.subscriptionId) {
    await db.update(listingSubscriptions).set({
      stripeCustomerId: customerId,
      updatedAt: new Date()
    }).where(eq(listingSubscriptions.id, intent.subscriptionId));
  }
  return { ...intent, ...stripePayment };
}

function paymentReturnSecret() {
  const secret = process.env.PAYMENT_RETURN_SECRET?.trim()
    || process.env.ADMIN_SESSION_SECRET?.trim()
    || process.env.STRIPE_WEBHOOK_SECRET?.trim()
    || process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("Payment return signing is not configured.");
  return secret;
}

export function createPaymentCancelToken(intentId: string, expiresAt = new Date(Date.now() + 25 * 60 * 60 * 1000)) {
  const expiry = Math.floor(expiresAt.getTime() / 1000).toString(36);
  const signature = createHmac("sha256", paymentReturnSecret()).update(`${intentId}.${expiry}`).digest("base64url");
  return `${expiry}.${signature}`;
}

export function isValidPaymentCancelToken(intentId: string, token: string | null | undefined) {
  if (!token) return false;
  const [expiry, signature, extra] = token.split(".");
  if (!expiry || !signature || extra || Number.parseInt(expiry, 36) * 1000 < Date.now()) return false;
  const expected = createHmac("sha256", paymentReturnSecret()).update(`${intentId}.${expiry}`).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function isUniqueConstraintError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; cause?: { code?: unknown } };
  return value.code === "23505" || value.cause?.code === "23505";
}

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

    try {
      const now = new Date();
      const created = await db
        .insert(users)
        .values({
          id: randomUUID(),
          firebaseUid: claims.uid,
          name: claims.name,
          email: claims.email,
          phone: "",
          role: "buyer",
          trialStartedAt: now,
          trialEndsAt: addDays(now, userTrialDays)
        })
        .returning();
      await ensureSettings(created[0].id);
      return toUser(created[0]);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      const [createdByUid] = await db.select().from(users).where(eq(users.firebaseUid, claims.uid)).limit(1);
      if (createdByUid) {
        await ensureSettings(createdByUid.id);
        return toUser(createdByUid);
      }

      const [createdByEmail] = await db.select().from(users).where(eq(users.email, claims.email)).limit(1);
      if (createdByEmail) {
        await ensureSettings(createdByEmail.id);
        return toUser(createdByEmail);
      }

      throw error;
    }
  }

  const state = await getMemoryState();
  const existing = state.users.find((user) => user.firebaseUid === claims.uid || user.email === claims.email);
  if (existing) return existing;

  const user: User = {
    id: claims.uid === "local-user" ? "user-local" : `user-${randomUUID()}`,
    firebaseUid: claims.uid,
    name: claims.name,
    phone: "",
    address: "",
    email: claims.email,
    role: "buyer",
    locale: "en",
    status: "active",
    trialStartedAt: new Date().toISOString(),
    trialEndsAt: addDays(new Date(), userTrialDays).toISOString(),
    trial: buildUserTrial(new Date(), addDays(new Date(), userTrialDays)),
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

export async function extendUserTrial(userId: string, endsAt: Date) {
  const now = new Date();
  if (!Number.isFinite(endsAt.getTime())) throw new Error("Valid trial end date is required.");
  if (endsAt <= now) throw new Error("Trial end date must be in the future.");

  if (hasDatabase) {
    const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing[0]) return undefined;
    if (endsAt <= existing[0].trialEndsAt) {
      throw new Error("Trial end date must be later than the current trial end date.");
    }
    const [updated] = await db.update(users).set({
      trialEndsAt: endsAt,
      trialTerminatedAt: null,
      updatedAt: now
    }).where(eq(users.id, userId)).returning();
    await refreshTrialBackedListings(userId, endsAt);
    await updateScheduledTrialConversions(userId, endsAt);
    return toUser(updated);
  }

  const user = findMemoryUser(await getMemoryState(), userId);
  const currentEndsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : new Date(user.trial?.endsAt ?? 0);
  if (endsAt <= currentEndsAt) throw new Error("Trial end date must be later than the current trial end date.");
  user.trialEndsAt = endsAt.toISOString();
  user.trialTerminatedAt = undefined;
  user.trial = buildUserTrial(user.trialStartedAt, user.trialEndsAt, user.trialTerminatedAt);
  user.updatedAt = now.toISOString();
  await refreshTrialBackedListings(userId, endsAt);
  return user;
}

export async function terminateUserTrial(userId: string) {
  const now = new Date();

  if (hasDatabase) {
    const [updated] = await db.update(users).set({
      trialTerminatedAt: now,
      updatedAt: now
    }).where(eq(users.id, userId)).returning();
    if (!updated) return undefined;
    await cancelScheduledTrialConversions(userId);
    await expireTrialBackedListings(userId, now);
    return toUser(updated);
  }

  const user = findMemoryUser(await getMemoryState(), userId);
  user.trialTerminatedAt = now.toISOString();
  user.trial = buildUserTrial(user.trialStartedAt, user.trialEndsAt, user.trialTerminatedAt);
  user.updatedAt = now.toISOString();
  await expireTrialBackedListings(userId, now);
  return user;
}

async function updateScheduledTrialConversions(userId: string, endsAt: Date) {
  if (!hasDatabase) return;
  const subscriptions = await db.select().from(listingSubscriptions).where(and(
    eq(listingSubscriptions.userId, userId),
    eq(listingSubscriptions.source, "trial")
  ));
  for (const subscription of subscriptions.filter((item) => item.stripeSubscriptionId && item.scheduledConversionAt)) {
    const stripeSubscriptionId = subscription.stripeSubscriptionId!;
    const operation = await enqueueBillingOperation("update_trial_end", subscription.id, { stripeSubscriptionId, trialEndsAt: endsAt.toISOString() });
    try {
      const snapshot = await updateStripeSubscriptionTrialEnd(stripeSubscriptionId, endsAt);
      await db.update(listingSubscriptions).set({
        stripeStatus: snapshot.status,
        scheduledConversionAt: snapshot.trialEnd ?? endsAt,
        updatedAt: new Date()
      }).where(eq(listingSubscriptions.id, subscription.id));
      await finishBillingOperation(operation?.id);
    } catch (error) {
      await finishBillingOperation(operation?.id, error);
    }
  }
}

async function cancelScheduledTrialConversions(userId: string) {
  if (!hasDatabase) return;
  const subscriptions = await db.select().from(listingSubscriptions).where(and(
    eq(listingSubscriptions.userId, userId),
    eq(listingSubscriptions.source, "trial")
  ));
  for (const subscription of subscriptions.filter((item) => item.stripeSubscriptionId && item.scheduledConversionAt)) {
    const stripeSubscriptionId = subscription.stripeSubscriptionId!;
    const operation = await enqueueBillingOperation("cancel_trial_subscription", subscription.id, { stripeSubscriptionId, reason: "trial_terminated" });
    try {
      await cancelStripeTrialSubscription(stripeSubscriptionId);
      await db.update(listingSubscriptions).set({
        stripeStatus: "canceled",
        scheduledConversionAt: null,
        autoRenew: false,
        updatedAt: new Date()
      }).where(eq(listingSubscriptions.id, subscription.id));
      await finishBillingOperation(operation?.id);
    } catch (error) {
      await finishBillingOperation(operation?.id, error);
    }
  }
}

export async function getUserProfile(userId: string) {
  const [user, settings] = await Promise.all([getUser(userId), getSettings(userId)]);
  return { user, settings };
}

export async function updateUserProfile(userId: string, patch: UserPatch) {
  const currentUser = await getUser(userId);
  const changedPatch = getChangedUserProfilePatch(currentUser, patch);

  if (Object.keys(changedPatch).length === 0) return currentUser;

  await assertUserPhoneAvailable(userId, changedPatch.phone, currentUser.phone);

  if (hasDatabase) {
    const now = new Date();
    const [updated] = await db
      .update(users)
      .set(withoutUndefined({
        name: changedPatch.name,
        phone: changedPatch.phone,
        address: changedPatch.address,
        locale: changedPatch.locale,
        profileImageKey: changedPatch.profileImageKey,
        profileImageUrl: changedPatch.profileImageUrl,
        updatedAt: now
      }))
      .where(eq(users.id, userId))
      .returning();
    await syncSellerDetailsForUser(userId, changedPatch);
    return toUser(updated);
  }

  const state = await getMemoryState();
  const user = findMemoryUser(state, userId);
  Object.assign(user, withoutUndefined(changedPatch), { updatedAt: new Date().toISOString() });
  syncMemorySellerDetailsForUser(state, userId, changedPatch);
  return user;
}

async function assertUserPhoneAvailable(userId: string, phone: string | undefined, currentPhone?: string) {
  const normalizedPhone = normalizeUserPhoneForConflict(phone);
  if (!normalizedPhone) return;
  if (normalizedPhone === normalizeUserPhoneForConflict(currentPhone)) return;

  if (hasDatabase) {
    const existingUsers = await db.select({ id: users.id, phone: users.phone }).from(users);
    const conflict = existingUsers.some((user) => user.id !== userId && normalizeUserPhoneForConflict(user.phone) === normalizedPhone);
    if (conflict) throw new DuplicatePhoneNumberError();
    return;
  }

  const state = await getMemoryState();
  const conflict = state.users.some((user) => user.id !== userId && normalizeUserPhoneForConflict(user.phone) === normalizedPhone);
  if (conflict) throw new DuplicatePhoneNumberError();
}

function normalizeUserPhoneForConflict(phone: string | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("0")) return `94${digits.slice(1)}`;
  return digits;
}

function normalizeIdempotencyKey(key: string | undefined) {
  const normalized = key?.trim();
  return normalized ? normalized.slice(0, 180) : undefined;
}

function stableIdFromKey(prefix: string, key: string) {
  return `${prefix}-${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
}

function getChangedUserProfilePatch(currentUser: User, patch: UserPatch) {
  const changedPatch: UserPatch = {};

  if (patch.name !== undefined && patch.name !== currentUser.name) changedPatch.name = patch.name;
  if (patch.phone !== undefined && patch.phone !== currentUser.phone) changedPatch.phone = patch.phone;
  if (patch.address !== undefined && patch.address !== currentUser.address) changedPatch.address = patch.address;
  if (patch.locale !== undefined && patch.locale !== currentUser.locale) changedPatch.locale = patch.locale;
  if (patch.profileImageKey !== undefined && patch.profileImageKey !== currentUser.profileImageKey) changedPatch.profileImageKey = patch.profileImageKey;
  if (patch.profileImageUrl !== undefined && patch.profileImageUrl !== currentUser.profileImageUrl) changedPatch.profileImageUrl = patch.profileImageUrl;

  return changedPatch;
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
      paymentMethod: "stripe",
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
    paymentMethod: "stripe",
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
    const rows = await db.select().from(paymentIntents).orderBy(desc(paymentIntents.createdAt)).limit(50);
    return rows.map(toPaymentIntent);
  }

  return [...(await getMemoryState()).paymentIntents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
}

interface BillingHistoryFilters {
  listingId?: string;
  cursor?: string;
  status?: string;
  limit?: number;
  search?: string;
}

const attemptStatuses = new Set<PaymentStatus>(["pending", "scheduled", "succeeded", "failed", "cancelled", "expired"]);
const invoiceStatuses = new Set<BillingInvoice["status"]>(["open", "paid", "failed", "action_required", "uncollectible", "void"]);

export async function getBillingHistory(userId: string, filters: BillingHistoryFilters = {}): Promise<BillingHistoryPage> {
  return queryBillingHistory(userId, filters);
}

export async function getAdminBillingHistory(filters: BillingHistoryFilters = {}): Promise<BillingHistoryPage> {
  return queryBillingHistory(undefined, filters);
}

async function queryBillingHistory(userId: string | undefined, filters: BillingHistoryFilters): Promise<BillingHistoryPage> {
  if (!hasDatabase) {
    const attempts = (await getMemoryState()).paymentIntents
      .filter((attempt) => (!userId || attempt.userId === userId) && (!filters.listingId || attempt.listingId === filters.listingId))
      .filter((attempt) => !filters.status || attempt.status === filters.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { attempts: attempts.slice(0, filters.limit ?? 50), invoices: [] };
  }

  const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
  const cursor = decodeBillingCursor(filters.cursor);
  const attemptConditions = [
    ...(userId ? [eq(paymentIntents.userId, userId)] : []),
    ...(filters.listingId ? [eq(paymentIntents.listingId, filters.listingId)] : []),
    ...(cursor ? [cursor.key
      ? sql`(${paymentIntents.createdAt} < ${cursor.createdAt} or (${paymentIntents.createdAt} = ${cursor.createdAt} and ('a:' || ${paymentIntents.id}) < ${cursor.key}))`
      : sql`${paymentIntents.createdAt} < ${cursor.createdAt}`] : [])
  ];
  const invoiceConditions = [
    ...(userId ? [eq(billingInvoices.userId, userId)] : []),
    ...(filters.listingId ? [eq(billingInvoices.listingId, filters.listingId)] : []),
    ...(cursor ? [cursor.key
      ? sql`(${billingInvoices.createdAt} < ${cursor.createdAt} or (${billingInvoices.createdAt} = ${cursor.createdAt} and ('i:' || ${billingInvoices.id}) < ${cursor.key}))`
      : sql`${billingInvoices.createdAt} < ${cursor.createdAt}`] : [])
  ];

  const requestedAttemptStatus = attemptStatuses.has(filters.status as PaymentStatus) ? filters.status as PaymentStatus : undefined;
  const requestedInvoiceStatus = invoiceStatuses.has(filters.status as BillingInvoice["status"]) ? filters.status as BillingInvoice["status"] : undefined;
  if (requestedAttemptStatus) attemptConditions.push(eq(paymentIntents.status, requestedAttemptStatus));
  if (requestedInvoiceStatus) invoiceConditions.push(eq(billingInvoices.status, requestedInvoiceStatus));
  const search = filters.search?.trim();
  if (search) {
    const searchPattern = `%${search}%`;
    attemptConditions.push(sql`(
      concat_ws(' ', ${paymentIntents.id}, ${paymentIntents.userId}, ${paymentIntents.listingId}, ${paymentIntents.subscriptionId}, ${paymentIntents.stripeCheckoutSessionId}, ${paymentIntents.stripeSubscriptionId}, ${paymentIntents.stripeInvoiceId}) ilike ${searchPattern}
      or exists (select 1 from "users" search_user where search_user."id" = ${paymentIntents.userId} and concat_ws(' ', search_user."name", search_user."email") ilike ${searchPattern})
      or exists (select 1 from "listings" search_listing where search_listing."id" = ${paymentIntents.listingId} and search_listing."title" ilike ${searchPattern})
    )`);
    invoiceConditions.push(sql`(
      concat_ws(' ', ${billingInvoices.id}, ${billingInvoices.userId}, ${billingInvoices.listingId}, ${billingInvoices.subscriptionId}, ${billingInvoices.stripeInvoiceId}, ${billingInvoices.stripeSubscriptionId}) ilike ${searchPattern}
      or exists (select 1 from "users" search_user where search_user."id" = ${billingInvoices.userId} and concat_ws(' ', search_user."name", search_user."email") ilike ${searchPattern})
      or exists (select 1 from "listings" search_listing where search_listing."id" = ${billingInvoices.listingId} and search_listing."title" ilike ${searchPattern})
    )`);
  }

  const [attemptRows, invoiceRows] = await Promise.all([
    filters.status && !requestedAttemptStatus
      ? Promise.resolve([])
      : db.select().from(paymentIntents).where(and(...attemptConditions)).orderBy(desc(paymentIntents.createdAt), desc(paymentIntents.id)).limit(limit + 1),
    filters.status && !requestedInvoiceStatus
      ? Promise.resolve([])
      : db.select().from(billingInvoices).where(and(...invoiceConditions)).orderBy(desc(billingInvoices.createdAt), desc(billingInvoices.id)).limit(limit + 1)
  ]);

  const combined = [
    ...attemptRows.map((row) => ({ kind: "attempt" as const, key: `a:${row.id}`, createdAt: row.createdAt, value: toPaymentIntent(row) })),
    ...invoiceRows.map((row) => ({ kind: "invoice" as const, key: `i:${row.id}`, createdAt: row.createdAt, value: toBillingInvoice(row) }))
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.key.localeCompare(a.key));

  const page = combined.slice(0, limit);
  const lastEntry = page.at(-1);
  return {
    attempts: page.filter((entry) => entry.kind === "attempt").map((entry) => entry.value as PaymentAttempt),
    invoices: page.filter((entry) => entry.kind === "invoice").map((entry) => entry.value as BillingInvoice),
    nextCursor: combined.length > limit && lastEntry ? encodeBillingCursor(lastEntry.createdAt, lastEntry.key) : undefined
  };
}

function encodeBillingCursor(createdAt: Date, key: string) {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), key }), "utf8").toString("base64url");
}

function decodeBillingCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: unknown; key?: unknown };
    const createdAt = typeof parsed.createdAt === "string" ? new Date(parsed.createdAt) : undefined;
    if (!createdAt || !Number.isFinite(createdAt.getTime())) return undefined;
    return { createdAt, key: typeof parsed.key === "string" ? parsed.key : undefined };
  } catch {
    const createdAt = new Date(value);
    return Number.isFinite(createdAt.getTime()) ? { createdAt, key: undefined } : undefined;
  }
}

export async function getPaymentAttemptStatus(userId: string, attemptId: string) {
  const attempt = await getPaymentIntent(attemptId);
  if (!attempt || attempt.userId !== userId) return undefined;
  if ((attempt.status === "pending" || attempt.status === "scheduled") && attempt.stripeCheckoutSessionId) {
    try {
      const checkout = await retrieveStripeCheckoutSession(attempt.stripeCheckoutSessionId);
      return await confirmPaymentIntent(attempt.id, checkout.status, checkout.reference, checkout) ?? attempt;
    } catch {
      // Transient verification failures remain pending and are safe to poll again.
    }
  }
  return attempt;
}

export async function createBillingPortalForUser(userId: string, returnUrl?: string) {
  if (!hasDatabase) throw new Error("Billing Portal requires PostgreSQL billing state.");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.stripeCustomerId) throw new Error("No billing account exists yet.");
  const safeReturnUrl = returnUrl && isAllowedBillingReturnUrl(returnUrl) ? returnUrl : undefined;
  return createStripeBillingPortalSession(user.stripeCustomerId, safeReturnUrl);
}

function isAllowedBillingReturnUrl(value: string) {
  try {
    const requested = new URL(value, process.env.PUBLIC_SITE_URL ?? "http://127.0.0.1:4100");
    const site = new URL(process.env.PUBLIC_SITE_URL ?? "http://127.0.0.1:4100");
    return requested.origin === site.origin;
  } catch {
    return false;
  }
}

export async function getBillingInvoice(userId: string, invoiceId: string) {
  if (!hasDatabase) return undefined;
  const [row] = await db.select().from(billingInvoices).where(and(eq(billingInvoices.id, invoiceId), eq(billingInvoices.userId, userId))).limit(1);
  return row ? toBillingInvoice(row) : undefined;
}

export async function getAdminBillingInvoice(invoiceId: string) {
  if (!hasDatabase) return undefined;
  const [row] = await db.select().from(billingInvoices).where(eq(billingInvoices.id, invoiceId)).limit(1);
  return row ? toBillingInvoice(row) : undefined;
}

export async function getBillingInvoiceReceipt(userId: string, invoiceId: string) {
  const invoice = await getBillingInvoice(userId, invoiceId);
  return invoice?.status === "paid" ? buildPaymentReceiptForInvoice(invoice) : undefined;
}

export async function getAdminBillingInvoiceReceipt(invoiceId: string) {
  const invoice = await getAdminBillingInvoice(invoiceId);
  return invoice?.status === "paid" ? buildPaymentReceiptForInvoice(invoice) : undefined;
}

export async function getBillingInvoiceReceiptPdf(userId: string, invoiceId: string) {
  const invoice = await getBillingInvoice(userId, invoiceId);
  if (!invoice || invoice.status !== "paid") return undefined;
  return retrieveStripeReceiptPdf(invoice.stripeInvoiceId);
}

export async function getAdminBillingInvoiceReceiptPdf(invoiceId: string) {
  const invoice = await getAdminBillingInvoice(invoiceId);
  if (!invoice || invoice.status !== "paid") return undefined;
  return retrieveStripeReceiptPdf(invoice.stripeInvoiceId);
}

async function buildPaymentReceiptForInvoice(invoice: BillingInvoice): Promise<PaymentReceipt | undefined> {
  const attempt = invoice.paymentAttemptId
    ? await getPaymentIntent(invoice.paymentAttemptId)
    : await getLatestPaymentIntentForSubscription(invoice.subscriptionId);
  if (!attempt) return undefined;
  const base = await buildPaymentReceiptForIntent({
    ...attempt,
    status: invoice.status === "paid" ? "succeeded" : attempt.status,
    stripeInvoiceId: invoice.stripeInvoiceId,
    stripeCustomerId: invoice.stripeCustomerId ?? attempt.stripeCustomerId,
    stripeSubscriptionId: invoice.stripeSubscriptionId ?? attempt.stripeSubscriptionId,
    updatedAt: invoice.paidAt ?? invoice.updatedAt
  });
  if (!base) return undefined;
  return {
    ...base,
    billingInvoiceId: invoice.id,
    receiptNumber: invoice.stripeInvoiceId,
    paidAt: invoice.paidAt ?? invoice.updatedAt,
    chargedAmountMinor: invoice.chargedAmountMinor,
    chargedCurrency: invoice.chargedCurrency,
    servicePeriod: invoice.servicePeriodStart || invoice.servicePeriodEnd
      ? { startsAt: invoice.servicePeriodStart, endsAt: invoice.servicePeriodEnd }
      : undefined,
    stripe: {
      ...base.stripe,
      invoiceId: invoice.stripeInvoiceId,
      hostedInvoiceUrl: invoice.hostedInvoiceUrl,
      invoicePdfUrl: invoice.invoicePdfUrl
    }
  };
}

async function getLatestPaymentIntentForSubscription(subscriptionId: string | undefined) {
  if (!subscriptionId) return undefined;
  if (hasDatabase) {
    const [row] = await db.select().from(paymentIntents).where(eq(paymentIntents.subscriptionId, subscriptionId)).orderBy(desc(paymentIntents.createdAt)).limit(1);
    return row ? toPaymentIntent(row) : undefined;
  }
  return (await getMemoryState()).paymentIntents
    .filter((attempt) => attempt.subscriptionId === subscriptionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export async function getPaymentIntent(intentId: string): Promise<PaymentIntent | undefined> {
  if (hasDatabase) {
    const rows = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1);
    return rows[0] ? toPaymentIntent(rows[0]) : undefined;
  }

  return (await getMemoryState()).paymentIntents.find((item) => item.id === intentId);
}

export async function getPaymentReceipt(userId: string, intentId: string): Promise<PaymentReceipt | undefined> {
  const intent = await getPaymentIntent(intentId);
  if (!intent || intent.userId !== userId || intent.status !== "succeeded") return undefined;
  const invoice = await findBillingInvoiceForAttempt(intent);
  if (invoice) return buildPaymentReceiptForInvoice(invoice);
  return buildPaymentReceiptForIntent(intent);
}

export async function getAdminPaymentReceipt(intentId: string): Promise<PaymentReceipt | undefined> {
  const intent = await getPaymentIntent(intentId);
  if (!intent || intent.status !== "succeeded") return undefined;
  const invoice = await findBillingInvoiceForAttempt(intent);
  if (invoice) return buildPaymentReceiptForInvoice(invoice);
  return buildPaymentReceiptForIntent(intent);
}

async function findBillingInvoiceForAttempt(intent: PaymentIntent) {
  if (!hasDatabase) return undefined;
  const [row] = await db.select().from(billingInvoices)
    .where(sql`${billingInvoices.paymentAttemptId} = ${intent.id} or (${billingInvoices.stripeInvoiceId} = ${intent.stripeInvoiceId ?? ""})`)
    .orderBy(desc(billingInvoices.paidAt), desc(billingInvoices.createdAt))
    .limit(1);
  return row ? toBillingInvoice(row) : undefined;
}

async function buildPaymentReceiptForIntent(intent: PaymentIntent): Promise<PaymentReceipt | undefined> {
  let invoicePdfUrl: string | undefined;
  if (intent.stripeInvoiceId) {
    invoicePdfUrl = await retrieveStripeInvoiceUrl(intent.stripeInvoiceId);
  }

  const user = await getUser(intent.userId);
  if (hasDatabase) {
    const [listingRows, subscriptionRows] = await Promise.all([
      db.select().from(listings).where(eq(listings.id, intent.listingId)).limit(1),
      intent.subscriptionId
        ? db.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, intent.subscriptionId)).limit(1)
        : Promise.resolve([])
    ]);
    const listing = listingRows[0] ? toListing(listingRows[0]) : undefined;
    if (!listing) return undefined;
    return buildPaymentReceipt(intent, user, listing, subscriptionRows[0] ? toListingSubscription(subscriptionRows[0]) : undefined, invoicePdfUrl);
  }

  const state = await getMemoryState();
  const listing = state.database.listings.find((item) => item.id === intent.listingId);
  if (!listing) return undefined;
  const subscription = intent.subscriptionId
    ? state.listingSubscriptions.find((item) => item.id === intent.subscriptionId)
    : undefined;
  return buildPaymentReceipt(intent, user, listing, subscription, invoicePdfUrl);
}

export async function getPaymentReceiptPdf(userId: string, intentId: string) {
  const intent = await getPaymentIntent(intentId);
  if (!intent || intent.userId !== userId || intent.status !== "succeeded" || !intent.stripeInvoiceId) return undefined;
  const invoice = await findBillingInvoiceForAttempt(intent);
  return retrieveStripeReceiptPdf(invoice?.stripeInvoiceId ?? intent.stripeInvoiceId);
}

export async function getAdminPaymentReceiptPdf(intentId: string) {
  const intent = await getPaymentIntent(intentId);
  if (!intent || intent.status !== "succeeded" || !intent.stripeInvoiceId) return undefined;
  const invoice = await findBillingInvoiceForAttempt(intent);
  return retrieveStripeReceiptPdf(invoice?.stripeInvoiceId ?? intent.stripeInvoiceId);
}

export async function getListingSubscriptionPaymentIntent(userId: string, subscriptionId: string, idempotencyKey?: string): Promise<PaymentIntent | undefined> {
  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
  if (hasDatabase) {
    const subscriptions = await db.select().from(listingSubscriptions).where(and(eq(listingSubscriptions.id, subscriptionId), eq(listingSubscriptions.userId, userId))).limit(1);
    const subscription = subscriptions[0];
    if (!subscription) return undefined;
    const [listing] = await db.select().from(listings).where(eq(listings.id, subscription.listingId)).limit(1);
    if (!listing || listing.status === "paused") return undefined;
    if (normalizedIdempotencyKey) {
      const [keyedAttempt] = await db.select().from(paymentIntents).where(and(
        eq(paymentIntents.userId, userId),
        eq(paymentIntents.listingId, subscription.listingId),
        eq(paymentIntents.idempotencyKey, normalizedIdempotencyKey)
      )).limit(1);
      if (keyedAttempt) return ensurePaymentIntentCheckoutUrl(toPaymentIntent(keyedAttempt));
    }
    const rows = await db.select().from(paymentIntents).where(and(eq(paymentIntents.subscriptionId, subscriptionId), eq(paymentIntents.userId, userId))).orderBy(desc(paymentIntents.createdAt)).limit(1);
    const existing = rows[0] ? toPaymentIntent(rows[0]) : undefined;
    if ((existing?.status === "pending" || existing?.status === "scheduled") && existing.paymentUrl) return existing;

    const canRestartInitialPayment = subscription.status === "pending_payment" || (subscription.status === "cancelled" && !subscription.startsAt && !subscription.expiresAt);
    if (!canRestartInitialPayment) return existing;

    if (subscription.stripeSubscriptionId && existing && (existing.status === "failed" || existing.status === "cancelled" || existing.status === "expired")) {
      const replacedStripeSubscriptionId = subscription.stripeSubscriptionId;
      const operation = await enqueueBillingOperation("cancel_replaced_subscription", subscription.id, { stripeSubscriptionId: replacedStripeSubscriptionId });
      try {
        await cancelStripeTrialSubscription(replacedStripeSubscriptionId);
        await finishBillingOperation(operation?.id);
      } catch (error) {
        await finishBillingOperation(operation?.id, error);
      }
    }

    const now = new Date();
    const plan = (await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, subscription.planId)).limit(1))[0];
    if (!plan) throw new Error("Unknown plan");
    const quote = quoteListingSubscription(plan, countListingPhotos(listing.media));
    let intent: PaymentIntent = {
      id: normalizedIdempotencyKey ? stableIdFromKey("pay", `${userId}:${subscription.listingId}:${normalizedIdempotencyKey}`) : `pay-${randomUUID()}`,
      userId,
      listingId: subscription.listingId,
      subscriptionId,
      purpose: "listing_subscription",
      status: "pending",
      planId: subscription.planId,
      quote,
      amountLkr: quote.totalLkr,
      currency: "LKR",
      gateway: listingPaymentGateway(),
      policyVersion: "2026-06-11",
      policyAcceptedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    intent = await prepareGatewayPayment(userId, intent);

    let inserted: typeof paymentIntents.$inferSelect;
    try {
      [inserted] = await db.insert(paymentIntents).values({
        id: intent.id,
        userId,
        listingId: subscription.listingId,
        idempotencyKey: normalizedIdempotencyKey,
        subscriptionId,
        purpose: intent.purpose,
        status: intent.status,
        planId: subscription.planId,
        quote,
        amountLkr: intent.amountLkr,
        currency: intent.currency,
        gateway: intent.gateway,
        gatewayReference: intent.gatewayReference,
        stripeCheckoutSessionId: intent.stripeCheckoutSessionId,
        stripeSubscriptionId: intent.stripeSubscriptionId,
        stripeCustomerId: intent.stripeCustomerId,
        stripeInvoiceId: intent.stripeInvoiceId,
        stripeLivemode: intent.livemode,
        paymentUrl: intent.paymentUrl,
        policyVersion: intent.policyVersion,
        policyAcceptedAt: now,
        createdAt: now,
        updatedAt: now
      }).returning();
    } catch (error) {
      if (!normalizedIdempotencyKey || !isUniqueConstraintError(error)) throw error;
      const [existingAttempt] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intent.id)).limit(1);
      if (existingAttempt) return toPaymentIntent(existingAttempt);
      throw error;
    }

    await db.update(listingSubscriptions).set({
      status: "pending_payment",
      autoRenew: true,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      stripeSubscriptionId: null,
      stripeStatus: null,
      paymentIntentId: intent.id,
      updatedAt: now
    }).where(eq(listingSubscriptions.id, subscriptionId));
    await db.insert(policyAcceptances).values({ id: `policy-${randomUUID()}`, userId, listingId: subscription.listingId, paymentIntentId: intent.id, policyVersion: intent.policyVersion, acceptedAt: now });
    return toPaymentIntent(inserted);
  }

  const state = await getMemoryState();
  const subscription = state.listingSubscriptions.find((item) => item.id === subscriptionId && item.userId === userId);
  if (!subscription) return undefined;
  const listing = state.database.listings.find((item) => item.id === subscription.listingId);
  if (!listing || listing.status === "paused") return undefined;
  const memoryKey = normalizedIdempotencyKey ? `${userId}:${subscription.listingId}:${normalizedIdempotencyKey}` : "";
  const keyedAttemptId = memoryKey ? state.paymentIntentIdempotencyKeys[memoryKey] : undefined;
  const keyedAttempt = keyedAttemptId ? state.paymentIntents.find((item) => item.id === keyedAttemptId) : undefined;
  if (keyedAttempt) return keyedAttempt.paymentUrl ? keyedAttempt : prepareAndUpdateMemoryPaymentIntent(keyedAttempt);
  const existing = state.paymentIntents
    .filter((item) => item.subscriptionId === subscriptionId && item.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (existing?.status === "pending" && existing.paymentUrl) return existing;
  const canRestartInitialPayment = subscription.status === "pending_payment" || (subscription.status === "cancelled" && !subscription.startsAt && !subscription.expiresAt);
  if (!canRestartInitialPayment) return existing;

  const now = new Date();
  const plan = state.subscriptionPlans.find(p => p.id === subscription.planId);
  if (!plan) throw new Error("Unknown plan");
  const quote = quoteListingSubscription(plan, countListingPhotos(listing.media));
  let intent: PaymentIntent = {
    id: normalizedIdempotencyKey ? stableIdFromKey("pay", memoryKey) : `pay-${randomUUID()}`,
    userId,
    listingId: subscription.listingId,
    subscriptionId,
    purpose: "listing_subscription",
    status: "pending",
    planId: subscription.planId,
    quote,
    amountLkr: quote.totalLkr,
    currency: "LKR",
    gateway: listingPaymentGateway(),
    policyVersion: "2026-06-11",
    policyAcceptedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  intent = await prepareGatewayPayment(userId, intent);
  subscription.status = "pending_payment";
  subscription.autoRenew = true;
  subscription.cancelledAt = undefined;
  subscription.paymentIntentId = intent.id;
  subscription.updatedAt = now.toISOString();
  state.paymentIntents.push(intent);
  if (memoryKey) state.paymentIntentIdempotencyKeys[memoryKey] = intent.id;
  return intent;
}

export async function createListingSubscriptionPaymentAttempt(userId: string, subscriptionId: string, idempotencyKey?: string) {
  const subscription = await getListingSubscriptionById(subscriptionId);
  if (!subscription || subscription.userId !== userId) return undefined;
  return subscription.source === "trial"
    ? convertTrialSubscriptionToPaymentIntent(userId, subscriptionId, idempotencyKey)
    : getListingSubscriptionPaymentIntent(userId, subscriptionId, idempotencyKey);
}

export async function convertTrialSubscriptionToPaymentIntent(userId: string, subscriptionId: string, idempotencyKey?: string): Promise<PaymentIntent | undefined> {
  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);

  if (hasDatabase) {
    const subscriptions = await db.select().from(listingSubscriptions).where(and(eq(listingSubscriptions.id, subscriptionId), eq(listingSubscriptions.userId, userId))).limit(1);
    const subscription = subscriptions[0];
    if (!subscription || subscription.source !== "trial") return undefined;
    const [listing] = await db.select().from(listings).where(eq(listings.id, subscription.listingId)).limit(1);
    if (!listing || listing.status === "paused") return undefined;

    if (normalizedIdempotencyKey) {
      const keyedRows = await db.select().from(paymentIntents).where(and(eq(paymentIntents.userId, userId), eq(paymentIntents.listingId, subscription.listingId), eq(paymentIntents.idempotencyKey, normalizedIdempotencyKey))).limit(1);
      if (keyedRows[0]) return ensurePaymentIntentCheckoutUrl(toPaymentIntent(keyedRows[0]));
    }

    const rows = await db.select().from(paymentIntents).where(and(eq(paymentIntents.subscriptionId, subscriptionId), eq(paymentIntents.userId, userId))).orderBy(desc(paymentIntents.createdAt)).limit(1);
    const existing = rows[0] ? toPaymentIntent(rows[0]) : undefined;
    if ((existing?.status === "pending" || existing?.status === "scheduled") && existing.paymentUrl) return existing;
    if (existing?.status === "succeeded") return existing;

    const plan = await fetchSubscriptionPlan(subscription.planId);
    if (!plan) throw new Error("Unknown plan");

    const now = new Date();
    const quote = quoteListingSubscription(plan, countListingPhotos(listing.media));
    let intent: PaymentIntent = {
      id: normalizedIdempotencyKey ? stableIdFromKey("pay", `${userId}:${subscription.listingId}:${normalizedIdempotencyKey}`) : `pay-${randomUUID()}`,
      userId,
      listingId: subscription.listingId,
      subscriptionId,
      purpose: "listing_subscription",
      status: "pending",
      planId: subscription.planId,
      quote,
      amountLkr: quote.totalLkr,
      currency: "LKR",
      gateway: listingPaymentGateway(),
      policyVersion: "2026-06-11",
      policyAcceptedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    intent = await prepareGatewayPayment(userId, intent);

    const [inserted] = await db.insert(paymentIntents).values({
      id: intent.id,
      userId,
      listingId: subscription.listingId,
      idempotencyKey: normalizedIdempotencyKey,
      subscriptionId,
      purpose: intent.purpose,
      status: intent.status,
      planId: subscription.planId,
      quote,
      amountLkr: intent.amountLkr,
      currency: intent.currency,
      gateway: intent.gateway,
      gatewayReference: intent.gatewayReference,
      stripeCheckoutSessionId: intent.stripeCheckoutSessionId,
      stripeSubscriptionId: intent.stripeSubscriptionId,
      stripeCustomerId: intent.stripeCustomerId,
      stripeInvoiceId: intent.stripeInvoiceId,
      stripeLivemode: intent.livemode,
      paymentUrl: intent.paymentUrl,
      policyVersion: intent.policyVersion,
      policyAcceptedAt: now,
      createdAt: now,
      updatedAt: now
    }).returning();
    await db.update(listingSubscriptions).set({ paymentIntentId: intent.id, updatedAt: now }).where(eq(listingSubscriptions.id, subscriptionId));
    return toPaymentIntent(inserted);
  }

  const state = await getMemoryState();
  const subscription = state.listingSubscriptions.find((item) => item.id === subscriptionId && item.userId === userId);
  if (!subscription || subscription.source !== "trial") return undefined;
  const listing = state.database.listings.find((item) => item.id === subscription.listingId);
  if (!listing || listing.status === "paused") return undefined;
  const existing = state.paymentIntents
    .filter((item) => item.subscriptionId === subscriptionId && item.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (existing?.status === "pending" || existing?.status === "scheduled" || existing?.status === "succeeded") return existing.paymentUrl ? existing : prepareAndUpdateMemoryPaymentIntent(existing);

  const plan = state.subscriptionPlans.find((item) => item.id === subscription.planId);
  if (!plan) return undefined;
  const now = new Date();
  const quote = quoteListingSubscription(plan, countListingPhotos(listing.media));
  const memoryKey = normalizedIdempotencyKey ? `${userId}:${subscription.listingId}:${normalizedIdempotencyKey}` : "";
  let intent: PaymentIntent = {
    id: normalizedIdempotencyKey ? stableIdFromKey("pay", memoryKey) : `pay-${randomUUID()}`,
    userId,
    listingId: subscription.listingId,
    subscriptionId,
    purpose: "listing_subscription",
    status: "pending",
    planId: subscription.planId,
    quote,
    amountLkr: quote.totalLkr,
    currency: "LKR",
    gateway: listingPaymentGateway(),
    policyVersion: "2026-06-11",
    policyAcceptedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  intent = await prepareGatewayPayment(userId, intent);
  subscription.paymentIntentId = intent.id;
  subscription.updatedAt = now.toISOString();
  state.paymentIntents.push(intent);
  return intent;
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
  await expireExpiredTrialSubscriptions(userId);
  const [{ user, settings }, subscriptions, payments] = await Promise.all([
    getUserProfile(userId),
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
      // sellerListings removed in favor of paginated endpoint
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
    // sellerListings removed in favor of paginated endpoint
    conversations: state.database.conversations.filter((conversation) => sellerIds.has(conversation.sellerId)),
    cartCount: 0,
    recentOrders: [],
    listingSubscriptions: subscriptions,
    recentPayments: payments.slice(0, 10)
  };
}

export async function getMyListings(userId: string, search: string = "", page: number = 1, limit: number = 10): Promise<{ items: Listing[], total: number, page: number, limit: number, totalPages: number }> {
  const offset = (page - 1) * limit;

  if (hasDatabase) {
    const sellerRows = await db.select().from(sellerProfiles).where(eq(sellerProfiles.userId, userId));
    const sellerIds = sellerRows.map(s => s.id);
    if (sellerIds.length === 0) {
      return { items: [], total: 0, page, limit, totalPages: 0 };
    }
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(listings).where(inArray(listings.sellerId, sellerIds));
    if (search) {
      countQuery = db.select({ count: sql<number>`count(*)` }).from(listings).where(and(inArray(listings.sellerId, sellerIds), ilike(listings.title, `%${search}%`)));
    }
    const countResult = await countQuery;
    const total = Number(countResult[0]?.count || 0);

    const baseQuery = search
      ? db.select().from(listings).where(and(inArray(listings.sellerId, sellerIds), ilike(listings.title, `%${search}%`)))
      : db.select().from(listings).where(inArray(listings.sellerId, sellerIds));

    const rows = await baseQuery.limit(limit).offset(offset).orderBy(desc(listings.createdAt));
    const totalPages = Math.ceil(total / limit);
    return { items: rows.map(toListing), total, page, limit, totalPages };
  }

  const state = await getMemoryState();
  const sellerIds = state.database.sellers.filter(s => s.userId === userId).map(s => s.id);
  if (sellerIds.length === 0) {
    return { items: [], total: 0, page, limit, totalPages: 0 };
  }

  const sellerIdSet = new Set(sellerIds);
  let allListings = state.database.listings.filter(l => sellerIdSet.has(l.sellerId));
  if (search) {
    const searchLower = search.toLowerCase();
    allListings = allListings.filter(l => l.title.toLowerCase().includes(searchLower));
  }
  allListings.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  
  const total = allListings.length;
  const items = allListings.slice(offset, offset + limit);
  const totalPages = Math.ceil(total / limit);
  return { items, total, page, limit, totalPages };
}

export async function createListing(userId: string, input: ListingInput, idempotencyKey?: string) {
  const seller = await ensureSellerProfile(userId);
  const sellerUser = await getUser(userId);
  const now = new Date();
  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);

  if (hasDatabase && normalizedIdempotencyKey) {
    const existing = await db.select().from(listings).where(and(eq(listings.sellerId, seller.id), eq(listings.idempotencyKey, normalizedIdempotencyKey))).limit(1);
    if (existing[0]) return toListing(existing[0]);
  }

  if (!hasDatabase && normalizedIdempotencyKey) {
    const state = await getMemoryState();
    const existingId = state.listingIdempotencyKeys[`${seller.id}:${normalizedIdempotencyKey}`];
    const existing = existingId ? state.database.listings.find((item) => item.id === existingId) : undefined;
    if (existing) return existing;
  }

  const listing: Listing = {
    id: normalizedIdempotencyKey ? stableIdFromKey("gem", `${seller.id}:${normalizedIdempotencyKey}`) : `gem-${randomUUID()}`,
    sellerId: seller.id,
    gemTypeId: input.gemTypeId ?? "sapphire",
    title: normalizeListingTitle(input.title ?? "Untitled gem listing"),
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
    try {
      await db.insert(listings).values({
        ...listing,
        idempotencyKey: normalizedIdempotencyKey,
        id: listing.id,
        publishedAt: null,
        expiresAt: null,
        createdAt: now,
        updatedAt: now
      });
    } catch (error) {
      if (!normalizedIdempotencyKey || !isUniqueConstraintError(error)) throw error;
      const existing = await db.select().from(listings).where(and(eq(listings.sellerId, seller.id), eq(listings.idempotencyKey, normalizedIdempotencyKey))).limit(1);
      if (existing[0]) return toListing(existing[0]);
      throw error;
    }
    await db
      .insert(listingContacts)
      .values({
        listingId: listing.id,
        phone: sellerUser.phone,
        remainingReveals: 0
      })
      .onConflictDoUpdate({
        target: listingContacts.listingId,
        set: { phone: sellerUser.phone }
      });
  } else {
    const state = await getMemoryState();
    state.database.listings.push(listing);
    if (normalizedIdempotencyKey) state.listingIdempotencyKeys[`${seller.id}:${normalizedIdempotencyKey}`] = listing.id;
    state.database.listingContacts[listing.id] = {
      phone: sellerUser.phone,
      remainingReveals: 0
    };
  }
  return listing;
}

export async function createListingCheckoutSession(
  request: CreateListingCheckoutSessionRequest,
  siteUrl: string
): Promise<CreateListingCheckoutSessionResponse> {
  const draft = normalizeListingCheckoutDraft(request.draft);
  const mediaInputs = normalizeListingCheckoutMediaInputs(request.media);
  const selectedPlanId = normalizeOptionalString(request.selectedPlanId) ?? "pro";
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashListingCheckoutToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(1, listingCheckoutSessionTtlHours) * 60 * 60 * 1000);
  const id = `listing-checkout-${randomUUID()}`;
  const uploadTargets = [];
  const media: ListingCheckoutMedia[] = [];

  for (const [index, item] of mediaInputs.entries()) {
    const target = await createListingCheckoutUploadTarget(id, item);
    const mediaId = `checkout-media-${randomUUID()}`;
    media.push({
      id: mediaId,
      kind: item.kind,
      fileName: item.fileName,
      contentType: item.contentType,
      size: item.size,
      blobKey: target.blobKey,
      readUrl: target.readUrl,
      order: item.kind === "photo" ? index : 0
    });
    uploadTargets.push({ mediaId, ...target });
  }

  const record: ListingCheckoutSessionRecord = {
    id,
    tokenHash,
    draft,
    media,
    selectedPlanId,
    acceptedPolicies: false,
    status: "open",
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  if (hasDatabase) {
    await db.insert(listingCheckoutSessions).values({
      id: record.id,
      tokenHash: record.tokenHash,
      draft: record.draft,
      media: record.media,
      selectedPlanId: record.selectedPlanId,
      acceptedPolicies: record.acceptedPolicies,
      status: record.status,
      expiresAt,
      createdAt: now,
      updatedAt: now
    });
  } else {
    (await getMemoryState()).listingCheckoutSessions.push(record);
  }

  const checkoutUrl = `${siteUrl.replace(/\/+$/, "")}/post/checkout/${encodeURIComponent(token)}`;
  return {
    token,
    checkoutUrl,
    session: publicListingCheckoutSession(token, record),
    uploadTargets
  };
}

export async function getListingCheckoutSession(token: string): Promise<ListingCheckoutSession | undefined> {
  const record = await getListingCheckoutSessionRecord(token);
  if (!record || isListingCheckoutSessionExpired(record) || record.status === "used") return undefined;
  return publicListingCheckoutSession(token, record);
}

export async function updateListingCheckoutSession(token: string, request: UpdateListingCheckoutSessionRequest) {
  const record = await getListingCheckoutSessionRecord(token);
  if (!record || isListingCheckoutSessionExpired(record) || record.status === "used") return undefined;

  const updates: Partial<ListingCheckoutSessionRecord> = {
    updatedAt: new Date().toISOString()
  };
  if (request.selectedPlanId !== undefined) updates.selectedPlanId = normalizeOptionalString(request.selectedPlanId);
  if (request.acceptedPolicies !== undefined) updates.acceptedPolicies = request.acceptedPolicies === true;

  const next = await updateListingCheckoutSessionRecord(record.id, updates);
  return publicListingCheckoutSession(token, next);
}

export async function updateListingCheckoutDraft(
  token: string,
  request: UpdateListingCheckoutDraftRequest,
  siteUrl: string
): Promise<CreateListingCheckoutSessionResponse | undefined> {
  const record = await getListingCheckoutSessionRecord(token);
  if (!record || isListingCheckoutSessionExpired(record) || record.status === "used") return undefined;

  const draft = normalizeListingCheckoutDraft(request.draft);
  const retainedIds = new Set(Array.isArray(request.retainedMediaIds) ? request.retainedMediaIds.filter((id): id is string => typeof id === "string") : []);
  const retainedMedia = record.media.filter((item) => retainedIds.has(item.id));
  const mediaInputs = normalizeListingCheckoutMediaInputs([...retainedMedia.map((item) => ({
    kind: item.kind,
    fileName: item.fileName,
    contentType: item.contentType,
    size: item.size
  })), ...(Array.isArray(request.media) ? request.media : [])]);
  const newMediaInputs = mediaInputs.slice(retainedMedia.length);
  const uploadTargets = [];
  const newMedia: ListingCheckoutMedia[] = [];
  const photoOffset = retainedMedia.filter((item) => item.kind === "photo").length;

  for (const [index, item] of newMediaInputs.entries()) {
    const target = await createListingCheckoutUploadTarget(record.id, item);
    const mediaId = `checkout-media-${randomUUID()}`;
    newMedia.push({
      id: mediaId,
      kind: item.kind,
      fileName: item.fileName,
      contentType: item.contentType,
      size: item.size,
      blobKey: target.blobKey,
      readUrl: target.readUrl,
      order: item.kind === "photo" ? photoOffset + index : 0
    });
    uploadTargets.push({ mediaId, ...target });
  }

  let nextPhotoOrder = 0;
  const nextMedia = [...retainedMedia, ...newMedia].map((item) => ({
    ...item,
    order: item.kind === "photo" ? nextPhotoOrder++ : 0
  }));

  const next = await updateListingCheckoutSessionRecord(record.id, {
    draft,
    media: nextMedia,
    updatedAt: new Date().toISOString()
  });
  return {
    token,
    checkoutUrl: `${siteUrl.replace(/\/+$/, "")}/post/checkout/${encodeURIComponent(token)}`,
    session: publicListingCheckoutSession(token, next),
    uploadTargets
  };
}

export async function completeListingCheckoutSession(
  userId: string,
  token: string,
  request: UpdateListingCheckoutSessionRequest,
  idempotencyKey?: string
): Promise<ListingCheckoutCompletionResult | undefined> {
  const record = await getListingCheckoutSessionRecord(token);
  if (!record || isListingCheckoutSessionExpired(record) || record.status === "used") return undefined;
  if (record.claimedUserId && record.claimedUserId !== userId) {
    throw new Error("Checkout session is already linked to another account.");
  }

  const selectedPlanId = normalizeOptionalString(request.selectedPlanId) ?? record.selectedPlanId ?? "pro";
  const acceptedPolicies = request.acceptedPolicies === true || record.acceptedPolicies;
  const now = new Date().toISOString();

  await updateListingCheckoutSessionRecord(record.id, {
    status: "claimed",
    claimedUserId: userId,
    selectedPlanId,
    acceptedPolicies,
    updatedAt: now
  });

  const listingKey = idempotencyKey ? `${idempotencyKey}:listing` : `listing-checkout:${record.id}:listing`;
  const paymentKey = idempotencyKey ? `${idempotencyKey}:payment` : `listing-checkout:${record.id}:payment`;
  const listing = await createListing(userId, record.draft, listingKey);
  const listingMediaItems = record.media.map((item): ListingMedia => ({
    id: item.blobKey,
    listingId: listing.id,
    kind: item.kind,
    url: createSignedReadUrl(item.blobKey),
    alt: item.fileName,
    order: item.kind === "photo" ? item.order : 0,
    moderationStatus: "not_submitted"
  }));

  if (listingMediaItems.length > 0) {
    await updateUserListing(userId, listing.id, { media: listingMediaItems });
  }

  const user = await getUser(userId);
  if (isTrialActiveForUser(user)) {
    const subscription = await createTrialListingSubscription(user, listing.id, selectedPlanId, record.media.filter((item) => item.kind === "photo").length, acceptedPolicies);
    await updateListingCheckoutSessionRecord(record.id, {
      status: "used",
      claimedUserId: userId,
      listingId: listing.id,
      updatedAt: new Date().toISOString()
    });
    return {
      mode: "trial",
      listing: (await getListingForUser(userId, listing.id)) ?? listing,
      subscription,
      trial: user.trial!
    };
  }

  const intent = await createListingPaymentIntent(userId, listing.id, {
    planId: selectedPlanId,
    photoCount: record.media.filter((item) => item.kind === "photo").length,
    acceptedPolicies
  }, paymentKey);

  await updateListingCheckoutSessionRecord(record.id, {
    status: "used",
    claimedUserId: userId,
    listingId: listing.id,
    paymentIntentId: intent.id,
    updatedAt: new Date().toISOString()
  });

  return { mode: "payment", paymentIntent: intent };
}

async function getListingForUser(userId: string, listingId: string): Promise<Listing | undefined> {
  const seller = await ensureSellerProfile(userId);
  if (hasDatabase) {
    const rows = await db.select().from(listings).where(and(eq(listings.id, listingId), eq(listings.sellerId, seller.id))).limit(1);
    return rows[0] ? toListing(rows[0]) : undefined;
  }
  return (await getMemoryState()).database.listings.find((item) => item.id === listingId && item.sellerId === seller.id);
}

async function createTrialListingSubscription(user: User, listingId: string, planId: string, photoCount: number, acceptedPolicies: boolean): Promise<ListingSubscription> {
  if (!acceptedPolicies) {
    throw new Error("Terms and Privacy Policy acceptance is required before payment.");
  }
  if (!user.trial || user.trial.status !== "active") {
    throw new Error("Free trial is not active.");
  }
  const seller = await ensureSellerProfile(user.id);
  const plan = await fetchSubscriptionPlan(planId);
  if (!plan) throw new Error("Unknown plan");
  const now = new Date();
  const expiresAt = new Date(user.trial.endsAt);
  const subscriptionId = `trial-sub-${randomUUID()}`;
  const policyVersion = "2026-06-11";

  if (hasDatabase) {
    return withBillingTransaction(async (tx) => {
      // Locking the listing serializes repeated checkout completion requests. A
      // retry can then repair a transaction that already created the trial
      // subscription without ever creating a second subscription for the same
      // listing.
      await tx.execute(sql`select "id" from "listings" where "id" = ${listingId} for update`);
      const [listing] = await tx.select().from(listings).where(and(eq(listings.id, listingId), eq(listings.sellerId, seller.id))).limit(1);
      if (!listing) throw new Error("Listing not found.");

      const [existing] = await tx.select().from(listingSubscriptions).where(and(
        eq(listingSubscriptions.userId, user.id),
        eq(listingSubscriptions.listingId, listingId)
      )).limit(1);
      if (existing) {
        if (existing.source === "trial" && existing.status === "active" && listing.status !== "paused" && listing.moderationStatus !== "rejected") {
          await tx.update(listings).set({
            status: "pending_review",
            moderationStatus: "queued",
            expiresAt: existing.expiresAt ?? expiresAt,
            updatedAt: now
          }).where(eq(listings.id, listingId));
        }
        return toListingSubscription(existing);
      }

      const [subscription] = await tx.insert(listingSubscriptions).values({
        id: subscriptionId,
        userId: user.id,
        listingId,
        planId,
        status: "active",
        source: "trial",
        autoRenew: false,
        startsAt: now,
        expiresAt,
        createdAt: now,
        updatedAt: now
      }).returning();
      await tx.update(listings).set({
        status: "pending_review",
        moderationStatus: "queued",
        expiresAt,
        updatedAt: now
      }).where(eq(listings.id, listingId));
      await tx.insert(policyAcceptances).values({ id: `policy-${randomUUID()}`, userId: user.id, listingId, policyVersion, acceptedAt: now });
      return toListingSubscription(subscription);
    });
  }

  const state = await getMemoryState();
  const listing = state.database.listings.find((item) => item.id === listingId && item.sellerId === seller.id);
  if (!listing) throw new Error("Listing not found.");
  const existing = state.listingSubscriptions.find((item) => item.userId === user.id && item.listingId === listingId);
  if (existing) {
    if (existing.source === "trial" && existing.status === "active" && listing.status !== "paused" && listing.moderationStatus !== "rejected") {
      listing.status = "pending_review";
      listing.moderationStatus = "queued";
      listing.expiresAt = existing.expiresAt ?? expiresAt.toISOString();
    }
    return existing;
  }
  const subscription: ListingSubscription = {
    id: subscriptionId,
    userId: user.id,
    listingId,
    planId,
    status: "active",
    source: "trial",
    autoRenew: false,
    startsAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  state.listingSubscriptions.push(subscription);
  listing.status = "pending_review";
  listing.moderationStatus = "queued";
  listing.expiresAt = expiresAt.toISOString();
  return subscription;
}

export async function removeUserListing(userId: string, listingId: string) {
  const seller = await ensureSellerProfile(userId);
  let deletedFromDb;
  const now = new Date();
  
  if (hasDatabase) {
    const existingRows = await db.select().from(listings).where(and(eq(listings.id, listingId), eq(listings.sellerId, seller.id))).limit(1);
    if (existingRows[0]) {
      const subscriptions = await db.select().from(listingSubscriptions).where(and(eq(listingSubscriptions.listingId, listingId), eq(listingSubscriptions.userId, userId)));
      const activeSubscription = subscriptions.find((subscription) => isSubscriptionInPaidAccess(subscription.status, subscription.expiresAt, now));
      if (activeSubscription) {
        await cancelListingSubscriptionsForListing(listingId);
        await db.update(listings).set({ status: "paused", publishedAt: null, expiresAt: activeSubscription.expiresAt, updatedAt: now }).where(eq(listings.id, listingId));
        return toListing({ ...existingRows[0], status: "paused", publishedAt: null, expiresAt: activeSubscription.expiresAt, updatedAt: now });
      }
      const subscriptionIds = subscriptions.map((subscription) => subscription.id);
      const intents = await db.select().from(paymentIntents).where(and(eq(paymentIntents.listingId, listingId), eq(paymentIntents.userId, userId)));
      const immutableInvoices = await db.select({ id: billingInvoices.id }).from(billingInvoices).where(and(eq(billingInvoices.listingId, listingId), eq(billingInvoices.userId, userId))).limit(1);
      const hasBillingHistory = immutableInvoices.length > 0 || intents.length > 0;
      if (hasBillingHistory) {
        await cancelListingSubscriptionsForListing(listingId);
        const [archived] = await db.update(listings).set({ status: "paused", publishedAt: null, updatedAt: now }).where(eq(listings.id, listingId)).returning();
        return archived ? toListing(archived) : undefined;
      }
      const stripeSubscriptionIds = new Set(
        intents
          .map((intent) => intent.stripeSubscriptionId ?? (intent.gatewayReference?.startsWith("sub_") ? intent.gatewayReference : undefined))
          .filter((stripeSubscriptionId): stripeSubscriptionId is string => Boolean(stripeSubscriptionId))
      );
      await Promise.all(Array.from(stripeSubscriptionIds, (stripeSubscriptionId) => setStripeSubscriptionCancelAtPeriodEnd(stripeSubscriptionId)));

      if (subscriptionIds.length > 0) {
        await db.delete(renewalEvents).where(inArray(renewalEvents.subscriptionId, subscriptionIds));
      }

      const mediaRows = await db.select().from(listingMedia).where(eq(listingMedia.listingId, listingId));
      const checkoutSessionRows = await db.select().from(listingCheckoutSessions).where(eq(listingCheckoutSessions.listingId, listingId));
      
      const storageKeysToClean = [
        ...mediaRows.map(m => m.storageKey),
        ...checkoutSessionRows.flatMap(s => s.media.map((m: any) => m.storageKey))
      ].filter(Boolean) as string[];
      
      await Promise.allSettled(storageKeysToClean.map(key => deleteBlob(key)));

      await db.delete(listingCheckoutSessions).where(eq(listingCheckoutSessions.listingId, listingId));
      await db.delete(policyAcceptances).where(eq(policyAcceptances.listingId, listingId));
      await db.delete(paymentIntents).where(and(eq(paymentIntents.listingId, listingId), eq(paymentIntents.userId, userId)));
      await db.delete(listingSubscriptions).where(and(eq(listingSubscriptions.listingId, listingId), eq(listingSubscriptions.userId, userId)));
      await db.delete(cartItems).where(eq(cartItems.listingId, listingId));
      await db.delete(conversations).where(eq(conversations.listingId, listingId));
      await db.delete(listingContacts).where(eq(listingContacts.listingId, listingId));
      await db.delete(listingMedia).where(eq(listingMedia.listingId, listingId));
      await db.update(reports).set({ status: "resolved", listingId: null }).where(eq(reports.listingId, listingId));
      const [deleted] = await db.delete(listings).where(eq(listings.id, listingId)).returning();
      if (deleted) deletedFromDb = toListing(deleted);
    }
    return deletedFromDb;
  }

  const state = await getMemoryState();
  const index = state.database.listings.findIndex((l) => l.id === listingId && l.sellerId === seller.id);
  let deletedFromJson;
  
  if (index >= 0) {
    const activeSubscription = state.listingSubscriptions.find((subscription) => subscription.listingId === listingId && subscription.userId === userId && isSubscriptionInPaidAccess(subscription.status, subscription.expiresAt, now));
    if (activeSubscription) {
      const intent = state.paymentIntents.find((item) => item.subscriptionId === activeSubscription.id);
      const stripeSubscriptionId = intent?.stripeSubscriptionId ?? (intent?.gatewayReference?.startsWith("sub_") ? intent.gatewayReference : undefined);
      if (stripeSubscriptionId) await setStripeSubscriptionCancelAtPeriodEnd(stripeSubscriptionId);
      activeSubscription.autoRenew = false;
      activeSubscription.cancelledAt = now.toISOString();
      activeSubscription.updatedAt = now.toISOString();
      state.database.listings[index].status = "paused";
      state.database.listings[index].publishedAt = undefined;
      state.database.listings[index].expiresAt = activeSubscription.expiresAt;
      return state.database.listings[index];
    }
    const hasBillingHistory = state.paymentIntents.some((intent) => intent.listingId === listingId && intent.userId === userId);
    if (hasBillingHistory) {
      await cancelListingSubscriptionsForListing(listingId);
      state.database.listings[index].status = "paused";
      state.database.listings[index].publishedAt = undefined;
      return state.database.listings[index];
    }
    deletedFromJson = state.database.listings[index];
    
    const storageKeysToClean = [
      ...(deletedFromJson.media?.map((m: any) => m.storageKey) || []),
      ...state.listingCheckoutSessions.filter((s) => s.listingId === listingId).flatMap((s) => s.media.map((m: any) => m.storageKey))
    ].filter(Boolean) as string[];
    await Promise.allSettled(storageKeysToClean.map(key => deleteBlob(key)));

    state.database.listings.splice(index, 1);
    delete state.database.listingContacts[listingId];
    state.listingSubscriptions = state.listingSubscriptions.filter((subscription) => !(subscription.listingId === listingId && subscription.userId === userId));
    state.paymentIntents = state.paymentIntents.filter((intent) => !(intent.listingId === listingId && intent.userId === userId));
    state.listingCheckoutSessions = state.listingCheckoutSessions.filter((session) => session.listingId !== listingId);
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
    if (input.title !== undefined) updates.title = normalizeListingTitle(input.title);
    if (input.description !== undefined) updates.description = input.description;
    if (input.priceLkr !== undefined) updates.priceLkr = Number(input.priceLkr);
    if (input.location !== undefined) updates.location = input.location;
    if (input.gemTypeId !== undefined) updates.gemTypeId = input.gemTypeId;
    if (input.media !== undefined) updates.media = await withCardThumbnails(input.media);
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
  
  if (input.title !== undefined) listing.title = normalizeListingTitle(input.title);
  if (input.description !== undefined) listing.description = input.description;
  if (input.priceLkr !== undefined) listing.priceLkr = Number(input.priceLkr);
  if (input.location !== undefined) listing.location = input.location;
  if (input.gemTypeId !== undefined) listing.gemTypeId = input.gemTypeId;
  if (input.media !== undefined) listing.media = await withCardThumbnails(input.media);
  if (input.attributes !== undefined) listing.attributes = { ...listing.attributes, ...input.attributes } as GemAttributes;
  
  if (listing.moderationStatus !== "not_submitted" || listing.status !== "draft") {
    listing.moderationStatus = "queued";
    listing.status = "pending_review";
  }
  return listing;
}

export async function createListingPaymentIntent(userId: string, listingId: string, request: { planId: string; photoCount: number; acceptedPolicies: boolean }, idempotencyKey?: string): Promise<PaymentIntent> {
  const seller = await ensureSellerProfile(userId);
  const planId = request.planId as ListingSubscriptionPlanId;
  if (!request.acceptedPolicies) {
    throw new Error("Terms and Privacy Policy acceptance is required before payment.");
  }

  const plan = await fetchSubscriptionPlan(request.planId);
  if (!plan) throw new Error("Unknown plan");
  const now = new Date();
  const policyVersion = "2026-06-11";
  const gateway = listingPaymentGateway();
  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);

  if (hasDatabase) {
    const rows = await db.select().from(listings).where(and(eq(listings.id, listingId), eq(listings.sellerId, seller.id))).limit(1);
    if (!rows[0]) throw new Error("Listing not found.");
    const quote = quoteListingSubscription(plan, countListingPhotos(rows[0].media));

    if (normalizedIdempotencyKey) {
      const existingRows = await db.select().from(paymentIntents).where(and(eq(paymentIntents.userId, userId), eq(paymentIntents.listingId, listingId), eq(paymentIntents.idempotencyKey, normalizedIdempotencyKey))).limit(1);
      if (existingRows[0]) return ensurePaymentIntentCheckoutUrl(toPaymentIntent(existingRows[0]));
    }

    const [existingSubscription] = await db.select().from(listingSubscriptions).where(and(
      eq(listingSubscriptions.userId, userId),
      eq(listingSubscriptions.listingId, listingId)
    )).limit(1);
    if (existingSubscription) {
      const existingAttempt = await createListingSubscriptionPaymentAttempt(userId, existingSubscription.id, normalizedIdempotencyKey);
      if (existingAttempt) return existingAttempt;
    }

    const subscriptionId = normalizedIdempotencyKey ? stableIdFromKey("sub", `${userId}:${listingId}:${normalizedIdempotencyKey}`) : `sub-${randomUUID()}`;
    const intentId = normalizedIdempotencyKey ? stableIdFromKey("pay", `${userId}:${listingId}:${normalizedIdempotencyKey}`) : `pay-${randomUUID()}`;
    let intent: PaymentIntent = {
      id: intentId,
      userId,
      listingId,
      subscriptionId,
      purpose: "listing_subscription",
      status: "pending",
      planId,
      quote,
      amountLkr: quote.totalLkr,
      currency: "LKR",
      gateway,
      policyVersion,
      policyAcceptedAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    let inserted: typeof paymentIntents.$inferSelect;
    try {
      const subscription = {
        id: subscriptionId,
        userId,
        listingId,
        planId,
        status: "pending_payment" as ListingSubscriptionStatus,
        source: "paid" as const,
        autoRenew: true,
        createdAt: now,
        updatedAt: now
      };
      await db.insert(listingSubscriptions).values(subscription).onConflictDoNothing({ target: listingSubscriptions.id });

      [inserted] = await db.insert(paymentIntents).values({
        id: intent.id,
        userId,
        listingId,
        idempotencyKey: normalizedIdempotencyKey,
        subscriptionId,
        purpose: intent.purpose,
        status: intent.status,
        planId,
        quote,
        amountLkr: intent.amountLkr,
        currency: intent.currency,
        gateway: intent.gateway,
        policyVersion,
        policyAcceptedAt: now,
        createdAt: now,
        updatedAt: now
      }).returning();

      await db.update(listingSubscriptions).set({ paymentIntentId: intent.id }).where(eq(listingSubscriptions.id, subscriptionId));
      await db.insert(policyAcceptances).values({ id: `policy-${randomUUID()}`, userId, listingId, paymentIntentId: intent.id, policyVersion, acceptedAt: now });
    } catch (error) {
      if (!normalizedIdempotencyKey || !isUniqueConstraintError(error)) throw error;
      const existingRows = await db.select().from(paymentIntents).where(and(eq(paymentIntents.userId, userId), eq(paymentIntents.listingId, listingId), eq(paymentIntents.idempotencyKey, normalizedIdempotencyKey))).limit(1);
      if (existingRows[0]) return ensurePaymentIntentCheckoutUrl(toPaymentIntent(existingRows[0]));
      throw error;
    }

    return ensurePaymentIntentCheckoutUrl(toPaymentIntent(inserted));
  }

  const state = await getMemoryState();
  const listing = state.database.listings.find((item) => item.id === listingId && item.sellerId === seller.id);
  if (!listing) throw new Error("Listing not found.");
  const quote = quoteListingSubscription(plan, countListingPhotos(listing.media));
  const memoryKey = normalizedIdempotencyKey ? `${userId}:${listingId}:${normalizedIdempotencyKey}` : "";
  const existingIntentId = memoryKey ? state.paymentIntentIdempotencyKeys[memoryKey] : undefined;
  const existingIntent = existingIntentId ? state.paymentIntents.find((item) => item.id === existingIntentId) : undefined;
  if (existingIntent) return existingIntent.paymentUrl ? existingIntent : prepareAndUpdateMemoryPaymentIntent(existingIntent);

  const subscription: ListingSubscription = {
    id: normalizedIdempotencyKey ? stableIdFromKey("sub", memoryKey) : `sub-${randomUUID()}`,
    userId,
    listingId,
    planId,
    status: "pending_payment",
    source: "paid",
    autoRenew: true,
    paymentIntentId: undefined,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  let intent: PaymentIntent = {
    id: normalizedIdempotencyKey ? stableIdFromKey("pay", memoryKey) : `pay-${randomUUID()}`,
    userId,
    listingId,
    subscriptionId: subscription.id,
    purpose: "listing_subscription",
    status: "pending",
    planId,
    quote,
    amountLkr: quote.totalLkr,
    currency: "LKR",
    gateway,
    policyVersion,
    policyAcceptedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  subscription.paymentIntentId = intent.id;
  state.listingSubscriptions.push(subscription);
  state.paymentIntents.push(intent);
  if (memoryKey) state.paymentIntentIdempotencyKeys[memoryKey] = intent.id;
  return prepareAndUpdateMemoryPaymentIntent(intent);
}

async function fetchSubscriptionPlan(planId: string) {
  if (hasDatabase) {
    const rows = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
    return rows[0];
  }
  return (await getMemoryState()).subscriptionPlans.find((p) => p.id === planId);
}

async function ensurePaymentIntentCheckoutUrl(intent: PaymentIntent) {
  if (intent.paymentUrl) return intent;
  const prepared = await prepareGatewayPayment(intent.userId, intent);
  if (hasDatabase) {
    const [updated] = await db.update(paymentIntents).set({
      gatewayReference: prepared.gatewayReference,
      stripeCheckoutSessionId: prepared.stripeCheckoutSessionId,
      stripeSubscriptionId: prepared.stripeSubscriptionId,
      stripeCustomerId: prepared.stripeCustomerId,
      stripeInvoiceId: prepared.stripeInvoiceId,
      stripeLivemode: prepared.livemode,
      paymentUrl: prepared.paymentUrl,
      updatedAt: new Date()
    }).where(eq(paymentIntents.id, intent.id)).returning();
    return toPaymentIntent(updated);
  }
  Object.assign(intent, prepared, { updatedAt: new Date().toISOString() });
  return intent;
}

async function prepareAndUpdateMemoryPaymentIntent(intent: PaymentIntent) {
  const prepared = await prepareGatewayPayment(intent.userId, intent);
  Object.assign(intent, prepared, { updatedAt: new Date().toISOString() });
  return intent;
}

export async function confirmPaymentIntent(intentId: string, status: PaymentStatus, gatewayReference?: string, stripeState: StripePaymentState = {}) {
  if (hasDatabase) {
    return withBillingTransaction(async (tx) => {
      await tx.execute(sql`select "id" from "payment_intents" where "id" = ${intentId} for update`);
      const [existingRow] = await tx.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).limit(1);
      if (!existingRow) return undefined;
      const existing = toPaymentIntent(existingRow);
      if (existing.status === "succeeded" && status !== "succeeded") return existing;
      const nextStatus = normalizePaymentStatus(status);
      if (existing.subscriptionId) {
        await tx.execute(sql`select "id" from "listing_subscriptions" where "id" = ${existing.subscriptionId} for update`);
      }
      const [subscription] = existing.subscriptionId
        ? await tx.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, existing.subscriptionId)).limit(1)
        : [];
      const eventIsOlder = isOlderStripeEvent(stripeState.eventCreated, subscription?.lastStripeEventCreated);
      const repairsAuthoritativeState = nextStatus === "succeeded"
        || (nextStatus === "scheduled" && existing.status === "pending" && subscription?.source === "trial" && subscription.stripeStatus === "trialing")
        || ((nextStatus === "failed" || nextStatus === "cancelled" || nextStatus === "expired")
          && existing.status === "pending"
          && subscription?.status === "pending_payment"
          && (!subscription.paymentIntentId || subscription.paymentIntentId === existing.id));
      if (eventIsOlder && !repairsAuthoritativeState) {
        return existing;
      }
      if ((existing.status === "failed" || existing.status === "cancelled" || existing.status === "expired") && (nextStatus === "pending" || nextStatus === "scheduled")) {
        return existing;
      }
      if (nextStatus !== "succeeded" && (existing.status === "cancelled" || (subscription?.paymentIntentId && subscription.paymentIntentId !== existing.id))) {
        return existing;
      }
      const wasSucceeded = existing.status === "succeeded";
      const nextStripeState = mergeStripePaymentState(existing, gatewayReference, stripeState);
      const now = new Date();
      const [updated] = await tx.update(paymentIntents).set({
        status: wasSucceeded ? "succeeded" : nextStatus,
        gatewayReference: nextStripeState.gatewayReference,
        stripeCheckoutSessionId: nextStripeState.stripeCheckoutSessionId,
        stripeSubscriptionId: nextStripeState.stripeSubscriptionId,
        stripeCustomerId: nextStripeState.stripeCustomerId,
        stripeInvoiceId: nextStripeState.stripeInvoiceId,
        stripeLivemode: nextStripeState.livemode,
        updatedAt: now
      }).where(eq(paymentIntents.id, intentId)).returning();
      if (!subscription) return toPaymentIntent(updated);

      const scheduledConversionAt = nextStatus === "scheduled" && stripeState.scheduledFor ? new Date(stripeState.scheduledFor) : undefined;
      const scheduledEntitlementEnd = scheduledConversionAt && (!subscription.expiresAt || scheduledConversionAt > subscription.expiresAt)
        ? scheduledConversionAt
        : undefined;
      const eventFields = stripeEventFields(
        stripeState.eventCreated,
        stripeState.eventId,
        subscription.lastStripeEventCreated,
        subscription.lastStripeEventId
      );
      await tx.update(listingSubscriptions).set(withoutUndefined({
        stripeSubscriptionId: nextStripeState.stripeSubscriptionId,
        stripeCustomerId: nextStripeState.stripeCustomerId,
        stripeStatus: nextStatus === "scheduled" ? "trialing" : undefined,
        scheduledConversionAt,
        expiresAt: scheduledEntitlementEnd,
        autoRenew: nextStatus === "scheduled" ? true : undefined,
        cancelAtPeriodEnd: nextStatus === "scheduled" ? false : undefined,
        ...eventFields,
        updatedAt: now
      })).where(eq(listingSubscriptions.id, subscription.id));
      if (scheduledEntitlementEnd) {
        await tx.update(listings).set({ expiresAt: scheduledEntitlementEnd, updatedAt: now }).where(eq(listings.id, subscription.listingId));
      }

      if (nextStatus === "succeeded" && !wasSucceeded) {
        const [plan] = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, subscription.planId)).limit(1);
        if (plan) {
          const expiresAt = addMonths(now, plan.validityMonths);
          await tx.update(listingSubscriptions).set({
            status: "active",
            source: "paid",
            autoRenew: true,
            startsAt: subscription.startsAt ?? now,
            expiresAt,
            scheduledConversionAt: null,
            graceEndsAt: null,
            paymentIntentId: intentId,
            updatedAt: now
          }).where(eq(listingSubscriptions.id, subscription.id));
          const [listing] = await tx.select().from(listings).where(eq(listings.id, subscription.listingId)).limit(1);
          if (listing && listing.status !== "paused" && listing.moderationStatus !== "rejected") {
            await tx.update(listings).set({ status: "pending_review", moderationStatus: "queued", expiresAt, updatedAt: now }).where(eq(listings.id, listing.id));
          }
        }
      } else if (!wasSucceeded && nextStatus !== "pending" && nextStatus !== "scheduled") {
        const trialStillActive = subscription.source === "trial" && subscription.status === "active" && subscription.expiresAt && subscription.expiresAt > now;
        if (!trialStillActive) {
          const hasEntitlement = Boolean(subscription.startsAt && subscription.expiresAt && subscription.expiresAt > now);
          const nextSubscriptionStatus = nextStatus === "cancelled"
            ? "pending_payment"
            : nextStatus === "expired"
              ? hasEntitlement ? "expired" : "pending_payment"
              : hasEntitlement ? "past_due" : "pending_payment";
          await tx.update(listingSubscriptions).set({
            status: nextSubscriptionStatus,
            autoRenew: nextSubscriptionStatus === "pending_payment",
            cancelledAt: nextSubscriptionStatus === "pending_payment" ? null : undefined,
            updatedAt: now
          }).where(eq(listingSubscriptions.id, subscription.id));
          if (nextSubscriptionStatus === "expired") {
            await tx.update(listings).set({ status: "expired", updatedAt: now }).where(eq(listings.id, subscription.listingId));
          }
        }
      }
      return toPaymentIntent(updated);
    });
  }

  const state = await getMemoryState();
  const intent = state.paymentIntents.find((item) => item.id === intentId);
  if (!intent) return undefined;
  if (intent.status === "succeeded" && status !== "succeeded") return intent;
  const nextStatus = normalizePaymentStatus(status);
  if (await shouldIgnoreNonSuccessfulPaymentConfirmation(intent, nextStatus)) return intent;
  const wasSucceeded = intent.status === "succeeded";
  const nextStripeState = mergeStripePaymentState(intent, gatewayReference, stripeState);
  intent.status = wasSucceeded ? "succeeded" : nextStatus;
  intent.gatewayReference = nextStripeState.gatewayReference;
  intent.stripeCheckoutSessionId = nextStripeState.stripeCheckoutSessionId;
  intent.stripeSubscriptionId = nextStripeState.stripeSubscriptionId;
  intent.stripeCustomerId = nextStripeState.stripeCustomerId;
  intent.stripeInvoiceId = nextStripeState.stripeInvoiceId;
  intent.livemode = nextStripeState.livemode;
  intent.updatedAt = new Date().toISOString();
  if (nextStatus === "succeeded" && !wasSucceeded) {
    await activateListingSubscription(intent.subscriptionId, intentId);
  } else if (!wasSucceeded && nextStatus !== "pending") {
    await applyListingSubscriptionPaymentStatus(intent.subscriptionId, nextStatus);
  }
  return intent;
}

export async function recordStripeSubscriptionInvoicePayment(input: {
  stripeSubscriptionId: string;
  stripeInvoiceId: string;
  stripePaymentIntentId?: string;
  billingReason?: string;
}) {
  if (!input.stripeSubscriptionId || !input.stripeInvoiceId) return undefined;

  const intent = await getPaymentIntentByStripeSubscription(input.stripeSubscriptionId);
  if (!intent) return undefined;
  const paidEventId = `${input.stripeInvoiceId}:paid`;

  if (input.billingReason === "subscription_create") {
    await recordRenewalEventOnce(intent.subscriptionId, paidEventId, input.stripePaymentIntentId, "initial_paid", "Initial subscription invoice paid.");
    return confirmPaymentIntent(intent.id, "succeeded", input.stripeSubscriptionId, {
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeInvoiceId: input.stripeInvoiceId
    });
  }

  const inserted = await recordRenewalEventOnce(intent.subscriptionId, paidEventId, input.stripePaymentIntentId, "renewal_paid", "Subscription renewal invoice paid.");
  if (!inserted) return intent;
  await updatePaymentStripeState(intent.id, { stripeSubscriptionId: input.stripeSubscriptionId, stripeInvoiceId: input.stripeInvoiceId });
  await extendListingSubscription(intent.subscriptionId, intent.id);
  return getPaymentIntent(intent.id);
}

export async function markStripeSubscriptionPastDue(
  stripeSubscriptionId: string,
  stripeInvoiceId: string,
  status = "payment_failed",
  notes = "Subscription invoice payment failed."
) {
  const intent = await getPaymentIntentByStripeSubscription(stripeSubscriptionId);
  if (!intent?.subscriptionId) return undefined;
  await recordRenewalEventOnce(intent.subscriptionId, `${stripeInvoiceId}:${status}`, undefined, status, notes);
  await updatePaymentStripeState(intent.id, { stripeSubscriptionId, stripeInvoiceId });

  if (hasDatabase) {
    const [updated] = await db.update(listingSubscriptions).set({ status: "past_due", updatedAt: new Date() }).where(eq(listingSubscriptions.id, intent.subscriptionId)).returning();
    return updated ? toListingSubscription(updated) : undefined;
  }

  const subscription = (await getMemoryState()).listingSubscriptions.find((item) => item.id === intent.subscriptionId);
  if (!subscription) return undefined;
  subscription.status = "past_due";
  subscription.updatedAt = new Date().toISOString();
  return subscription;
}

function invoiceStatusRank(status: BillingInvoice["status"]) {
  return { open: 0, action_required: 1, failed: 2, uncollectible: 3, void: 4, paid: 5 }[status];
}

export async function recordStripeBillingInvoice(snapshot: StripeInvoiceSnapshot, eventCreated?: number, eventId?: string) {
  if (!hasDatabase) return undefined;
  return withBillingTransaction(async (tx) => {
    let attemptCandidate = snapshot.paymentIntentId
      ? (await tx.select().from(paymentIntents).where(eq(paymentIntents.id, snapshot.paymentIntentId)).limit(1))[0]
      : undefined;
    let subscriptionCandidate = snapshot.listingSubscriptionId
      ? (await tx.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, snapshot.listingSubscriptionId)).limit(1))[0]
      : undefined;
    if (!subscriptionCandidate && snapshot.stripeSubscriptionId) {
      subscriptionCandidate = (await tx.select().from(listingSubscriptions).where(eq(listingSubscriptions.stripeSubscriptionId, snapshot.stripeSubscriptionId)).limit(1))[0];
    }
    if (!subscriptionCandidate && attemptCandidate?.subscriptionId) {
      subscriptionCandidate = (await tx.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, attemptCandidate.subscriptionId)).limit(1))[0];
    }
    if (!attemptCandidate && subscriptionCandidate) {
      attemptCandidate = (await tx.select().from(paymentIntents).where(eq(paymentIntents.subscriptionId, subscriptionCandidate.id)).orderBy(desc(paymentIntents.createdAt)).limit(1))[0];
    }
    if (!attemptCandidate || !subscriptionCandidate) return undefined;

    await tx.execute(sql`select "id" from "payment_intents" where "id" = ${attemptCandidate.id} for update`);
    await tx.execute(sql`select "id" from "listing_subscriptions" where "id" = ${subscriptionCandidate.id} for update`);
    const [attemptRow] = await tx.select().from(paymentIntents).where(eq(paymentIntents.id, attemptCandidate.id)).limit(1);
    const [subscriptionRow] = await tx.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, subscriptionCandidate.id)).limit(1);
    if (!attemptRow || !subscriptionRow) return undefined;

    const attempt = toPaymentIntent(attemptRow);
    const now = new Date();
    await tx.execute(sql`select "id" from "billing_invoices" where "stripe_invoice_id" = ${snapshot.stripeInvoiceId} for update`);
    const [existingInvoice] = await tx.select().from(billingInvoices).where(eq(billingInvoices.stripeInvoiceId, snapshot.stripeInvoiceId)).limit(1);
    const invoiceEventIsOlder = isOlderStripeEvent(eventCreated, existingInvoice?.lastStripeEventCreated);
    const preserveExistingState = Boolean(existingInvoice) && (
      (existingInvoice!.status === "paid" && snapshot.status !== "paid")
      || (invoiceEventIsOlder && invoiceStatusRank(snapshot.status) <= invoiceStatusRank(existingInvoice!.status))
    );
    const effectiveStatus = preserveExistingState ? existingInvoice!.status : snapshot.status;
    const isInitialInvoice = subscriptionRow.source === "trial" || !subscriptionRow.startsAt || snapshot.billingReason === "subscription_create";
    const purpose: PaymentIntent["purpose"] = existingInvoice?.purpose ?? (isInitialInvoice ? "listing_subscription" : "listing_subscription_renewal");
    const invoiceEventFields = stripeEventFields(eventCreated, eventId, existingInvoice?.lastStripeEventCreated, existingInvoice?.lastStripeEventId);
    const invoiceValues = {
      userId: attempt.userId,
      listingId: attempt.listingId,
      subscriptionId: subscriptionRow.id,
      paymentAttemptId: existingInvoice?.paymentAttemptId ?? (isInitialInvoice ? attempt.id : null),
      purpose,
      status: effectiveStatus,
      amountLkr: attempt.amountLkr,
      chargedAmountMinor: preserveExistingState ? existingInvoice!.chargedAmountMinor : snapshot.chargedAmountMinor,
      chargedCurrency: preserveExistingState ? existingInvoice!.chargedCurrency : snapshot.chargedCurrency,
      stripeCustomerId: snapshot.stripeCustomerId ?? attempt.stripeCustomerId,
      stripeSubscriptionId: snapshot.stripeSubscriptionId ?? attempt.stripeSubscriptionId,
      hostedInvoiceUrl: snapshot.hostedInvoiceUrl ?? existingInvoice?.hostedInvoiceUrl,
      invoicePdfUrl: snapshot.invoicePdfUrl ?? existingInvoice?.invoicePdfUrl,
      servicePeriodStart: snapshot.servicePeriodStart ?? existingInvoice?.servicePeriodStart,
      servicePeriodEnd: snapshot.servicePeriodEnd ?? existingInvoice?.servicePeriodEnd,
      paidAt: effectiveStatus === "paid" ? (preserveExistingState ? existingInvoice?.paidAt : snapshot.paidAt ?? existingInvoice?.paidAt ?? now) : existingInvoice?.paidAt,
      failureCode: effectiveStatus === "paid" ? null : preserveExistingState ? existingInvoice?.failureCode : snapshot.failureCode,
      failureMessage: effectiveStatus === "paid" ? null : preserveExistingState ? existingInvoice?.failureMessage : snapshot.failureMessage,
      livemode: preserveExistingState ? existingInvoice!.livemode : snapshot.livemode,
      ...invoiceEventFields,
      updatedAt: now
    };
    const [invoiceRow] = await tx.insert(billingInvoices).values({
      id: existingInvoice?.id ?? stableIdFromKey("invoice", snapshot.stripeInvoiceId),
      stripeInvoiceId: snapshot.stripeInvoiceId,
      ...invoiceValues,
      createdAt: existingInvoice?.createdAt ?? now
    }).onConflictDoUpdate({ target: billingInvoices.stripeInvoiceId, set: invoiceValues }).returning();

    if (snapshot.paymentIntentId && subscriptionRow.paymentIntentId && snapshot.paymentIntentId !== subscriptionRow.paymentIntentId) {
      return toBillingInvoice(invoiceRow);
    }
    if (preserveExistingState) return toBillingInvoice(invoiceRow);

    const stripeSubscriptionId = snapshot.stripeSubscriptionId ?? subscriptionRow.stripeSubscriptionId ?? attempt.stripeSubscriptionId;
    const stripeCustomerId = snapshot.stripeCustomerId ?? subscriptionRow.stripeCustomerId ?? attempt.stripeCustomerId;
    const subscriptionEventFields = stripeEventFields(
      eventCreated,
      eventId,
      subscriptionRow.lastStripeEventCreated,
      subscriptionRow.lastStripeEventId
    );
    const commonSubscriptionUpdates = {
      stripeSubscriptionId,
      stripeCustomerId,
      ...subscriptionEventFields,
      updatedAt: now
    };
    const invoicePeriodIsOlder = subscriptionRow.source === "paid"
      && Boolean(subscriptionRow.expiresAt && snapshot.servicePeriodEnd && snapshot.servicePeriodEnd < subscriptionRow.expiresAt!);

    const isNoChargeTrialInvoice = effectiveStatus === "paid"
      && subscriptionRow.source === "trial"
      && snapshot.chargedAmountMinor === 0;
    if (isNoChargeTrialInvoice) {
      await tx.update(listingSubscriptions).set({
        ...commonSubscriptionUpdates,
        stripeStatus: "trialing"
      }).where(eq(listingSubscriptions.id, subscriptionRow.id));
      return toBillingInvoice(invoiceRow);
    }

    if (effectiveStatus === "paid") {
      if (invoicePeriodIsOlder) return toBillingInvoice(invoiceRow);
      if (isInitialInvoice) {
        await tx.update(paymentIntents).set({
          status: "succeeded",
          gatewayReference: stripeSubscriptionId ?? attempt.gatewayReference,
          stripeSubscriptionId,
          stripeCustomerId,
          stripeInvoiceId: attempt.stripeInvoiceId ?? snapshot.stripeInvoiceId,
          updatedAt: now
        }).where(eq(paymentIntents.id, attempt.id));
      }
      const paidExpiresAt = snapshot.servicePeriodEnd && subscriptionRow.expiresAt && subscriptionRow.expiresAt > snapshot.servicePeriodEnd
        ? subscriptionRow.expiresAt
        : snapshot.servicePeriodEnd ?? subscriptionRow.expiresAt;
      await tx.update(listingSubscriptions).set({
        ...commonSubscriptionUpdates,
        status: "active",
        source: "paid",
        stripeStatus: "active",
        autoRenew: !subscriptionRow.cancelAtPeriodEnd,
        startsAt: subscriptionRow.startsAt ?? snapshot.servicePeriodStart ?? now,
        expiresAt: paidExpiresAt,
        scheduledConversionAt: null,
        graceEndsAt: null,
        paymentIntentId: isInitialInvoice ? attempt.id : subscriptionRow.paymentIntentId
      }).where(eq(listingSubscriptions.id, subscriptionRow.id));
      const [listing] = await tx.select().from(listings).where(eq(listings.id, subscriptionRow.listingId)).limit(1);
      if (listing && listing.status !== "paused" && listing.moderationStatus !== "rejected") {
        const updates: Partial<typeof listings.$inferInsert> = { expiresAt: paidExpiresAt, updatedAt: now };
        if (listing.moderationStatus === "approved") {
          if (listing.status === "expired" || isInitialInvoice) updates.status = "live";
        } else if (isInitialInvoice || listing.status === "expired" || listing.status === "draft") {
          updates.status = "pending_review";
          updates.moderationStatus = "queued";
        }
        await tx.update(listings).set(updates).where(eq(listings.id, listing.id));
      }
      return toBillingInvoice(invoiceRow);
    }

    if (effectiveStatus === "failed" || effectiveStatus === "action_required" || effectiveStatus === "uncollectible") {
      if (invoicePeriodIsOlder) return toBillingInvoice(invoiceRow);
      const hasPriorEntitlement = subscriptionRow.source === "trial" || Boolean(subscriptionRow.startsAt) || subscriptionRow.status === "active" || subscriptionRow.status === "past_due";
      if (isInitialInvoice) {
        await tx.update(paymentIntents).set({
          status: effectiveStatus === "action_required" ? "pending" : "failed",
          gatewayReference: stripeSubscriptionId ?? attempt.gatewayReference,
          stripeSubscriptionId,
          stripeCustomerId,
          stripeInvoiceId: attempt.stripeInvoiceId ?? snapshot.stripeInvoiceId,
          updatedAt: now
        }).where(eq(paymentIntents.id, attempt.id));
      }
      if (hasPriorEntitlement) {
        const graceEndsAt = subscriptionRow.graceEndsAt && subscriptionRow.graceEndsAt > now ? subscriptionRow.graceEndsAt : addDays(now, 7);
        await tx.update(listingSubscriptions).set({
          ...commonSubscriptionUpdates,
          status: "past_due",
          stripeStatus: effectiveStatus === "action_required" ? "past_due" : "unpaid",
          graceEndsAt
        }).where(eq(listingSubscriptions.id, subscriptionRow.id));
        const [listing] = await tx.select().from(listings).where(eq(listings.id, subscriptionRow.listingId)).limit(1);
        if (listing && listing.moderationStatus !== "rejected") {
          const status = listing.moderationStatus === "approved" && listing.status === "expired" ? "live" : listing.status;
          await tx.update(listings).set({ status, expiresAt: graceEndsAt, updatedAt: now }).where(eq(listings.id, listing.id));
        }
      } else {
        await tx.update(listingSubscriptions).set({
          ...commonSubscriptionUpdates,
          status: "pending_payment",
          stripeStatus: effectiveStatus === "action_required" ? "incomplete" : "unpaid",
          graceEndsAt: null
        }).where(eq(listingSubscriptions.id, subscriptionRow.id));
      }
    } else {
      await tx.update(listingSubscriptions).set(commonSubscriptionUpdates).where(eq(listingSubscriptions.id, subscriptionRow.id));
    }
    return toBillingInvoice(invoiceRow);
  });
}

export async function syncStripeSubscriptionSnapshot(snapshot: StripeSubscriptionSnapshot, eventCreated?: number, eventId?: string) {
  if (!hasDatabase) return undefined;
  return withBillingTransaction(async (tx) => {
    let [candidate] = await tx.select().from(listingSubscriptions).where(eq(listingSubscriptions.stripeSubscriptionId, snapshot.stripeSubscriptionId)).limit(1);
    if (!candidate && snapshot.listingSubscriptionId) {
      [candidate] = await tx.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, snapshot.listingSubscriptionId)).limit(1);
    }
    if (!candidate) return undefined;
    await tx.execute(sql`select "id" from "listing_subscriptions" where "id" = ${candidate.id} for update`);
    const [subscription] = await tx.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, candidate.id)).limit(1);
    if (!subscription) return undefined;
    if (snapshot.paymentIntentId && subscription.paymentIntentId && snapshot.paymentIntentId !== subscription.paymentIntentId) {
      return toListingSubscription(subscription);
    }
    if (isOlderStripeEvent(eventCreated, subscription.lastStripeEventCreated)) {
      return toListingSubscription(subscription);
    }

    const now = new Date();
    const eventFields = stripeEventFields(eventCreated, eventId, subscription.lastStripeEventCreated, subscription.lastStripeEventId);
    const updates: Partial<typeof listingSubscriptions.$inferInsert> = {
      stripeSubscriptionId: snapshot.stripeSubscriptionId,
      stripeCustomerId: snapshot.stripeCustomerId,
      stripeStatus: snapshot.status,
      cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      autoRenew: !snapshot.cancelAtPeriodEnd,
      ...eventFields,
      updatedAt: now
    };
    if (!snapshot.cancelAtPeriodEnd && snapshot.status !== "canceled" && snapshot.status !== "incomplete_expired" && snapshot.status !== "unpaid") {
      updates.cancelledAt = null;
    }
    if (snapshot.trialEnd && subscription.source === "trial") {
      updates.scheduledConversionAt = snapshot.trialEnd;
      if (!subscription.expiresAt || snapshot.trialEnd > subscription.expiresAt) updates.expiresAt = snapshot.trialEnd;
    }
    if (snapshot.status === "canceled" || snapshot.status === "incomplete_expired" || snapshot.status === "unpaid") {
      updates.autoRenew = false;
      updates.cancelAtPeriodEnd = false;
      updates.cancelledAt = now;
      if (subscription.source === "trial") updates.scheduledConversionAt = null;
      if (subscription.source !== "trial" || !subscription.expiresAt || subscription.expiresAt <= now) updates.status = "expired";
    } else if (snapshot.status === "past_due") {
      updates.status = subscription.status === "active" ? "active" : subscription.status;
    } else if (snapshot.status === "active" && subscription.source !== "trial" && subscription.startsAt && subscription.expiresAt) {
      updates.status = "active";
    }

    const [updated] = await tx.update(listingSubscriptions).set(withoutUndefined(updates)).where(eq(listingSubscriptions.id, subscription.id)).returning();
    if (updated?.source === "trial" && updated.scheduledConversionAt && updated.expiresAt) {
      await tx.update(listings).set({ expiresAt: updated.expiresAt, updatedAt: now }).where(eq(listings.id, updated.listingId));
    }
    if (updated?.status === "expired") {
      await tx.update(listings).set({ status: "expired", expiresAt: updated.expiresAt ?? now, updatedAt: now }).where(eq(listings.id, updated.listingId));
    }
    return updated ? toListingSubscription(updated) : undefined;
  });
}

export async function processStripeWebhookEventTransaction(
  input: { id: string; type: string; objectId: string; eventCreated: number },
  handler: () => Promise<void>
): Promise<"processed" | "duplicate" | "retry"> {
  if (!hasDatabase) {
    if (processedMemoryRenewalEventIds.has(input.id)) return "duplicate";
    await handler();
    processedMemoryRenewalEventIds.add(input.id);
    return "processed";
  }

  return db.transaction(async (tx) => {
    let inserted = await tx.insert(stripeWebhookEvents).values({
      id: input.id,
      type: input.type,
      objectId: input.objectId,
      eventCreated: input.eventCreated
    }).onConflictDoNothing().returning({ id: stripeWebhookEvents.id });

    if (inserted.length === 0) {
      await tx.execute(sql`select "id" from "stripe_webhook_events" where "id" = ${input.id} for update`);
      const [existing] = await tx.select().from(stripeWebhookEvents).where(eq(stripeWebhookEvents.id, input.id)).limit(1);
      if (existing?.processedAt) return "duplicate";
      const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
      if (!existing || existing.createdAt > staleBefore) return "retry";
      await tx.delete(stripeWebhookEvents).where(eq(stripeWebhookEvents.id, input.id));
      inserted = await tx.insert(stripeWebhookEvents).values({
        id: input.id,
        type: input.type,
        objectId: input.objectId,
        eventCreated: input.eventCreated
      }).returning({ id: stripeWebhookEvents.id });
      if (inserted.length === 0) return "retry";
    }

    await stripeWebhookTransaction.run(tx, handler);
    await tx.update(stripeWebhookEvents).set({ processedAt: new Date() }).where(eq(stripeWebhookEvents.id, input.id));
    return "processed";
  });
}

export async function recordAdminAudit(input: {
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  result?: string;
}) {
  if (!hasDatabase) return;
  await db.insert(adminAuditLogs).values({
    id: `audit-${randomUUID()}`,
    actorEmail: input.actorEmail,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    before: input.before,
    after: input.after,
    result: input.result ?? "succeeded"
  });
}

export async function getAdminAuditLogs(filters: { cursor?: string; limit?: number } = {}) {
  if (!hasDatabase) return { items: [], nextCursor: undefined };
  const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
  const cursor = decodeBillingCursor(filters.cursor);
  const rows = await db.select().from(adminAuditLogs)
    .where(cursor ? cursor.key
      ? sql`(${adminAuditLogs.createdAt} < ${cursor.createdAt} or (${adminAuditLogs.createdAt} = ${cursor.createdAt} and ('audit:' || ${adminAuditLogs.id}) < ${cursor.key}))`
      : sql`${adminAuditLogs.createdAt} < ${cursor.createdAt}` : undefined)
    .orderBy(desc(adminAuditLogs.createdAt), desc(adminAuditLogs.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString()
    })),
    nextCursor: rows.length > limit && last ? encodeBillingCursor(last.createdAt, `audit:${last.id}`) : undefined
  };
}

async function enqueueBillingOperation(type: string, targetId: string, payload: Record<string, unknown> = {}) {
  if (!hasDatabase) return undefined;
  const [operation] = await db.insert(billingOperations).values({
    id: `billing-op-${randomUUID()}`,
    type,
    status: "pending",
    targetId,
    payload,
    nextAttemptAt: new Date()
  }).returning();
  return operation;
}

async function finishBillingOperation(operationId: string | undefined, error?: unknown) {
  if (!hasDatabase || !operationId) return;
  await db.update(billingOperations).set({
    status: error ? "pending" : "succeeded",
    attempts: sql`${billingOperations.attempts} + 1`,
    lastError: error instanceof Error ? error.message : error ? String(error) : null,
    nextAttemptAt: error ? addDays(new Date(), 1 / 24) : null,
    updatedAt: new Date()
  }).where(eq(billingOperations.id, operationId));
}

export async function processPendingBillingOperations(limit = 10) {
  if (!hasDatabase) return { processed: 0, succeeded: 0, failed: 0 };
  const now = new Date();
  const staleProcessingBefore = new Date(now.getTime() - 10 * 60 * 1000);
  await db.update(billingOperations).set({
    status: "pending",
    nextAttemptAt: now,
    lastError: "Worker lease expired before completion.",
    updatedAt: now
  }).where(and(eq(billingOperations.status, "processing"), sql`${billingOperations.updatedAt} <= ${staleProcessingBefore}`));

  const candidates = await db.select().from(billingOperations)
    .where(and(eq(billingOperations.status, "pending"), sql`(${billingOperations.nextAttemptAt} is null or ${billingOperations.nextAttemptAt} <= ${now})`))
    .orderBy(billingOperations.nextAttemptAt, billingOperations.createdAt)
    .limit(Math.min(50, Math.max(1, limit)));
  let succeeded = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const [claimed] = await db.update(billingOperations).set({ status: "processing", updatedAt: new Date() })
      .where(and(eq(billingOperations.id, candidate.id), eq(billingOperations.status, "pending")))
      .returning();
    if (!claimed) continue;
    try {
      await executeBillingOperation(claimed.type, claimed.targetId, claimed.payload);
      await finishBillingOperation(claimed.id);
      succeeded += 1;
    } catch (error) {
      await finishBillingOperation(claimed.id, error);
      failed += 1;
    }
  }
  return { processed: succeeded + failed, succeeded, failed };
}

async function executeBillingOperation(type: string, targetId: string, payload: Record<string, unknown>) {
  if (type === "expire_checkout_session") {
    const stripeCheckoutSessionId = typeof payload.stripeCheckoutSessionId === "string" ? payload.stripeCheckoutSessionId : undefined;
    if (!stripeCheckoutSessionId) throw new Error("Billing operation is missing its Stripe Checkout Session.");
    await expireStripeCheckoutSession(stripeCheckoutSessionId);
    const paymentAttemptId = typeof payload.paymentAttemptId === "string" ? payload.paymentAttemptId : undefined;
    if (paymentAttemptId) {
      await db.update(paymentIntents).set({ status: "expired", updatedAt: new Date() }).where(eq(paymentIntents.id, paymentAttemptId));
    }
    return;
  }
  const stripeSubscriptionId = typeof payload.stripeSubscriptionId === "string" ? payload.stripeSubscriptionId : undefined;
  if (!stripeSubscriptionId) throw new Error(`Billing operation ${type} is missing its Stripe subscription.`);
  if (type === "cancel_at_period_end") {
    await syncStripeSubscriptionSnapshot(await setStripeSubscriptionCancelAtPeriodEnd(stripeSubscriptionId));
    return;
  }
  if (type === "cancel_trial_subscription" || type === "cancel_replaced_subscription") {
    await syncStripeSubscriptionSnapshot(await cancelStripeTrialSubscription(stripeSubscriptionId));
    return;
  }
  if (type === "update_trial_end") {
    const trialEndsAt = typeof payload.trialEndsAt === "string" ? new Date(payload.trialEndsAt) : undefined;
    if (!trialEndsAt || !Number.isFinite(trialEndsAt.getTime())) throw new Error("Billing operation has an invalid trial end date.");
    await syncStripeSubscriptionSnapshot(await updateStripeSubscriptionTrialEnd(stripeSubscriptionId, trialEndsAt));
    return;
  }
  if (type === "reconcile_subscription") {
    for (const invoice of await retrieveStripeInvoiceSnapshots(stripeSubscriptionId)) {
      await recordStripeBillingInvoice(invoice);
    }
    await syncStripeSubscriptionSnapshot(await retrieveStripeSubscriptionSnapshot(stripeSubscriptionId));
    return;
  }
  throw new Error(`Unsupported billing operation type: ${type} (${targetId}).`);
}

export async function syncStripeSubscriptionStatus(input: {
  stripeSubscriptionId: string;
  status: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: Date;
}) {
  const intent = await getPaymentIntentByStripeSubscription(input.stripeSubscriptionId);
  if (!intent?.subscriptionId) return undefined;

  const now = new Date();
  const nextStatus = mapStripeSubscriptionStatus(input.status);
  if (!nextStatus && input.cancelAtPeriodEnd === undefined && !input.currentPeriodEnd) return undefined;
  const updates: Partial<typeof listingSubscriptions.$inferInsert> = {
    autoRenew: input.cancelAtPeriodEnd === undefined ? undefined : !input.cancelAtPeriodEnd,
    expiresAt: input.currentPeriodEnd,
    updatedAt: now
  };
  if (nextStatus) updates.status = nextStatus;
  if (nextStatus === "cancelled" || nextStatus === "expired") {
    updates.autoRenew = false;
    updates.cancelledAt = now;
  }

  if (hasDatabase) {
    const [updated] = await db
      .update(listingSubscriptions)
      .set(withoutUndefined(updates))
      .where(eq(listingSubscriptions.id, intent.subscriptionId))
      .returning();
    if ((nextStatus === "cancelled" || nextStatus === "expired") && updated) {
      await db.update(listings).set({ status: "expired", expiresAt: input.currentPeriodEnd ?? now, updatedAt: now }).where(eq(listings.id, updated.listingId));
    }
    return updated ? toListingSubscription(updated) : undefined;
  }

  const state = await getMemoryState();
  const subscription = state.listingSubscriptions.find((item) => item.id === intent.subscriptionId);
  if (!subscription) return undefined;
  if (nextStatus) subscription.status = nextStatus;
  if (input.cancelAtPeriodEnd !== undefined) subscription.autoRenew = !input.cancelAtPeriodEnd;
  if (input.currentPeriodEnd) subscription.expiresAt = input.currentPeriodEnd.toISOString();
  if (nextStatus === "cancelled" || nextStatus === "expired") {
    subscription.autoRenew = false;
    subscription.cancelledAt = now.toISOString();
    const listing = state.database.listings.find((item) => item.id === subscription.listingId);
    if (listing) {
      listing.status = "expired";
      listing.expiresAt = (input.currentPeriodEnd ?? now).toISOString();
    }
  }
  subscription.updatedAt = now.toISOString();
  return subscription;
}

export async function cancelListingSubscription(userId: string, subscriptionId: string) {
  const now = new Date();
  const stripeSubscriptionId = await getStripeSubscriptionIdForListingSubscription(userId, subscriptionId);
  const operation = stripeSubscriptionId
    ? await enqueueBillingOperation("cancel_at_period_end", subscriptionId, { stripeSubscriptionId })
    : undefined;
  if (hasDatabase) {
    try {
      if (stripeSubscriptionId) await setStripeSubscriptionCancelAtPeriodEnd(stripeSubscriptionId);
      const [updated] = await db.update(listingSubscriptions).set({ autoRenew: false, cancelAtPeriodEnd: true, cancelledAt: now, updatedAt: now }).where(and(eq(listingSubscriptions.id, subscriptionId), eq(listingSubscriptions.userId, userId))).returning();
      await finishBillingOperation(operation?.id);
      return updated ? toListingSubscription(updated) : undefined;
    } catch (error) {
      await finishBillingOperation(operation?.id, error);
      throw error;
    }
  }

  const subscription = (await getMemoryState()).listingSubscriptions.find((item) => item.id === subscriptionId && item.userId === userId);
  if (!subscription) return undefined;
  subscription.autoRenew = false;
  subscription.cancelAtPeriodEnd = true;
  subscription.cancelledAt = now.toISOString();
  subscription.updatedAt = now.toISOString();
  return subscription;
}

export async function cancelListingSubscriptionByAdmin(subscriptionId: string): Promise<ListingBillingSummary | undefined> {
  if (!hasDatabase) return undefined;
  const [subscription] = await db.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, subscriptionId)).limit(1);
  if (!subscription) return undefined;
  await cancelListingSubscription(subscription.userId, subscriptionId);
  return getListingBillingSummary(subscriptionId);
}

export async function reconcileListingSubscription(subscriptionId: string): Promise<ListingBillingSummary | undefined> {
  if (!hasDatabase) return undefined;
  const [subscription] = await db.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, subscriptionId)).limit(1);
  if (!subscription) return undefined;
  const stripeSubscriptionId = subscription.stripeSubscriptionId ?? await getStripeSubscriptionIdForListingSubscription(subscription.userId, subscriptionId);
  if (!stripeSubscriptionId) return getListingBillingSummary(subscriptionId);

  const operation = await enqueueBillingOperation("reconcile_subscription", subscriptionId, { stripeSubscriptionId });
  try {
    const invoices = await retrieveStripeInvoiceSnapshots(stripeSubscriptionId);
    for (const invoice of invoices) await recordStripeBillingInvoice(invoice);
    const snapshot = await retrieveStripeSubscriptionSnapshot(stripeSubscriptionId);
    await syncStripeSubscriptionSnapshot(snapshot);
    await finishBillingOperation(operation?.id);
  } catch (error) {
    await finishBillingOperation(operation?.id, error);
    throw error;
  }
  return getListingBillingSummary(subscriptionId);
}

export async function getListingBillingSummary(subscriptionId: string): Promise<ListingBillingSummary | undefined> {
  const subscription = await getListingSubscriptionById(subscriptionId);
  if (!subscription) return undefined;
  const latestAttempt = await getLatestPaymentIntentForSubscription(subscriptionId);
  let latestInvoice: BillingInvoice | undefined;
  if (hasDatabase) {
    const [invoice] = await db.select().from(billingInvoices).where(eq(billingInvoices.subscriptionId, subscriptionId)).orderBy(desc(billingInvoices.createdAt)).limit(1);
    latestInvoice = invoice ? toBillingInvoice(invoice) : undefined;
  }
  return {
    subscription,
    latestAttempt,
    latestInvoice,
    graceEndsAt: subscription.graceEndsAt,
    scheduledConversionAt: subscription.scheduledConversionAt
  };
}

export async function cancelListingSubscriptionsForListing(listingId: string) {
  const now = new Date();
  
  if (hasDatabase) {
    const subscriptions = await db.select().from(listingSubscriptions).where(eq(listingSubscriptions.listingId, listingId));
    const completedStripeOperations: string[] = [];
    const cancelledAttemptIds: string[] = [];
    const checkoutOnlySubscriptionIds: string[] = [];
    const scheduledTrialIds = subscriptions
      .filter((subscription) => subscription.autoRenew && subscription.source === "trial" && subscription.scheduledConversionAt)
      .map((subscription) => subscription.id);
    const periodEndIds = subscriptions
      .filter((subscription) => subscription.autoRenew && !scheduledTrialIds.includes(subscription.id))
      .map((subscription) => subscription.id);
    
    for (const sub of subscriptions) {
      if (!sub.autoRenew) continue;
      
      const rows = await db.select().from(paymentIntents).where(eq(paymentIntents.subscriptionId, sub.id)).orderBy(desc(paymentIntents.createdAt)).limit(1);
      const stripeSubscriptionId = sub.stripeSubscriptionId ?? rows[0]?.stripeSubscriptionId ?? (rows[0]?.gatewayReference?.startsWith("sub_") ? rows[0].gatewayReference : undefined);
      
      if (stripeSubscriptionId) {
        const cancelsUnpaidTrial = scheduledTrialIds.includes(sub.id);
        const operation = await enqueueBillingOperation(cancelsUnpaidTrial ? "cancel_trial_subscription" : "cancel_at_period_end", sub.id, { stripeSubscriptionId, reason: "listing_unpublished" });
        try {
          if (cancelsUnpaidTrial) await cancelStripeTrialSubscription(stripeSubscriptionId);
          else await setStripeSubscriptionCancelAtPeriodEnd(stripeSubscriptionId);
          if (operation?.id) completedStripeOperations.push(operation.id);
        } catch (error) {
          await finishBillingOperation(operation?.id, error);
        }
      } else if (rows[0]?.stripeCheckoutSessionId) {
        const paymentAttemptId = rows[0].id;
        const stripeCheckoutSessionId = rows[0].stripeCheckoutSessionId;
        cancelledAttemptIds.push(paymentAttemptId);
        checkoutOnlySubscriptionIds.push(sub.id);
        const operation = await enqueueBillingOperation("expire_checkout_session", sub.id, { stripeCheckoutSessionId, paymentAttemptId, reason: "listing_unpublished" });
        try {
          await expireStripeCheckoutSession(stripeCheckoutSessionId);
          if (operation?.id) completedStripeOperations.push(operation.id);
        } catch (error) {
          await finishBillingOperation(operation?.id, error);
        }
      }
    }

    try {
      await db.transaction(async (tx) => {
        if (periodEndIds.length > 0) {
          await tx.update(listingSubscriptions)
            .set({ autoRenew: false, cancelAtPeriodEnd: true, cancelledAt: now, updatedAt: now })
            .where(inArray(listingSubscriptions.id, periodEndIds));
        }
        if (scheduledTrialIds.length > 0) {
          await tx.update(listingSubscriptions)
            .set({ autoRenew: false, cancelAtPeriodEnd: false, scheduledConversionAt: null, stripeStatus: "canceled", cancelledAt: now, updatedAt: now })
            .where(inArray(listingSubscriptions.id, scheduledTrialIds));
        }
        if (cancelledAttemptIds.length > 0) {
          await tx.update(paymentIntents).set({ status: "cancelled", updatedAt: now }).where(inArray(paymentIntents.id, cancelledAttemptIds));
        }
        if (checkoutOnlySubscriptionIds.length > 0) {
          await tx.update(listingSubscriptions)
            .set({ status: "cancelled", autoRenew: false, cancelAtPeriodEnd: false, cancelledAt: now, updatedAt: now })
            .where(inArray(listingSubscriptions.id, checkoutOnlySubscriptionIds));
        }
      });
      for (const operationId of completedStripeOperations) {
        await finishBillingOperation(operationId);
      }
    } catch (error) {
      for (const operationId of completedStripeOperations) {
        await finishBillingOperation(operationId, error);
      }
      throw error;
    }
    return;
  }

  const state = await getMemoryState();
  const subscriptions = state.listingSubscriptions.filter((item) => item.listingId === listingId && item.autoRenew);
  for (const subscription of subscriptions) {
    const intent = state.paymentIntents.find((item) => item.subscriptionId === subscription.id);
    const stripeSubscriptionId = intent?.stripeSubscriptionId ?? (intent?.gatewayReference?.startsWith("sub_") ? intent.gatewayReference : undefined);
    
    if (stripeSubscriptionId) {
      if (subscription.source === "trial" && subscription.scheduledConversionAt) await cancelStripeTrialSubscription(stripeSubscriptionId);
      else await setStripeSubscriptionCancelAtPeriodEnd(stripeSubscriptionId);
    } else if (intent?.stripeCheckoutSessionId) {
      await expireStripeCheckoutSession(intent.stripeCheckoutSessionId);
      intent.status = "cancelled";
      intent.updatedAt = now.toISOString();
      subscription.status = "cancelled";
    }
    
    subscription.autoRenew = false;
    subscription.cancelAtPeriodEnd = !(subscription.source === "trial" && subscription.scheduledConversionAt);
    if (subscription.source === "trial") subscription.scheduledConversionAt = undefined;
    subscription.cancelledAt = now.toISOString();
    subscription.updatedAt = now.toISOString();
  }
}

export async function createStorageUpload(userId: string, request: StorageUploadRequest) {
  if (request.scope !== "profile") {
    if (!request.listingId || !(await getListingForUser(userId, request.listingId))) {
      throw new Error("Listing not found or upload is not authorized.");
    }
  }
  return createUserUploadTarget(userId, request);
}

async function syncSellerDetailsForUser(userId: string, patch: UserPatch) {
  if (patch.name === undefined && patch.phone === undefined && patch.address === undefined) return;

  const sellerRows = await db.select({ id: sellerProfiles.id }).from(sellerProfiles).where(eq(sellerProfiles.userId, userId));

  if (patch.name !== undefined) {
    await db.update(sellerProfiles).set({ displayName: patch.name }).where(eq(sellerProfiles.userId, userId));
  }

  const sellerIds = sellerRows.map((seller) => seller.id);

  if (patch.address !== undefined) {
    await db.update(sellerProfiles).set({ location: patch.address }).where(eq(sellerProfiles.userId, userId));
    if (sellerIds.length > 0) {
      await db.update(listings).set({ location: patch.address, updatedAt: new Date() }).where(inArray(listings.sellerId, sellerIds));
    }
  }

  if (patch.phone === undefined || sellerRows.length === 0) return;

  const listingRows = await db.select({ id: listings.id }).from(listings).where(inArray(listings.sellerId, sellerIds));
  if (listingRows.length === 0) return;

  await db
    .insert(listingContacts)
    .values(listingRows.map((listing) => ({ listingId: listing.id, phone: patch.phone!, remainingReveals: 0 })))
    .onConflictDoUpdate({
      target: listingContacts.listingId,
      set: { phone: patch.phone }
    });
}

function syncMemorySellerDetailsForUser(state: MemoryState, userId: string, patch: UserPatch) {
  if (patch.name === undefined && patch.phone === undefined && patch.address === undefined) return;

  const sellerIds = new Set<string>();
  for (const seller of state.database.sellers) {
    if (seller.userId !== userId) continue;
    sellerIds.add(seller.id);
    if (patch.name !== undefined) seller.displayName = patch.name;
    if (patch.address !== undefined) seller.location = patch.address;
  }

  if (sellerIds.size === 0) return;

  for (const listing of state.database.listings) {
    if (!sellerIds.has(listing.sellerId)) continue;
    if (patch.address !== undefined) listing.location = patch.address;
    if (patch.phone === undefined) continue;
    const existing = state.database.listingContacts[listing.id];
    state.database.listingContacts[listing.id] = {
      phone: patch.phone,
      remainingReveals: existing?.remainingReveals ?? 0
    };
  }
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
    await db.execute(sql`alter table orders add column if not exists payment_method varchar not null default 'stripe'`);
    await db.execute(sql`update orders set payment_method = 'stripe' where payment_method <> 'stripe'`);
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

function normalizeListingCheckoutDraft(input: Partial<ListingCheckoutDraft> | undefined): ListingCheckoutDraft {
  const attributes: Partial<GemAttributes> = input?.attributes ?? {};
  const draft: ListingCheckoutDraft = {
    title: normalizeListingTitle(normalizeRequiredString(input?.title, "Listing title is required.")),
    gemTypeId: normalizeRequiredString(input?.gemTypeId, "Gem type is required."),
    description: normalizeRequiredString(input?.description, "Description is required."),
    priceLkr: normalizePositiveNumber(input?.priceLkr, "Price must be greater than zero."),
    location: normalizeRequiredString(input?.location, "Location is required."),
    attributes: {
      carat: normalizePositiveNumber(attributes.carat, "Carat weight is required."),
      dimensions: String(attributes.dimensions ?? "").trim(),
      shape: String(attributes.shape ?? "").trim(),
      cut: String(attributes.cut ?? "").trim(),
      color: normalizeRequiredString(attributes.color, "Color is required."),
      clarity: normalizeRequiredString(attributes.clarity, "Clarity is required."),
      origin: normalizeRequiredString(attributes.origin, "Origin is required."),
      treatment: attributes.treatment === "heated" || attributes.treatment === "untreated" || attributes.treatment === "diffused" || attributes.treatment === "filled" ? attributes.treatment : "untreated",
      certificateStatus: attributes.certificateStatus === "seller_provided" ? "seller_provided" : "none",
      labName: normalizeOptionalString(attributes.labName),
      reportNumber: normalizeOptionalString(attributes.reportNumber)
    }
  };
  return draft;
}

function normalizeListingCheckoutMediaInputs(input: unknown): Array<{ kind: "photo" | "certificate"; fileName: string; contentType: string; size: number }> {
  if (!Array.isArray(input)) throw new Error("At least one gem photo is required.");
  const media = input.map((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const kind: "photo" | "certificate" = value.kind === "certificate" ? "certificate" : "photo";
    const fileName = normalizeRequiredString(value.fileName, "File name is required.");
    const contentType = normalizeRequiredString(value.contentType, "File type is required.").toLowerCase();
    const size = normalizePositiveNumber(value.size, "File size is required.");
    if (size > maxListingCheckoutFileSize) throw new Error(`${fileName} exceeds the 2MB limit.`);
    if (kind === "photo" && !contentType.startsWith("image/")) throw new Error("Gem photos must be image files.");
    if (kind === "certificate" && contentType !== "application/pdf" && !contentType.startsWith("image/")) {
      throw new Error("Certificate must be a PDF or image file.");
    }
    return { kind, fileName, contentType, size };
  });
  const photoCount = media.filter((item) => item.kind === "photo").length;
  const certificateCount = media.filter((item) => item.kind === "certificate").length;
  if (photoCount === 0) throw new Error("At least one gem photo is required.");
  if (photoCount > maxListingCheckoutPhotoCount) throw new Error("You can upload a maximum of 15 gem photos.");
  if (certificateCount > 1) throw new Error("You can upload only one certificate.");
  return media;
}

function normalizeRequiredString(value: unknown, message: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(message);
  return normalized;
}

function normalizePositiveNumber(value: unknown, message: string) {
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) throw new Error(message);
  return normalized;
}

function hashListingCheckoutToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function isListingCheckoutSessionExpired(record: ListingCheckoutSessionRecord) {
  return record.status === "expired" || new Date(record.expiresAt).getTime() <= Date.now();
}

function publicListingCheckoutSession(token: string, record: ListingCheckoutSessionRecord): ListingCheckoutSession {
  return {
    token,
    status: isListingCheckoutSessionExpired(record) ? "expired" : record.status,
    draft: record.draft,
    media: record.media.map((item) => ({ ...item, readUrl: createSignedReadUrl(item.blobKey) })),
    selectedPlanId: record.selectedPlanId,
    acceptedPolicies: record.acceptedPolicies,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

async function getListingCheckoutSessionRecord(token: string): Promise<ListingCheckoutSessionRecord | undefined> {
  const normalizedToken = token.trim();
  if (!normalizedToken) return undefined;
  const tokenHash = hashListingCheckoutToken(normalizedToken);

  if (hasDatabase) {
    const rows = await db.select().from(listingCheckoutSessions).where(eq(listingCheckoutSessions.tokenHash, tokenHash)).limit(1);
    return rows[0] ? toListingCheckoutSessionRecord(rows[0]) : undefined;
  }

  return (await getMemoryState()).listingCheckoutSessions.find((item) => item.tokenHash === tokenHash);
}

async function updateListingCheckoutSessionRecord(id: string, updates: Partial<ListingCheckoutSessionRecord>) {
  if (hasDatabase) {
    const [updated] = await db
      .update(listingCheckoutSessions)
      .set(withoutUndefined({
        draft: updates.draft,
        media: updates.media,
        selectedPlanId: updates.selectedPlanId,
        acceptedPolicies: updates.acceptedPolicies,
        status: updates.status,
        claimedUserId: updates.claimedUserId,
        listingId: updates.listingId,
        paymentIntentId: updates.paymentIntentId,
        updatedAt: updates.updatedAt ? new Date(updates.updatedAt) : new Date()
      }))
      .where(eq(listingCheckoutSessions.id, id))
      .returning();
    if (!updated) throw new Error("Checkout session not found.");
    return toListingCheckoutSessionRecord(updated);
  }

  const session = (await getMemoryState()).listingCheckoutSessions.find((item) => item.id === id);
  if (!session) throw new Error("Checkout session not found.");
  Object.assign(session, updates);
  return session;
}

function toListingCheckoutSessionRecord(row: typeof listingCheckoutSessions.$inferSelect): ListingCheckoutSessionRecord {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    draft: row.draft,
    media: row.media,
    selectedPlanId: row.selectedPlanId ?? undefined,
    acceptedPolicies: row.acceptedPolicies,
    status: row.status,
    claimedUserId: row.claimedUserId ?? undefined,
    listingId: row.listingId ?? undefined,
    paymentIntentId: row.paymentIntentId ?? undefined,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
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
        location: user.address || "Sri Lanka",
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
    location: user.address || "Sri Lanka",
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
    listingCheckoutSessions: [],
    listingSubscriptions: [],
    subscriptionPlans: [
      { id: "basic", name: "Basic", priceLkr: 500, includedPhotos: 3, extraPhotoPriceLkr: 250, validityMonths: 1, eyebrow: "Starter", summary: "" },
      { id: "pro", name: "Pro", priceLkr: 1000, includedPhotos: 6, extraPhotoPriceLkr: 500, validityMonths: 2, eyebrow: "Recommended", summary: "" },
      { id: "plus", name: "Plus", priceLkr: 20000, includedPhotos: 10, extraPhotoPriceLkr: 500, validityMonths: 3, eyebrow: "Premium", summary: "" }
    ],
    paymentIntents: [],
    listingIdempotencyKeys: {},
    paymentIntentIdempotencyKeys: {}
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

async function expireExpiredTrialSubscriptions(userId: string) {
  const now = new Date();
  if (hasDatabase) {
    const subscriptions = await db.select().from(listingSubscriptions).where(and(eq(listingSubscriptions.userId, userId), eq(listingSubscriptions.source, "trial"), eq(listingSubscriptions.status, "active")));
    const expired = subscriptions.filter((subscription) =>
      subscription.expiresAt
      && subscription.expiresAt <= now
      && !(subscription.stripeSubscriptionId && subscription.scheduledConversionAt)
    );
    if (expired.length === 0) return;
    await db.update(listingSubscriptions).set({
      status: "expired",
      autoRenew: false,
      updatedAt: now
    }).where(inArray(listingSubscriptions.id, expired.map((subscription) => subscription.id)));
    await db.update(listings).set({
      status: "expired",
      updatedAt: now
    }).where(inArray(listings.id, expired.map((subscription) => subscription.listingId)));
    return;
  }

  const state = await getMemoryState();
  for (const subscription of state.listingSubscriptions.filter((item) => item.userId === userId && item.source === "trial" && item.status === "active" && item.expiresAt && new Date(item.expiresAt) <= now)) {
    subscription.status = "expired";
    subscription.autoRenew = false;
    subscription.updatedAt = now.toISOString();
    const listing = state.database.listings.find((item) => item.id === subscription.listingId);
    if (listing) listing.status = "expired";
  }
}

async function refreshTrialBackedListings(userId: string, expiresAt: Date) {
  const now = new Date();
  if (hasDatabase) {
    const subscriptions = await db.select().from(listingSubscriptions).where(and(eq(listingSubscriptions.userId, userId), eq(listingSubscriptions.source, "trial")));
    if (subscriptions.length === 0) return;
    const nextStatus = expiresAt > now ? "active" : "expired";
    await db.update(listingSubscriptions).set({
      status: nextStatus,
      expiresAt,
      cancelledAt: null,
      updatedAt: now
    }).where(and(eq(listingSubscriptions.userId, userId), eq(listingSubscriptions.source, "trial")));
    const listingRows = await db.select().from(listings).where(inArray(listings.id, subscriptions.map((subscription) => subscription.listingId)));
    for (const listing of listingRows) {
      if (nextStatus === "expired") {
        await db.update(listings).set({ status: "expired", expiresAt, updatedAt: now }).where(eq(listings.id, listing.id));
        continue;
      }
      if (listing.moderationStatus === "rejected") {
        await db.update(listings).set({ expiresAt, updatedAt: now }).where(eq(listings.id, listing.id));
        continue;
      }
      const status = listing.status === "expired"
        ? listing.moderationStatus === "approved" ? "live" : "pending_review"
        : listing.status;
      await db.update(listings).set({
        status,
        moderationStatus: status === "pending_review" ? "queued" : listing.moderationStatus,
        expiresAt,
        updatedAt: now
      }).where(eq(listings.id, listing.id));
    }
    return;
  }

  const state = await getMemoryState();
  const nextStatus = expiresAt > now ? "active" : "expired";
  for (const subscription of state.listingSubscriptions.filter((item) => item.userId === userId && item.source === "trial")) {
    subscription.status = nextStatus;
    subscription.expiresAt = expiresAt.toISOString();
    subscription.cancelledAt = undefined;
    subscription.updatedAt = now.toISOString();
    const listing = state.database.listings.find((item) => item.id === subscription.listingId);
    if (listing) {
      if (nextStatus === "expired") listing.status = "expired";
      else if (listing.status === "expired" && listing.moderationStatus !== "rejected") {
        listing.status = listing.moderationStatus === "approved" ? "live" : "pending_review";
        if (listing.status === "pending_review") listing.moderationStatus = "queued";
      }
      listing.expiresAt = expiresAt.toISOString();
    }
  }
}

async function expireTrialBackedListings(userId: string, expiredAt: Date) {
  if (hasDatabase) {
    const subscriptions = await db.select().from(listingSubscriptions).where(and(eq(listingSubscriptions.userId, userId), eq(listingSubscriptions.source, "trial")));
    if (subscriptions.length === 0) return;
    await db.update(listingSubscriptions).set({
      status: "expired",
      autoRenew: false,
      expiresAt: expiredAt,
      cancelledAt: expiredAt,
      updatedAt: expiredAt
    }).where(and(eq(listingSubscriptions.userId, userId), eq(listingSubscriptions.source, "trial")));
    await db.update(listings).set({
      status: "expired",
      expiresAt: expiredAt,
      updatedAt: expiredAt
    }).where(inArray(listings.id, subscriptions.map((subscription) => subscription.listingId)));
    return;
  }

  const state = await getMemoryState();
  for (const subscription of state.listingSubscriptions.filter((item) => item.userId === userId && item.source === "trial")) {
    subscription.status = "expired";
    subscription.autoRenew = false;
    subscription.expiresAt = expiredAt.toISOString();
    subscription.cancelledAt = expiredAt.toISOString();
    subscription.updatedAt = expiredAt.toISOString();
    const listing = state.database.listings.find((item) => item.id === subscription.listingId);
    if (listing) {
      listing.status = "expired";
      listing.expiresAt = expiredAt.toISOString();
    }
  }
}

function isSubscriptionInPaidAccess(status: ListingSubscriptionStatus, expiresAt: Date | string | null | undefined, now = new Date()) {
  if (status !== "active" && status !== "past_due") return false;
  if (!expiresAt) return false;
  return new Date(expiresAt) > now;
}

function normalizePaymentStatus(status: PaymentStatus): PaymentStatus {
  if (status === "succeeded" || status === "scheduled" || status === "pending" || status === "cancelled" || status === "expired") return status;
  return "failed";
}

async function shouldIgnoreNonSuccessfulPaymentConfirmation(intent: PaymentIntent, nextStatus: PaymentStatus) {
  if (nextStatus === "succeeded") return false;
  if (intent.status === "cancelled") return true;
  if (!intent.subscriptionId) return false;

  const subscription = await getListingSubscriptionById(intent.subscriptionId);
  return Boolean(subscription?.paymentIntentId && subscription.paymentIntentId !== intent.id);
}

async function getListingSubscriptionById(subscriptionId: string) {
  if (hasDatabase) {
    const rows = await db.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, subscriptionId)).limit(1);
    return rows[0] ? toListingSubscription(rows[0]) : undefined;
  }

  return (await getMemoryState()).listingSubscriptions.find((item) => item.id === subscriptionId);
}

function mergeStripePaymentState(intent: PaymentIntent, gatewayReference?: string, stripeState: StripePaymentState = {}) {
  const stripeCheckoutSessionId =
    stripeState.stripeCheckoutSessionId ??
    intent.stripeCheckoutSessionId ??
    (gatewayReference?.startsWith("cs_") ? gatewayReference : undefined);
  const stripeSubscriptionId =
    stripeState.stripeSubscriptionId ??
    intent.stripeSubscriptionId ??
    (gatewayReference?.startsWith("sub_") ? gatewayReference : undefined);
  const gatewayReferenceFallback = stripeSubscriptionId ?? stripeCheckoutSessionId ?? gatewayReference ?? intent.gatewayReference;

  return {
    gatewayReference: gatewayReferenceFallback,
    stripeCheckoutSessionId,
    stripeSubscriptionId,
    stripeCustomerId: stripeState.stripeCustomerId ?? intent.stripeCustomerId,
    stripeInvoiceId: stripeState.stripeInvoiceId ?? intent.stripeInvoiceId,
    livemode: stripeState.livemode ?? intent.livemode
  };
}

async function updatePaymentStripeState(intentId: string, stripeState: StripePaymentState) {
  const existing = await getPaymentIntent(intentId);
  if (!existing) return undefined;
  const nextState = mergeStripePaymentState(existing, undefined, stripeState);

  if (hasDatabase) {
    const [updated] = await db.update(paymentIntents).set({
      gatewayReference: nextState.gatewayReference,
      stripeCheckoutSessionId: nextState.stripeCheckoutSessionId,
      stripeSubscriptionId: nextState.stripeSubscriptionId,
      stripeCustomerId: nextState.stripeCustomerId,
      stripeInvoiceId: nextState.stripeInvoiceId,
      stripeLivemode: nextState.livemode,
      updatedAt: new Date()
    }).where(eq(paymentIntents.id, intentId)).returning();
    return updated ? toPaymentIntent(updated) : undefined;
  }

  const intent = (await getMemoryState()).paymentIntents.find((item) => item.id === intentId);
  if (!intent) return undefined;
  intent.gatewayReference = nextState.gatewayReference;
  intent.stripeCheckoutSessionId = nextState.stripeCheckoutSessionId;
  intent.stripeSubscriptionId = nextState.stripeSubscriptionId;
  intent.stripeCustomerId = nextState.stripeCustomerId;
  intent.stripeInvoiceId = nextState.stripeInvoiceId;
  intent.livemode = nextState.livemode;
  intent.updatedAt = new Date().toISOString();
  return intent;
}

async function applyListingSubscriptionPaymentStatus(subscriptionId: string | undefined, paymentStatus: PaymentStatus) {
  if (!subscriptionId) return;
  const now = new Date();

  const current = await getListingSubscriptionById(subscriptionId);
  if (current?.source === "trial" && current.status === "active" && current.expiresAt && new Date(current.expiresAt) > now) {
    // A Checkout cancellation/failure must never consume account-trial entitlement.
    return;
  }
  const hasEntitlement = Boolean(current?.startsAt && current.expiresAt && new Date(current.expiresAt) > now);
  const nextSubscriptionStatus =
    paymentStatus === "cancelled" ? "pending_payment" :
    paymentStatus === "expired" ? (hasEntitlement ? "expired" : "pending_payment") :
    paymentStatus === "failed" ? (hasEntitlement ? "past_due" : "pending_payment") :
    undefined;
  if (!nextSubscriptionStatus) return;

  if (hasDatabase) {
    const [updated] = await db.update(listingSubscriptions).set({
      status: nextSubscriptionStatus,
      autoRenew: nextSubscriptionStatus === "pending_payment" ? true : false,
      cancelledAt: nextSubscriptionStatus === "pending_payment" ? null : undefined,
      updatedAt: now
    }).where(eq(listingSubscriptions.id, subscriptionId)).returning();
    if (nextSubscriptionStatus === "expired" && updated) {
      await db.update(listings).set({ status: "expired", updatedAt: now }).where(eq(listings.id, updated.listingId));
    }
    return;
  }

  const state = await getMemoryState();
  const subscription = state.listingSubscriptions.find((item) => item.id === subscriptionId);
  if (!subscription) return;
  subscription.status = nextSubscriptionStatus;
  subscription.autoRenew = nextSubscriptionStatus === "pending_payment";
  if (nextSubscriptionStatus === "pending_payment") subscription.cancelledAt = undefined;
  subscription.updatedAt = now.toISOString();
  if (nextSubscriptionStatus === "expired") {
    const listing = state.database.listings.find((item) => item.id === subscription.listingId);
    if (listing) listing.status = "expired";
  }
}

function mapStripeSubscriptionStatus(status: string): ListingSubscriptionStatus | undefined {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "incomplete") return "past_due";
  if (status === "canceled" || status === "paused") return "cancelled";
  if (status === "incomplete_expired" || status === "unpaid") return "expired";
  return undefined;
}

async function activateListingSubscription(subscriptionId: string | undefined, paymentIntentId: string) {
  if (!subscriptionId) return;
  const now = new Date();

  if (hasDatabase) {
    const rows = await db.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, subscriptionId)).limit(1);
    const subscription = rows[0];
    if (!subscription) return;
    const plan = await fetchSubscriptionPlan(subscription.planId);
    if (!plan) return;
    const expiresAt = addMonths(now, plan.validityMonths);
    await db.update(listingSubscriptions).set({
      status: "active",
      source: "paid",
      autoRenew: true,
      startsAt: subscription.startsAt ?? now,
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
  const plan = await fetchSubscriptionPlan(subscription.planId);
  if (!plan) return;
  const expiresAt = addMonths(now, plan.validityMonths);
  subscription.status = "active";
  subscription.source = "paid";
  subscription.autoRenew = true;
  subscription.startsAt ??= now.toISOString();
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

async function extendListingSubscription(subscriptionId: string | undefined, paymentIntentId: string) {
  if (!subscriptionId) return;
  const now = new Date();

  if (hasDatabase) {
    const rows = await db.select().from(listingSubscriptions).where(eq(listingSubscriptions.id, subscriptionId)).limit(1);
    const subscription = rows[0];
    if (!subscription) return;
    const plan = await fetchSubscriptionPlan(subscription.planId);
    if (!plan) return;
    const baseDate = subscription.expiresAt && subscription.expiresAt > now ? subscription.expiresAt : now;
    const expiresAt = addMonths(baseDate, plan.validityMonths);
    await db.update(listingSubscriptions).set({
      status: "active",
      source: "paid",
      autoRenew: true,
      startsAt: subscription.startsAt ?? now,
      expiresAt,
      paymentIntentId,
      updatedAt: now
    }).where(eq(listingSubscriptions.id, subscriptionId));
    await db.update(listings).set({ status: "pending_review", moderationStatus: "queued", expiresAt, updatedAt: now }).where(eq(listings.id, subscription.listingId));
    return;
  }

  const state = await getMemoryState();
  const subscription = state.listingSubscriptions.find((item) => item.id === subscriptionId);
  if (!subscription) return;
  const plan = await fetchSubscriptionPlan(subscription.planId);
  if (!plan) return;
  const currentExpiresAt = subscription.expiresAt ? new Date(subscription.expiresAt) : undefined;
  const baseDate = currentExpiresAt && currentExpiresAt > now ? currentExpiresAt : now;
  const expiresAt = addMonths(baseDate, plan.validityMonths);
  subscription.status = "active";
  subscription.source = "paid";
  subscription.autoRenew = true;
  subscription.startsAt ??= now.toISOString();
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

async function getPaymentIntentByStripeSubscription(stripeSubscriptionId: string) {
  if (hasDatabase) {
    const rows = await db.select().from(paymentIntents).where(eq(paymentIntents.stripeSubscriptionId, stripeSubscriptionId)).limit(1);
    if (rows[0]) return toPaymentIntent(rows[0]);
    const legacyRows = await db.select().from(paymentIntents).where(eq(paymentIntents.gatewayReference, stripeSubscriptionId)).limit(1);
    return legacyRows[0] ? toPaymentIntent(legacyRows[0]) : undefined;
  }
  return (await getMemoryState()).paymentIntents.find((item) => item.stripeSubscriptionId === stripeSubscriptionId || item.gatewayReference === stripeSubscriptionId);
}

async function getPaymentIntentByStripeCheckoutSession(stripeCheckoutSessionId: string) {
  if (hasDatabase) {
    const rows = await db.select().from(paymentIntents).where(eq(paymentIntents.stripeCheckoutSessionId, stripeCheckoutSessionId)).limit(1);
    if (rows[0]) return toPaymentIntent(rows[0]);
    const legacyRows = await db.select().from(paymentIntents).where(eq(paymentIntents.gatewayReference, stripeCheckoutSessionId)).limit(1);
    return legacyRows[0] ? toPaymentIntent(legacyRows[0]) : undefined;
  }
  return (await getMemoryState()).paymentIntents.find((item) => item.stripeCheckoutSessionId === stripeCheckoutSessionId || item.gatewayReference === stripeCheckoutSessionId);
}

export async function isStripeCheckoutSessionForPaymentIntent(intent: PaymentIntent, stripeCheckoutSessionId: string) {
  if (intent.stripeCheckoutSessionId === stripeCheckoutSessionId || intent.gatewayReference === stripeCheckoutSessionId) return true;
  const sessionIntent = await getPaymentIntentByStripeCheckoutSession(stripeCheckoutSessionId);
  return sessionIntent?.id === intent.id;
}

async function getStripeSubscriptionIdForListingSubscription(userId: string, subscriptionId: string) {
  if (hasDatabase) {
    const subscriptions = await db.select().from(listingSubscriptions).where(and(eq(listingSubscriptions.id, subscriptionId), eq(listingSubscriptions.userId, userId))).limit(1);
    if (!subscriptions[0]) return undefined;
    if (subscriptions[0].stripeSubscriptionId) return subscriptions[0].stripeSubscriptionId;
    const rows = await db.select().from(paymentIntents).where(eq(paymentIntents.subscriptionId, subscriptionId)).orderBy(desc(paymentIntents.createdAt)).limit(1);
    return rows[0]?.stripeSubscriptionId ?? (rows[0]?.gatewayReference?.startsWith("sub_") ? rows[0].gatewayReference : undefined);
  }
  const state = await getMemoryState();
  const subscription = state.listingSubscriptions.find((item) => item.id === subscriptionId && item.userId === userId);
  if (!subscription) return undefined;
  const intent = state.paymentIntents.find((item) => item.subscriptionId === subscriptionId);
  return intent?.stripeSubscriptionId ?? (intent?.gatewayReference?.startsWith("sub_") ? intent.gatewayReference : undefined);
}

async function recordRenewalEventOnce(subscriptionId: string | undefined, eventId: string, paymentIntentId: string | undefined, status: string, notes: string) {
  if (!subscriptionId) return false;
  if (hasDatabase) {
    const existing = await db.select().from(renewalEvents).where(eq(renewalEvents.id, eventId)).limit(1);
    if (existing[0]) return false;
    await db.insert(renewalEvents).values({
      id: eventId,
      subscriptionId,
      paymentIntentId,
      status,
      gatewayReference: eventId,
      notes
    });
    return true;
  }
  if (processedMemoryRenewalEventIds.has(eventId)) return false;
  processedMemoryRenewalEventIds.add(eventId);
  return true;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function countListingPhotos(media: ListingMedia[] | unknown) {
  return Array.isArray(media) ? media.filter((item) => item?.kind === "photo").length : 0;
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
  const trial = buildUserTrial(row.trialStartedAt, row.trialEndsAt, row.trialTerminatedAt);
  return {
    id: row.id,
    firebaseUid: row.firebaseUid ?? undefined,
    name: row.name,
    phone: row.phone,
    address: row.address,
    email: row.email,
    role: row.role,
    locale: row.locale as User["locale"],
    status: row.status as User["status"],
    profileImageKey: row.profileImageKey ?? undefined,
    profileImageUrl: row.profileImageUrl ?? undefined,
    trialStartedAt: trial.startsAt,
    trialEndsAt: trial.endsAt,
    trialTerminatedAt: trial.terminatedAt,
    trial,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function normalizeOrderImageUrl(value?: string | null) {
  if (!value) return undefined;
  if (value.startsWith("mock-read://")) {
    return createSignedReadUrl(value.slice("mock-read://".length));
  }
  if (value.startsWith("users/") || value.startsWith("listing-checkout-sessions/")) {
    return createSignedReadUrl(value);
  }
  return value;
}

function normalizeListingMediaUrl(value?: string | null, fallbackKey?: string | null) {
  const mediaKey = normalizeBlobReadKey(value) ?? normalizeBlobReadKey(fallbackKey);
  return mediaKey ? createSignedReadUrl(mediaKey) : value ?? "";
}

async function withCardThumbnails(media: ListingMedia[]) {
  const result = [...media];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, result.length) }, async () => {
    while (cursor < result.length) {
      const index = cursor++;
      const item = result[index];
      if (item.kind !== "photo" || item.thumbnailKey) continue;
      try {
        result[index] = { ...item, ...await ensureListingCardThumbnail(item.id) };
      } catch (error) {
        console.warn(`Unable to create card thumbnail for ${item.id}`, error);
      }
    }
  }));
  return result;
}

function normalizeBlobReadKey(value?: string | null) {
  if (!value) return undefined;
  if (value.startsWith("mock-read://")) return value.slice("mock-read://".length);
  if (value.startsWith("users/") || value.startsWith("listing-checkout-sessions/")) return value;
  return undefined;
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

  const media = Array.isArray(row.media) ? row.media.map((m: any) => ({
    ...m,
    url: normalizeListingMediaUrl(m.url ?? m.id, m.id),
    thumbnailUrl: m.thumbnailKey ? normalizeListingMediaUrl(m.thumbnailKey, m.thumbnailKey) : m.thumbnailUrl
  })) : [];
  
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
    source: row.source,
    autoRenew: row.autoRenew,
    startsAt: row.startsAt?.toISOString(),
    expiresAt: row.expiresAt?.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString(),
    stripeStatus: row.stripeStatus ?? undefined,
    scheduledConversionAt: row.scheduledConversionAt?.toISOString(),
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    graceEndsAt: row.graceEndsAt?.toISOString(),
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
    gateway: row.gateway as PaymentIntent["gateway"],
    gatewayReference: row.gatewayReference ?? undefined,
    stripeCheckoutSessionId: row.stripeCheckoutSessionId ?? undefined,
    stripeSubscriptionId: row.stripeSubscriptionId ?? undefined,
    stripeCustomerId: row.stripeCustomerId ?? undefined,
    stripeInvoiceId: row.stripeInvoiceId ?? undefined,
    livemode: row.stripeLivemode ?? undefined,
    paymentUrl: row.paymentUrl ?? undefined,
    policyVersion: row.policyVersion,
    policyAcceptedAt: row.policyAcceptedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toBillingInvoice(row: typeof billingInvoices.$inferSelect): BillingInvoice {
  return {
    id: row.id,
    userId: row.userId,
    listingId: row.listingId,
    subscriptionId: row.subscriptionId ?? undefined,
    paymentAttemptId: row.paymentAttemptId ?? undefined,
    purpose: row.purpose,
    status: row.status,
    amountLkr: row.amountLkr,
    chargedAmountMinor: row.chargedAmountMinor,
    chargedCurrency: row.chargedCurrency,
    stripeInvoiceId: row.stripeInvoiceId,
    stripeCustomerId: row.stripeCustomerId ?? undefined,
    stripeSubscriptionId: row.stripeSubscriptionId ?? undefined,
    hostedInvoiceUrl: row.hostedInvoiceUrl ?? undefined,
    invoicePdfUrl: row.invoicePdfUrl ?? undefined,
    servicePeriodStart: row.servicePeriodStart?.toISOString(),
    servicePeriodEnd: row.servicePeriodEnd?.toISOString(),
    paidAt: row.paidAt?.toISOString(),
    failureCode: row.failureCode ?? undefined,
    failureMessage: row.failureMessage ?? undefined,
    livemode: row.livemode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function buildPaymentReceipt(intent: PaymentIntent, user: User, listing: Listing, subscription?: ListingSubscription, invoicePdfUrl?: string): PaymentReceipt {
  const lineItems: PaymentReceipt["lineItems"] = [
    {
      label: `${intent.quote.plan.name} listing subscription`,
      quantity: 1,
      amountLkr: intent.quote.basePriceLkr
    }
  ];

  if (intent.quote.extraPhotoCount > 0 && intent.quote.extraPhotoTotalLkr > 0) {
    lineItems.push({
      label: `${intent.quote.extraPhotoCount} extra ${intent.quote.extraPhotoCount === 1 ? "photo" : "photos"}`,
      quantity: intent.quote.extraPhotoCount,
      amountLkr: intent.quote.extraPhotoTotalLkr
    });
  }

  return {
    paymentIntentId: intent.id,
    receiptNumber: receiptNumberForPayment(intent),
    status: intent.status,
    paidAt: intent.updatedAt,
    customer: {
      name: user.name,
      email: user.email
    },
    listing: {
      id: listing.id,
      title: listing.title
    },
    subscription: {
      id: subscription?.id ?? intent.subscriptionId,
      planName: intent.quote.plan.name,
      startsAt: subscription?.startsAt,
      expiresAt: subscription?.expiresAt
    },
    currency: "LKR",
    lineItems,
    totalLkr: intent.amountLkr,
    stripe: {
      checkoutSessionId: intent.stripeCheckoutSessionId,
      subscriptionId: intent.stripeSubscriptionId,
      customerId: intent.stripeCustomerId,
      invoiceId: intent.stripeInvoiceId,
      invoicePdfUrl
    },
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt
  };
}

function receiptNumberForPayment(intent: PaymentIntent) {
  const date = new Date(intent.updatedAt || intent.createdAt).toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = intent.id.replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase() || "PAYMENT";
  return `RCP-${date}-${suffix}`;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}
