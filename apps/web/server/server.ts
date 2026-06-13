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
  getUserReports
} from "./marketplace-repository.js";
import { readBearerToken, verifyFirebaseIdToken, verifyAdminFirebaseIdToken } from "./auth.js";
import {
  addWishlistItem,
  createListingPaymentIntent,
  createListing,
  createStorageUpload,
  cancelListingSubscription,
  confirmPaymentIntent,
  getAdminPaymentIntents,
  getAdminOrders,
  getDashboard,
  getOrCreateUserFromClaims,
  getSettings,
  getUserProfile,
  getWishlist,
  removeWishlistItem,
  updateOrderStatus,
  updateSettings,
  updateUserProfile,
  getAllUsers,
  removeUserListing,
  updateUserListing
} from "./user-repository.js";
import { blobKeyFromLocalReadPath, localUploadPath, saveLocalUpload } from "./storage.js";
import { verifyPaymentSignature } from "./webxpay.js";

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
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const policyPages: Record<string, { title: string; effective: string; lede?: string; body: string[] }> = {
  "/contact-us": {
    title: "Contact Us",
    effective: "Merchant details updated June 11, 2026",
    lede: "Merchant and licence details for gemslanka.lk.",
    body: [
      "Merchant name: KRISTIANA MAGRET GEM & JEWELLARY.",
      "Email: info@gemslanka.lk.",
      "Contact address: No 31/34 Grandpass Road, Colombo 14, Sri Lanka.",
      "Licence number: 20266DL39394."
    ]
  },
  "/terms-and-conditions": {
    title: "Terms and Conditions",
    effective: "Effective June 11, 2026",
    body: [
      "gemslanka.lk provides listing publication, seller visibility, contact tools, and moderation workflows only. We do not sell, buy, broker, inspect, transport, insure, or guarantee gemstones.",
      "Any selling, purchasing, negotiation, inspection, payment, delivery, refund, or dispute between buyers and sellers happens outside gemslanka.lk. Users are responsible for their own due diligence before any transaction.",
      "Each listing uses its own subscription plan. Basic is valid for 1 month, Pro for 2 months, and Plus for 3 months. Subscriptions automatically renew unless cancelled before the next renewal. Expired or unpaid listings become inactive and are removed from public browsing until renewed.",
      "All listing subscriptions, renewals, and extra-photo fees are non-refundable, including rejected listings, cancelled renewals, expired listings, duplicate submissions, or seller withdrawal.",
      "We may reject, remove, expire, or suspend listings and accounts that violate these terms, create marketplace risk, or misuse the service."
    ]
  },
  "/privacy-policy": {
    title: "Privacy Policy",
    effective: "Effective June 11, 2026",
    body: [
      "gemslanka.lk collects account details, seller profile data, listing details, uploaded media, verification context, reports, support messages, device data, and activity needed to operate the listing service.",
      "Webxpay processes payment details. gemslanka.lk stores payment references, amount, currency, status, listing, subscription plan, policy acceptance version, and timestamps, but does not store card credentials.",
      "We use cookies or local storage for authentication, saved preferences, theme settings, and essential app behavior.",
      "We keep records while an account, listing, payment, moderation, legal, or security need remains. We use reasonable safeguards, but no internet service can guarantee absolute security.",
      "Users can update account information, cancel listing auto-renewal, request support, and ask about personal data associated with their account."
    ]
  },
  "/refund-policy": {
    title: "Refund Policy",
    effective: "Effective June 11, 2026",
    body: [
      "No refunds. gemslanka.lk listing subscriptions, renewals, and extra-photo fees are non-refundable.",
      "This no-refund policy applies to rejected listings, cancelled renewals, expired listings, duplicate submissions, seller withdrawal, and any buyer/seller transaction outcome outside the platform.",
      "Cancelling auto-renewal stops future renewal charges only. It does not refund the current listing validity period or any previously paid fees."
    ]
  }
};

const publicPagePaths = ["/", ...Object.keys(policyPages)];

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type"
  });
  response.end(JSON.stringify(body));
}

function sendPolicyPage(response: ServerResponse, page: typeof policyPages[string]) {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)} | gemslanka.lk</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #111827; background: #f8fafc; line-height: 1.65; }
    main { max-width: 860px; margin: 0 auto; padding: 48px 20px; }
    h1 { margin: 0 0 8px; font-size: clamp(2rem, 5vw, 3rem); line-height: 1.05; }
    .effective { margin: 0 0 28px; color: #5f6f6d; font-size: 1.1rem; }
    section { display: grid; gap: 16px; padding: 28px; background: #fff; border: 1px solid #d9e1df; border-radius: 12px; }
    p { margin: 0; font-size: 1rem; }
    nav { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 28px; }
    a { color: #08715c; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(page.title)}</h1>
    <p class="effective">${escapeHtml(page.lede ?? `${page.effective}. These policies apply to gemslanka.lk listing services.`)}</p>
    <section>${page.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</section>
    <nav aria-label="Legal pages">
      <a href="/contact-us">Contact Us</a>
      <a href="/terms-and-conditions">Terms and Conditions</a>
      <a href="/privacy-policy">Privacy Policy</a>
      <a href="/refund-policy">Refund Policy</a>
    </nav>
  </main>
</body>
</html>`);
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

  if (request.method === "PUT" && path === "/api/v1/storage/local-upload") {
    const blobKey = url.searchParams.get("key") ?? "";
    if (!blobKey.startsWith("users/")) {
      sendJson(response, 400, { error: "Invalid upload key" });
      return true;
    }
    await saveLocalUpload(blobKey, request);
    sendJson(response, 201, { ok: true });
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

  const paymentReturnMatch = path.match(/^\/api\/v1\/payments\/([^/]+)\/return$/);
  if (request.method === "GET" && paymentReturnMatch) {
    const status = url.searchParams.get("status") === "succeeded" ? "succeeded" : "failed";
    const signature = url.searchParams.get("signature");
    if (!verifyPaymentSignature(paymentReturnMatch[1], status, signature)) {
      sendJson(response, 400, { error: "Invalid payment signature" });
      return true;
    }
    await confirmPaymentIntent(paymentReturnMatch[1], status, url.searchParams.get("reference") ?? undefined);
    response.writeHead(302, { location: "/?payment=success" });
    response.end();
    return true;
  }

  const paymentCancelMatch = path.match(/^\/api\/v1\/payments\/([^/]+)\/cancel$/);
  if (request.method === "GET" && paymentCancelMatch) {
    await confirmPaymentIntent(paymentCancelMatch[1], "cancelled");
    response.writeHead(302, { location: "/?payment=cancelled" });
    response.end();
    return true;
  }

  if (request.method === "POST" && path === "/api/v1/payments/webxpay/callback") {
    const body = parseObject(await readJsonBody(request).catch(() => ({})));
    const intentId = stringBody(body.order_id || body.intent_id || body.payment_id);
    const status = stringBody(body.status).toLowerCase() === "succeeded" || stringBody(body.status).toLowerCase() === "success" ? "succeeded" : "failed";
    const signature = stringBody(body.signature);
    if (!intentId || !verifyPaymentSignature(intentId, status, signature)) {
      sendJson(response, 400, { error: "Invalid payment callback" });
      return true;
    }
    const intent = await confirmPaymentIntent(intentId, status, stringBody(body.reference || body.transaction_id) || undefined);
    sendJson(response, intent ? 200 : 404, intent ?? { error: "Payment intent not found" });
    return true;
  }

  if (path.startsWith("/api/v1/cart") || path.startsWith("/api/v1/checkout")) {
    sendJson(response, 410, { error: "Gem purchasing is not available on gemslanka.lk. The platform supports listing subscriptions only." });
    return true;
  }

  if (path.startsWith("/api/v1/users") || path.startsWith("/api/v1/orders") || path.startsWith("/api/v1/wishlist") || path.startsWith("/api/v1/storage") || path.startsWith("/api/v1/listing-subscriptions")) {
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
      sendJson(response, 200, await updateUserProfile(user.id, parseObject(body)));
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

    if (request.method === "GET" && path === "/api/v1/users/me/reports") {
      sendJson(response, 200, await getUserReports(user.id));
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

    if (request.method === "GET" && path === "/api/v1/wishlist") {
      sendJson(response, 200, await getWishlist(user.id));
      return true;
    }

    if (request.method === "POST" && path === "/api/v1/wishlist/items") {
      const body = parseObject(await readJsonBody(request).catch(() => ({})));
      const listingId = stringBody(body.listingId);
      if (!listingId) {
        sendJson(response, 400, { error: "listingId is required" });
        return true;
      }
      const listing = await getListing(listingId);
      if (!listing || listing.moderationStatus !== "approved") {
        sendJson(response, 404, { error: "Listing not found" });
        return true;
      }
      sendJson(response, 201, await addWishlistItem(user.id, listingId));
      return true;
    }

    const wishlistMatch = path.match(/^\/api\/v1\/wishlist\/items\/([^/]+)$/);
    if (wishlistMatch && request.method === "DELETE") {
      sendJson(response, 200, await removeWishlistItem(user.id, wishlistMatch[1]));
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
    sendJson(response, 200, await revealListingPhone(revealMatch[1]));
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

  if (request.method === "POST" && path === "/api/v1/listings") {
    const user = await authenticateUser(request);
    if (!user) {
      sendJson(response, 401, { error: "User authorization required" });
      return true;
    }
    const body = await readJsonBody(request).catch(() => ({}));
    sendJson(response, 201, await createListing(user.id, parseObject(body)));
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
      });
      sendJson(response, 201, intent);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to create payment intent" });
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

  const indexPath = join(staticRoot, "index.html");
  if (existsSync(indexPath)) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(await readFile(indexPath, "utf8"));
    return;
  }

  sendJson(response, 404, { error: "Web build not found. Run npm run build first." });
}

async function main() {
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

    const policyPage = policyPages[url.pathname];
    if (request.method === "GET" && policyPage) {
      sendPolicyPage(response, policyPage);
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
