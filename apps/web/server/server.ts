import "./env.js";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ViteDevServer } from "vite";
import {
  getConversations,
  getGemTypes,
  getListing,
  getListings,
  getLiveListings,
  getLocations,
  getMarketplaceSnapshot,
  getModerationListings,
  getReports,
  getReportedListings,
  revealListingPhone,
  updateListingModeration,
  removeListing,
  resolveReport,
  createPromotionCampaign,
  updatePromotionCampaign,
  searchListings,
  getAllSellers,
  createReport,
  getUserReports,
  recordListingInteraction,
  updateListingStatus
} from "./marketplace-repository.js";
import { readBearerToken, verifyFirebaseIdToken, verifyAdminFirebaseIdToken } from "./auth.js";
import {
  createListingPaymentIntent,
  completeListingCheckoutSession,
  createListingCheckoutSession,
  createListing,
  createStorageUpload,
  cancelListingSubscription,
  cancelListingSubscriptionsForListing,
  confirmPaymentIntent,
  isStripeCheckoutSessionForPaymentIntent,
  markStripeSubscriptionPastDue,
  recordStripeSubscriptionInvoicePayment,
  syncStripeSubscriptionStatus,
  getAdminPaymentIntents,
  getAdminPaymentReceipt,
  getAdminPaymentReceiptPdf,
  getPaymentIntent,
  getPaymentReceipt,
  getPaymentReceiptPdf,
  getListingCheckoutSession,
  getListingSubscriptionPaymentIntent,
  getAdminOrders,
  getDashboard,
  getMyListings,
  getOrCreateUserFromClaims,
  getSettings,
  getUserProfile,
  updateOrderStatus,
  updateSettings,
  updateListingCheckoutDraft,
  updateListingCheckoutSession,
  updateUserProfile,
  DuplicatePhoneNumberError,
  getAllUsers,
  removeUserListing,
  updateUserListing
} from "./user-repository.js";
import { blobKeyFromLocalReadPath, localUploadPath, saveLocalUpload } from "./storage.js";
import { constructStripeWebhookEvent, retrieveStripeCheckoutSession } from "./stripe.js";
import { ensureDatabaseCompatibility, requireDatabase } from "./db/index.js";

const port = Number(process.env.PORT ?? 4100);
const host = process.env.HOST ?? "0.0.0.0";
const isProduction = process.env.NODE_ENV === "production";
const currentDir = fileURLToPath(new URL(".", import.meta.url));
const webRoot = isProduction ? resolve(currentDir, "../dist") : resolve(currentDir, "..");
const staticRoot = isProduction ? webRoot : resolve(webRoot, "dist");

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const publicPagePaths = [
  "/",
  "/contact-us",
  "/terms-and-conditions",
  "/privacy-policy",
  "/refund-policy"
];
const paymentIntentValidationErrors = new Set([
  "Select a valid listing subscription plan.",
  "Terms and Privacy Policy acceptance is required before payment.",
  "Listing not found.",
  "Payment collection is not configured."
]);

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,idempotency-key"
  });
  response.end(JSON.stringify(body));
}

function getPublicSiteUrl(request: IncomingMessage) {
  const configuredUrl = process.env.PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configuredUrl) return configuredUrl;

  const hostHeader = request.headers["x-forwarded-host"] ?? request.headers.host ?? "localhost";
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocolHeader = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const protocol = protocolHeader ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

function sendRobotsTxt(request: IncomingMessage, response: ServerResponse) {
  const siteUrl = getPublicSiteUrl(request);
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end(`User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`);
}

function sendSitemapXml(request: IncomingMessage, response: ServerResponse) {
  const siteUrl = getPublicSiteUrl(request);
  const today = new Date().toISOString().slice(0, 10);
  const urls = publicPagePaths.map((path) => `  <url>
    <loc>${escapeHtml(`${siteUrl}${path}`)}</loc>
    <lastmod>${today}</lastmod>
  </url>`).join("\n");

  response.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
  response.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}



async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

async function readRawBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function authenticateUser(request: IncomingMessage) {
  const token = readBearerToken(request);
  if (!token) return undefined;

  try {
    const claims = await verifyFirebaseIdToken(token, { allowDevelopmentFallback: !isProduction });
    return getOrCreateUserFromClaims(claims);
  } catch (error) {
    console.warn("User authentication failed:", error);
    return undefined;
  }
}

function parseObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringBody(value: unknown) {
  return typeof value === "string" ? value : "";
}

function idempotencyKey(request: IncomingMessage) {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0] : value;
  return typeof key === "string" && key.trim() ? key.trim().slice(0, 180) : undefined;
}

function stripePaymentReturnLocation(paymentIntentId: string, status: "succeeded" | "pending" | "cancelled" | "expired" | "failed") {
  if (status === "succeeded") return `/receipt?paymentIntentId=${encodeURIComponent(paymentIntentId)}`;
  return `/?payment=${status === "pending" ? "pending" : status}`;
}

function numberBody(value: unknown, fallback: number) {
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export async function handleApi(request: IncomingMessage, response: ServerResponse) {
  if (!request.url) {
    sendJson(response, 404, { error: "Not found" });
    return true;
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return true;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  const path = url.pathname;

  if (!path.startsWith("/api/v1")) return false;
  requireDatabase();
  await ensureDatabaseCompatibility();

  if (request.method === "POST" && path === "/api/v1/payments/stripe/webhook") {
    try {
      const event = constructStripeWebhookEvent(await readRawBody(request), request.headers["stripe-signature"]);
      await handleStripeWebhookEvent(event);
      sendJson(response, 200, { received: true });
    } catch (error) {
      console.warn("Stripe webhook handling failed:", error);
      sendJson(response, 400, { error: "Invalid payment notification" });
    }
    return true;
  }

  if (request.method === "PUT" && path === "/api/v1/storage/local-upload") {
    const blobKey = url.searchParams.get("key") ?? "";
    if (!blobKey.startsWith("users/") && !blobKey.startsWith("listing-checkout-sessions/")) {
      sendJson(response, 400, { error: "Invalid upload key" });
      return true;
    }
    await saveLocalUpload(blobKey, request);
    sendJson(response, 201, { ok: true });
    return true;
  }

  if (request.method === "POST" && path === "/api/v1/listing-checkout-sessions") {
    try {
      const body = parseObject(await readJsonBody(request).catch(() => ({})));
      sendJson(response, 201, await createListingCheckoutSession(body as any, getPublicSiteUrl(request)));
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to create checkout session." });
    }
    return true;
  }

  const listingCheckoutSessionMatch = path.match(/^\/api\/v1\/listing-checkout-sessions\/([^/]+)$/);
  if (request.method === "GET" && listingCheckoutSessionMatch) {
    const session = await getListingCheckoutSession(decodeURIComponent(listingCheckoutSessionMatch[1]));
    sendJson(response, session ? 200 : 404, session ?? { error: "Checkout session not found or expired." });
    return true;
  }

  if (request.method === "PATCH" && listingCheckoutSessionMatch) {
    try {
      const session = await updateListingCheckoutSession(decodeURIComponent(listingCheckoutSessionMatch[1]), parseObject(await readJsonBody(request).catch(() => ({}))));
      sendJson(response, session ? 200 : 404, session ?? { error: "Checkout session not found or expired." });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to update checkout session." });
    }
    return true;
  }

  const listingCheckoutDraftMatch = path.match(/^\/api\/v1\/listing-checkout-sessions\/([^/]+)\/draft$/);
  if (request.method === "PUT" && listingCheckoutDraftMatch) {
    try {
      const result = await updateListingCheckoutDraft(
        decodeURIComponent(listingCheckoutDraftMatch[1]),
        parseObject(await readJsonBody(request).catch(() => ({}))) as any,
        getPublicSiteUrl(request)
      );
      sendJson(response, result ? 200 : 404, result ?? { error: "Checkout session not found or expired." });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to update checkout draft." });
    }
    return true;
  }

  const listingCheckoutCompleteMatch = path.match(/^\/api\/v1\/listing-checkout-sessions\/([^/]+)\/complete$/);
  if (request.method === "POST" && listingCheckoutCompleteMatch) {
    const user = await authenticateUser(request);
    if (!user) {
      sendJson(response, 401, { error: "User authorization required" });
      return true;
    }
    try {
      const intent = await completeListingCheckoutSession(
        user.id,
        decodeURIComponent(listingCheckoutCompleteMatch[1]),
        parseObject(await readJsonBody(request).catch(() => ({}))),
        idempotencyKey(request)
      );
      sendJson(response, intent ? 201 : 404, intent ?? { error: "Checkout session not found or expired." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start checkout right now. Please try again in a moment.";
      if (paymentIntentValidationErrors.has(message) || message.includes("Checkout session")) {
        sendJson(response, 400, { error: message });
      } else {
        console.error("Unable to complete listing checkout session", error);
        sendJson(response, 500, { error: "Unable to start checkout right now. Please try again in a moment." });
      }
    }
    return true;
  }

  if (path.startsWith("/api/v1/admin/")) {
    const token = readBearerToken(request);
    let admin: { email: string, role: "admin" } | undefined;
    if (token) {
      try {
        admin = await verifyAdminFirebaseIdToken(token);
      } catch (error) {
        console.warn("Admin authentication failed:", error);
      }
    }
    if (!admin) {
      sendJson(response, 401, { error: "Admin authorization required" });
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/admin/auth/me") {
      sendJson(response, 200, admin);
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/admin/moderation/listings") {
      sendJson(response, 200, await getModerationListings());
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/admin/users") {
      sendJson(response, 200, await getAllUsers());
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/admin/sellers") {
      sendJson(response, 200, await getAllSellers());
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/admin/reports") {
      sendJson(response, 200, await getReports());
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/admin/reports/listings") {
      sendJson(response, 200, await getReportedListings());
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/admin/orders") {
      sendJson(response, 200, await getAdminOrders());
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/admin/payments") {
      sendJson(response, 200, await getAdminPaymentIntents());
      return true;
    }

    const adminPaymentReceiptMatch = path.match(/^\/api\/v1\/admin\/payment-intents\/([^/]+)\/receipt$/);
    if (request.method === "GET" && adminPaymentReceiptMatch) {
      const receipt = await getAdminPaymentReceipt(adminPaymentReceiptMatch[1]);
      sendJson(response, receipt ? 200 : 404, receipt ?? { error: "Payment receipt not found" });
      return true;
    }

    const adminPaymentReceiptPdfMatch = path.match(/^\/api\/v1\/admin\/payment-intents\/([^/]+)\/receipt-pdf$/);
    if (request.method === "GET" && adminPaymentReceiptPdfMatch) {
      const receiptPdf = await getAdminPaymentReceiptPdf(adminPaymentReceiptPdfMatch[1]);
      if (!receiptPdf) {
        sendJson(response, 404, { error: "Receipt PDF not found. Verify your Stripe API key matches the payment environment (Live vs Test)." });
        return true;
      }

      response.writeHead(200, {
        "content-type": receiptPdf.contentType,
        "content-length": receiptPdf.data.byteLength,
        "content-disposition": `inline; filename="${receiptPdf.fileName.replace(/"/g, "")}"`,
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "authorization,content-type"
      });
      response.end(receiptPdf.data);
      return true;
    }

    const adminOrderStatusMatch = path.match(/^\/api\/v1\/admin\/orders\/([^/]+)\/status$/);
    if (request.method === "PATCH" && adminOrderStatusMatch) {
      const body = parseObject(await readJsonBody(request).catch(() => ({})));
      const status = typeof body.status === "string" ? body.status : "";
      try {
        const order = await updateOrderStatus(adminOrderStatusMatch[1], status as any);
        sendJson(response, order ? 200 : 404, order ?? { error: "Order not found" });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid order status" });
      }
      return true;
    }

    const adminReportMatch = path.match(/^\/api\/v1\/admin\/reports\/([^/]+)$/);
    if (request.method === "PATCH" && adminReportMatch) {
      const report = await resolveReport(adminReportMatch[1]);
      sendJson(response, report ? 200 : 404, report ?? { error: "Report not found" });
      return true;
    }

    const moderationDecisionMatch = path.match(/^\/api\/v1\/admin\/moderation\/listings\/([^/]+)$/);
    if (request.method === "PATCH" && moderationDecisionMatch) {
      const body = parseObject(await readJsonBody(request).catch(() => ({})));
      const decision = body.decision === "reject" ? "reject" : body.decision === "approve" ? "approve" : undefined;
      const reason = typeof body.reason === "string" ? body.reason : undefined;
      if (!decision) {
        sendJson(response, 400, { error: "decision must be approve or reject" });
        return true;
      }
      const listing = await updateListingModeration(moderationDecisionMatch[1], decision, reason);
      if (listing && decision === "reject") {
        await cancelListingSubscriptionsForListing(listing.id);
      }
      sendJson(response, listing ? 200 : 404, listing ?? { error: "Listing not found" });
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/admin/listings") {
      sendJson(response, 200, await getLiveListings());
      return true;
    }

    const adminListingMatch = path.match(/^\/api\/v1\/admin\/listings\/([^/]+)$/);
    if (request.method === "DELETE" && adminListingMatch) {
      const listing = await removeListing(adminListingMatch[1]);
      sendJson(response, listing ? 200 : 404, listing ?? { error: "Listing not found" });
      return true;
    }

    const adminListingStatusMatch = path.match(/^\/api\/v1\/admin\/listings\/([^/]+)\/status$/);
    if (request.method === "PATCH" && adminListingStatusMatch) {
      const body = parseObject(await readJsonBody(request).catch(() => ({}))) as any;
      if (body.status !== "live" && body.status !== "paused") {
        sendJson(response, 400, { error: "Invalid status" });
        return true;
      }
      const listing = await updateListingStatus(adminListingStatusMatch[1], body.status);
      sendJson(response, listing ? 200 : 404, listing ?? { error: "Listing not found" });
      return true;
    }

    const createCampaignMatch = path.match(/^\/api\/v1\/admin\/listings\/([^/]+)\/campaigns$/);
    if (request.method === "POST" && createCampaignMatch) {
      const body = parseObject(await readJsonBody(request).catch(() => ({}))) as any;
      if (!body.type || !body.startsAt || !body.endsAt) {
        sendJson(response, 400, { error: "type, startsAt, and endsAt are required" });
        return true;
      }
      const campaign = {
        id: crypto.randomUUID(),
        type: body.type,
        status: "active" as const,
        startsAt: body.startsAt,
        endsAt: body.endsAt
      };
      const listing = await createPromotionCampaign(createCampaignMatch[1], campaign);
      sendJson(response, listing ? 201 : 404, listing ?? { error: "Listing not found" });
      return true;
    }

    const updateCampaignMatch = path.match(/^\/api\/v1\/admin\/listings\/([^/]+)\/campaigns\/([^/]+)$/);
    if (request.method === "PATCH" && updateCampaignMatch) {
      const body = parseObject(await readJsonBody(request).catch(() => ({}))) as any;
      const listing = await updatePromotionCampaign(updateCampaignMatch[1], updateCampaignMatch[2], body);
      sendJson(response, listing ? 200 : 404, listing ?? { error: "Listing or campaign not found" });
      return true;
    }
  }

  const stripePaymentReturnMatch = path.match(/^\/api\/v1\/payments\/stripe\/([^/]+)\/return$/);
  if (request.method === "GET" && stripePaymentReturnMatch) {
    const intent = await getPaymentIntent(stripePaymentReturnMatch[1]);
    const sessionId = url.searchParams.get("session_id") ?? "";
    if (!intent || intent.gateway !== "stripe" || !sessionId || !(await isStripeCheckoutSessionForPaymentIntent(intent, sessionId))) {
      sendJson(response, 400, { error: "Invalid payment return" });
      return true;
    }

    try {
      const checkoutSession = await retrieveStripeCheckoutSession(sessionId);
      const confirmed = await confirmPaymentIntent(intent.id, checkoutSession.status, checkoutSession.reference, checkoutSession);
      const location = stripePaymentReturnLocation(intent.id, confirmed?.status ?? checkoutSession.status);
      response.writeHead(302, { location });
      response.end();
    } catch (error) {
      console.warn("Stripe checkout verification failed:", error);
      const confirmed = await confirmPaymentIntent(intent.id, "failed", sessionId, { stripeCheckoutSessionId: sessionId });
      response.writeHead(302, { location: stripePaymentReturnLocation(intent.id, confirmed?.status ?? "failed") });
      response.end();
    }
    return true;
  }

  const stripePaymentCancelMatch = path.match(/^\/api\/v1\/payments\/stripe\/([^/]+)\/cancel$/);
  if (request.method === "GET" && stripePaymentCancelMatch) {
    await confirmPaymentIntent(stripePaymentCancelMatch[1], "cancelled", undefined);
    response.writeHead(302, { location: "/?payment=cancelled" });
    response.end();
    return true;
  }

  if (path.startsWith("/api/v1/cart") || path.startsWith("/api/v1/checkout")) {
    sendJson(response, 410, { error: "Gem purchasing is not available on gemslanka.lk. The platform supports listing subscriptions only." });
    return true;
  }

  if (path.startsWith("/api/v1/users") || path.startsWith("/api/v1/orders") || path.startsWith("/api/v1/storage") || path.startsWith("/api/v1/listing-subscriptions")) {
    const user = await authenticateUser(request);
    if (!user) {
      sendJson(response, 401, { error: "User authorization required" });
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/users/me") {
      sendJson(response, 200, await getUserProfile(user.id));
      return true;
    }

    if (request.method === "PATCH" && path === "/api/v1/users/me") {
      const body = await readJsonBody(request).catch(() => ({}));
      try {
        sendJson(response, 200, await updateUserProfile(user.id, parseObject(body)));
      } catch (error) {
        if (error instanceof DuplicatePhoneNumberError) {
          sendJson(response, 409, { error: error.message });
        } else {
          throw error;
        }
      }
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/users/me/settings") {
      sendJson(response, 200, await getSettings(user.id));
      return true;
    }

    if (request.method === "PATCH" && path === "/api/v1/users/me/settings") {
      const body = await readJsonBody(request).catch(() => ({}));
      sendJson(response, 200, await updateSettings(user.id, parseObject(body)));
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/users/me/dashboard") {
      sendJson(response, 200, await getDashboard(user.id));
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/users/me/listings") {
      const page = Number(url.searchParams.get("page")) || 1;
      const limit = Number(url.searchParams.get("limit")) || 10;
      const search = url.searchParams.get("search") || "";
      sendJson(response, 200, await getMyListings(user.id, search, page, limit));
      return true;
    }

    const paymentReceiptMatch = path.match(/^\/api\/v1\/users\/me\/payment-intents\/([^/]+)\/receipt$/);
    if (request.method === "GET" && paymentReceiptMatch) {
      const receipt = await getPaymentReceipt(user.id, paymentReceiptMatch[1]);
      sendJson(response, receipt ? 200 : 404, receipt ?? { error: "Payment receipt not found" });
      return true;
    }

    const paymentReceiptPdfMatch = path.match(/^\/api\/v1\/users\/me\/payment-intents\/([^/]+)\/receipt-pdf$/);
    if (request.method === "GET" && paymentReceiptPdfMatch) {
      const receiptPdf = await getPaymentReceiptPdf(user.id, paymentReceiptPdfMatch[1]);
      if (!receiptPdf) {
        sendJson(response, 404, { error: "Receipt PDF not found. Verify your Stripe API key matches the payment environment (Live vs Test)." });
        return true;
      }

      response.writeHead(200, {
        "content-type": receiptPdf.contentType,
        "content-length": receiptPdf.data.byteLength,
        "content-disposition": `attachment; filename="${receiptPdf.fileName.replace(/"/g, "")}"`,
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "authorization,content-type"
      });
      response.end(receiptPdf.data);
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/users/me/reports") {
      sendJson(response, 200, await getUserReports(user.id));
      return true;
    }

    const subscriptionPaymentMatch = path.match(/^\/api\/v1\/listing-subscriptions\/([^/]+)\/payment-intent$/);
    if (request.method === "GET" && subscriptionPaymentMatch) {
      const intent = await getListingSubscriptionPaymentIntent(user.id, subscriptionPaymentMatch[1]);
      sendJson(response, intent ? 200 : 404, intent ?? { error: "Payment intent not found" });
      return true;
    }

    const cancelSubscriptionMatch = path.match(/^\/api\/v1\/listing-subscriptions\/([^/]+)\/cancel$/);
    if (request.method === "PATCH" && cancelSubscriptionMatch) {
      const subscription = await cancelListingSubscription(user.id, cancelSubscriptionMatch[1]);
      sendJson(response, subscription ? 200 : 404, subscription ?? { error: "Subscription not found" });
      return true;
    }

    const myListingMatch = path.match(/^\/api\/v1\/users\/me\/listings\/([^/]+)$/);
    if (myListingMatch && request.method === "DELETE") {
      const listing = await removeUserListing(user.id, myListingMatch[1]);
      sendJson(response, listing ? 200 : 404, listing ?? { error: "Listing not found" });
      return true;
    }

    if (myListingMatch && request.method === "PATCH") {
      const body = parseObject(await readJsonBody(request).catch(() => ({})));
      const listing = await updateUserListing(user.id, myListingMatch[1], body);
      sendJson(response, listing ? 200 : 404, listing ?? { error: "Listing not found" });
      return true;
    }

    if (request.method === "POST" && path === "/api/v1/storage/uploads") {
      const body = await readJsonBody(request).catch(() => ({}));
      const uploadRequest = parseObject(body);
      const scope = uploadRequest.scope;
      const fileName = stringBody(uploadRequest.fileName);
      const contentType = stringBody(uploadRequest.contentType);
      const listingId = typeof uploadRequest.listingId === "string" ? uploadRequest.listingId : undefined;
      if ((scope !== "profile" && scope !== "listing-media" && scope !== "listing-certificate") || !fileName || !contentType) {
        sendJson(response, 400, { error: "scope, fileName, and contentType are required" });
        return true;
      }
      if ((scope === "listing-media" || scope === "listing-certificate") && !listingId) {
        sendJson(response, 400, { error: "listingId is required for listing uploads" });
        return true;
      }
      sendJson(response, 201, await createStorageUpload(user.id, { scope, fileName, contentType, listingId }));
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/orders") {
      sendJson(response, 200, []);
      return true;
    }

  }

  if (request.method === "GET" && path === "/api/v1/snapshot") {
    sendJson(response, 200, await getMarketplaceSnapshot());
    return true;
  }

  if (request.method === "GET" && path === "/api/v1/gem-types") {
    sendJson(response, 200, await getGemTypes());
    return true;
  }

  if (request.method === "GET" && path === "/api/v1/locations") {
    sendJson(response, 200, await getLocations());
    return true;
  }

  if (request.method === "GET" && path === "/api/v1/listings") {
    const gemType = url.searchParams.get("gemType") ?? "";
    const location = url.searchParams.get("location") ?? "";
    sendJson(response, 200, await getListings({ gemType, location }));
    return true;
  }

  if (request.method === "GET" && path === "/api/v1/search/listings") {
    const query = url.searchParams.get("query") ?? undefined;
    const gemType = url.searchParams.get("gemType") ?? undefined;
    const location = url.searchParams.get("location") ?? undefined;
    const treatment = url.searchParams.get("treatment") ?? undefined;
    const certificate = url.searchParams.get("certificate") ?? undefined;
    const sort = url.searchParams.get("sort") ?? undefined;
    const page = url.searchParams.has("page") ? parseInt(url.searchParams.get("page")!, 10) : undefined;
    const limit = url.searchParams.has("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined;

    sendJson(response, 200, await searchListings({
      query,
      gemType,
      location,
      treatment,
      certificate,
      sort,
      page,
      limit
    }));
    return true;
  }

  const listingMatch = path.match(/^\/api\/v1\/listings\/([^/]+)$/);
  if (request.method === "GET" && listingMatch) {
    const listing = await getListing(listingMatch[1]);
    const publicListing = listing?.moderationStatus === "approved" && (!listing.expiresAt || listing.expiresAt > new Date().toISOString()) ? listing : undefined;
    sendJson(response, publicListing ? 200 : 404, publicListing ?? { error: "Listing not found" });
    return true;
  }

  const revealMatch = path.match(/^\/api\/v1\/listings\/([^/]+)\/reveal-phone$/);
  if (request.method === "POST" && revealMatch) {
    const listing = await getListing(revealMatch[1]);
    if (!listing || listing.moderationStatus !== "approved" || (listing.expiresAt && listing.expiresAt <= new Date().toISOString())) {
      sendJson(response, 404, { error: "Listing not found" });
      return true;
    }
    const fullReveal = url.searchParams.get("full") === "1";
    if (fullReveal) {
      const user = await authenticateUser(request);
      if (!user) {
        sendJson(response, 401, { error: "User authorization required" });
        return true;
      }
    }
    sendJson(response, 200, await revealListingPhone(revealMatch[1], { full: fullReveal }));
    return true;
  }

  const reportMatch = path.match(/^\/api\/v1\/listings\/([^/]+)\/report$/);
  if (request.method === "POST" && reportMatch) {
    const user = await authenticateUser(request);
    if (!user) {
      sendJson(response, 401, { error: "User authorization required" });
      return true;
    }
    const body = parseObject(await readJsonBody(request).catch(() => ({})));
    const reason = stringBody(body.reason);
    const notes = stringBody(body.notes);
    if (!reason) {
      sendJson(response, 400, { error: "reason is required" });
      return true;
    }
    await createReport(user.id, reportMatch[1], reason, notes);
    sendJson(response, 201, { ok: true });
    return true;
  }

  const interactionsMatch = path.match(/^\/api\/v1\/listings\/([^/]+)\/interactions$/);
  if (request.method === "POST" && interactionsMatch) {
    const body = parseObject(await readJsonBody(request).catch(() => ({})));
    const type = stringBody(body.type);
    if (type !== "view" && type !== "whatsapp_click") {
      sendJson(response, 400, { error: "Invalid interaction type" });
      return true;
    }
    await recordListingInteraction(interactionsMatch[1], type);
    sendJson(response, 201, { ok: true });
    return true;
  }

  if (request.method === "POST" && path === "/api/v1/listings") {
    const user = await authenticateUser(request);
    if (!user) {
      sendJson(response, 401, { error: "User authorization required" });
      return true;
    }
    const body = await readJsonBody(request).catch(() => ({}));
    sendJson(response, 201, await createListing(user.id, parseObject(body), idempotencyKey(request)));
    return true;
  }

  const listingPaymentMatch = path.match(/^\/api\/v1\/listings\/([^/]+)\/payment-intents$/);
  if (request.method === "POST" && listingPaymentMatch) {
    const user = await authenticateUser(request);
    if (!user) {
      sendJson(response, 401, { error: "User authorization required" });
      return true;
    }
    const body = parseObject(await readJsonBody(request).catch(() => ({})));
    try {
      const intent = await createListingPaymentIntent(user.id, listingPaymentMatch[1], {
        planId: stringBody(body.planId),
        photoCount: numberBody(body.photoCount, 0),
        acceptedPolicies: body.acceptedPolicies === true
      }, idempotencyKey(request));
      sendJson(response, 201, intent);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (paymentIntentValidationErrors.has(message)) {
        sendJson(response, 400, { error: message });
      } else {
        console.error("Unable to create listing payment intent", error);
        sendJson(response, 500, { error: "Unable to start checkout right now. Please try again in a moment." });
      }
    }
    return true;
  }

  if (request.method === "GET" && path === "/api/v1/conversations") {
    sendJson(response, 200, await getConversations());
    return true;
  }

  sendJson(response, 404, { error: "Not found" });
  return true;
}

async function handleStripeWebhookEvent(event: ReturnType<typeof constructStripeWebhookEvent>) {
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    const session = event.data.object as any;
    const paymentIntentId = stripeCheckoutPaymentIntentId(session);
    const stripeSubscriptionId = stripeId(session.subscription);
    const status =
      event.type === "checkout.session.expired" ? "expired" :
      event.type === "checkout.session.async_payment_failed" ? "failed" :
      event.type === "checkout.session.async_payment_succeeded" || session.payment_status === "paid" ? "succeeded" :
      "pending";
    if (paymentIntentId) {
      await confirmPaymentIntent(paymentIntentId, status, stripeSubscriptionId ?? session.id, {
        stripeCheckoutSessionId: session.id,
        stripeSubscriptionId,
        stripeCustomerId: stripeId(session.customer),
        stripeInvoiceId: stripeId(session.invoice)
      });
    }
    return;
  }

  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
    const invoice = event.data.object as any;
    const stripeSubscriptionId = stripeInvoiceSubscriptionId(invoice);
    const paymentIntentId = stripeId(invoice.payment_intent);
    const internalPaymentIntentId = stripeInvoicePaymentIntentId(invoice);
    if (internalPaymentIntentId && stripeSubscriptionId && invoice.billing_reason === "subscription_create") {
      await confirmPaymentIntent(internalPaymentIntentId, "succeeded", stripeSubscriptionId, {
        stripeSubscriptionId,
        stripeCustomerId: stripeId(invoice.customer),
        stripeInvoiceId: invoice.id
      });
    }
    if (stripeSubscriptionId && invoice.id) {
      await recordStripeSubscriptionInvoicePayment({
        stripeSubscriptionId,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: paymentIntentId,
        billingReason: typeof invoice.billing_reason === "string" ? invoice.billing_reason : undefined
      });
    }
    return;
  }

  if (
    event.type === "invoice.payment_failed" ||
    event.type === "invoice.payment_action_required" ||
    event.type === "invoice.finalization_failed"
  ) {
    const invoice = event.data.object as any;
    const stripeSubscriptionId = stripeInvoiceSubscriptionId(invoice);
    const internalPaymentIntentId = stripeInvoicePaymentIntentId(invoice);
    if (internalPaymentIntentId && stripeSubscriptionId && invoice.billing_reason === "subscription_create") {
      await confirmPaymentIntent(
        internalPaymentIntentId,
        event.type === "invoice.payment_action_required" ? "pending" : "failed",
        stripeSubscriptionId,
        {
          stripeSubscriptionId,
          stripeCustomerId: stripeId(invoice.customer),
          stripeInvoiceId: invoice.id
        }
      );
    }
    if (stripeSubscriptionId && invoice.id) {
      await markStripeSubscriptionPastDue(
        stripeSubscriptionId,
        invoice.id,
        event.type,
        event.type === "invoice.payment_action_required"
          ? "Subscription invoice requires customer action."
          : event.type === "invoice.finalization_failed"
            ? "Subscription invoice finalization failed."
            : "Subscription invoice payment failed."
      );
    }
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as any;
    if (subscription.id) {
      await syncStripeSubscriptionStatus({
        stripeSubscriptionId: subscription.id,
        status: typeof subscription.status === "string" ? subscription.status : event.type === "customer.subscription.deleted" ? "canceled" : "",
        cancelAtPeriodEnd: typeof subscription.cancel_at_period_end === "boolean" ? subscription.cancel_at_period_end : undefined,
        currentPeriodEnd: stripeDate(subscription.current_period_end)
      });
    }
  }
}

function stripeCheckoutPaymentIntentId(session: any) {
  return typeof session.metadata?.paymentIntentId === "string" ? session.metadata.paymentIntentId : typeof session.client_reference_id === "string" ? session.client_reference_id : "";
}

function stripeInvoicePaymentIntentId(invoice: any) {
  return typeof invoice.subscription_details?.metadata?.paymentIntentId === "string"
    ? invoice.subscription_details.metadata.paymentIntentId
    : typeof invoice.metadata?.paymentIntentId === "string"
      ? invoice.metadata.paymentIntentId
      : "";
}

function stripeInvoiceSubscriptionId(invoice: any) {
  return stripeId(invoice.subscription) ?? stripeId(invoice.parent?.subscription_details?.subscription);
}

function stripeDate(value: unknown) {
  return typeof value === "number" ? new Date(value * 1000) : undefined;
}

function stripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return undefined;
}

function sendStaticFile(response: ServerResponse, filePath: string) {
  const extension = extname(filePath);
  response.writeHead(200, {
    "content-type": mimeTypes[extension] ?? "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}

async function handleLocalUploadStatic(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const blobKey = blobKeyFromLocalReadPath(url.pathname);
  if (!blobKey) return false;

  try {
    const uploadPath = localUploadPath(blobKey);
    if (existsSync(uploadPath) && statSync(uploadPath).isFile()) {
      sendStaticFile(response, uploadPath);
      return true;
    }
  } catch {}

  sendJson(response, 404, { error: "Upload not found" });
  return true;
}

async function handleStatic(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const requestedPath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(staticRoot, requestedPath);
  const relativePath = relative(staticRoot, candidate);
  const isSafePath = relativePath === "" || (!relativePath.startsWith("..") && !resolve(candidate).startsWith(".."));

  if (isSafePath && existsSync(candidate) && statSync(candidate).isFile()) {
    sendStaticFile(response, candidate);
    return;
  }

  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    const adminPath = join(staticRoot, "admin.html");
    if (existsSync(adminPath)) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(await readFile(adminPath, "utf8"));
      return;
    }
  }

  const indexPath = join(staticRoot, "index.html");
  if (existsSync(indexPath)) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(await readFile(indexPath, "utf8"));
    return;
  }

  sendJson(response, 404, { error: "Web build not found. Run npm run build first." });
}

async function main() {
  await ensureDatabaseCompatibility({ force: true });
  let vite: ViteDevServer | undefined;
  const server = createServer((request, response) => {
    void handleRequest(request, response, vite);
  });

  if (!isProduction) {
    vite = await import("vite").then((module) =>
      module.createServer({
        root: webRoot,
        server: {
          middlewareMode: true,
          hmr: { server },
          watch: {
            ignored: ["**/server/**", "**/server-dist/**"]
          }
        },
        appType: "spa"
      })
    );
  }

  server.listen(port, host, () => {
    console.log(`Gems monolith listening on http://${host}:${port}`);
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, vite: ViteDevServer | undefined) {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/robots.txt") {
      sendRobotsTxt(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/sitemap.xml") {
      sendSitemapXml(request, response);
      return;
    }

    if (await handleApi(request, response)) return;
    if (await handleLocalUploadStatic(request, response)) return;

    if (vite) {
      vite.middlewares(request, response, () => {
        sendJson(response, 404, { error: "Not found" });
      });
      return;
    }

    await handleStatic(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
}

if (!process.env.VERCEL) {
  void main();
}
