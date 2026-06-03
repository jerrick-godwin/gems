import "./env.js";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
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
  addCartItem,
  addWishlistItem,
  createCheckoutReservation,
  createListing,
  createStorageUpload,
  getCart,
  getAdminOrders,
  getDashboard,
  getOrders,
  getOrCreateUserFromClaims,
  getSettings,
  getUserProfile,
  getWishlist,
  removeCartItem,
  removeWishlistItem,
  updateCartItem,
  updateOrderStatus,
  updateSettings,
  updateUserProfile,
  getAllUsers,
  removeUserListing,
  updateUserListing
} from "./user-repository.js";
import { blobKeyFromLocalReadPath, localUploadPath, saveLocalUpload } from "./storage.js";

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

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type"
  });
  response.end(JSON.stringify(body));
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

  if (path.startsWith("/api/v1/users") || path.startsWith("/api/v1/cart") || path.startsWith("/api/v1/checkout") || path.startsWith("/api/v1/orders") || path.startsWith("/api/v1/wishlist") || path.startsWith("/api/v1/storage")) {
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

    if (request.method === "GET" && path === "/api/v1/cart") {
      sendJson(response, 200, await getCart(user.id));
      return true;
    }

    if (request.method === "POST" && path === "/api/v1/cart/items") {
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
      sendJson(response, 201, await addCartItem(user.id, listingId, numberBody(body.quantity, 1)));
      return true;
    }

    const cartItemMatch = path.match(/^\/api\/v1\/cart\/items\/([^/]+)$/);
    if (cartItemMatch && request.method === "PATCH") {
      const body = parseObject(await readJsonBody(request).catch(() => ({})));
      sendJson(response, 200, await updateCartItem(user.id, cartItemMatch[1], numberBody(body.quantity, 1)));
      return true;
    }

    if (cartItemMatch && request.method === "DELETE") {
      sendJson(response, 200, await removeCartItem(user.id, cartItemMatch[1]));
      return true;
    }

    if (request.method === "GET" && path === "/api/v1/orders") {
      sendJson(response, 200, await getOrders(user.id));
      return true;
    }

    if (request.method === "POST" && path === "/api/v1/checkout") {
      const body = parseObject(await readJsonBody(request).catch(() => ({}))) as any;
      const cart = await getCart(user.id);
      if (!cart.items.some((item) => item.listing?.moderationStatus === "approved")) {
        sendJson(response, 400, { error: "Cart is empty" });
        return true;
      }
      try {
        sendJson(response, 201, await createCheckoutReservation(user.id, {
          billingDetails: parseObject(body.billingDetails) as any,
          deliveryDetails: parseObject(body.deliveryDetails) as any,
          paymentMethod: body.paymentMethod,
          customerNote: typeof body.customerNote === "string" ? body.customerNote : undefined
        }));
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : "Unable to place order" });
      }
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
    const publicListing = listing?.moderationStatus === "approved" ? listing : undefined;
    sendJson(response, publicListing ? 200 : 404, publicListing ?? { error: "Listing not found" });
    return true;
  }

  const revealMatch = path.match(/^\/api\/v1\/listings\/([^/]+)\/reveal-phone$/);
  if (request.method === "POST" && revealMatch) {
    const listing = await getListing(revealMatch[1]);
    if (!listing || listing.moderationStatus !== "approved") {
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

void main();
