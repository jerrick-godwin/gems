import type { MarketplaceFilters, MarketplacePageData, MarketplacePageSize, MarketplaceSort } from "@gems/schemas";
import type { Listing } from "@gems/schemas";
import { getGemTypes, getLocations, getMarketplaceListingPage } from "./marketplace-repository.js";
import { databaseClient, hasDatabase } from "./db/index.js";
import { notifyIndexNow } from "./indexnow.js";

const PAGE_SIZES = new Set<number>([10, 20, 50]);
const SORTS = new Set<MarketplaceSort>(["featured", "newest", "oldest", "price-low", "price-high"]);
const RESULT_TTL_MS = 30_000;
const REFERENCE_TTL_MS = 5 * 60_000;
const resultCache = new Map<string, { expiresAt: number; data: MarketplacePageData }>();
let referenceCache: { expiresAt: number; gemTypes: MarketplacePageData["gemTypes"]; locations: string[] } | undefined;

export interface MarketplaceLoadResult {
  data: MarketplacePageData;
  cache: "hit" | "miss";
  databaseMs: number;
}

export function pageSizeFromCookie(cookieHeader: string | undefined): MarketplacePageSize | undefined {
  const raw = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith("marketplace_page_size="))?.split("=")[1];
  const parsed = Number(raw);
  return PAGE_SIZES.has(parsed) ? parsed as MarketplacePageSize : undefined;
}

export function parseMarketplaceFilters(url: URL, cookieLimit?: MarketplacePageSize): MarketplaceFilters {
  const requestedLimit = Number(url.searchParams.get("limit"));
  const requestedPage = Number(url.searchParams.get("page"));
  const requestedSort = url.searchParams.get("sort") as MarketplaceSort | null;
  const locations = url.searchParams.getAll("location")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 10);
  return {
    q: (url.searchParams.get("q") ?? url.searchParams.get("query") ?? "").trim().slice(0, 120),
    gemType: normalizeChoice(url.searchParams.get("gemType")),
    locations,
    treatment: normalizeChoice(url.searchParams.get("treatment")),
    certificate: normalizeChoice(url.searchParams.get("certificate")),
    sort: requestedSort && SORTS.has(requestedSort) ? requestedSort : "featured",
    page: Number.isInteger(requestedPage) ? Math.min(10_000, Math.max(1, requestedPage)) : 1,
    limit: PAGE_SIZES.has(requestedLimit) ? requestedLimit as MarketplacePageSize : cookieLimit ?? 20
  };
}

export async function loadMarketplacePage(filters: MarketplaceFilters): Promise<MarketplaceLoadResult> {
  const startedAt = performance.now();
  const cacheKey = defaultCacheKey(filters);
  const cached = cacheKey ? resultCache.get(cacheKey) : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.data, cache: "hit", databaseMs: 0 };
  }

  const referencePromise = getReferenceData();
  const pagePromise = getMarketplaceListingPage(filters);
  const [reference, page] = await Promise.all([referencePromise, pagePromise]);
  const data: MarketplacePageData = {
    filters,
    gemTypes: reference.gemTypes,
    locations: reference.locations,
    page,
    generatedAt: new Date().toISOString()
  };
  if (cacheKey) resultCache.set(cacheKey, { data, expiresAt: Date.now() + RESULT_TTL_MS });
  return { data, cache: "miss", databaseMs: performance.now() - startedAt };
}

export async function prewarmMarketplacePages() {
  await Promise.all(([10, 20, 50] as const).map((limit) => loadMarketplacePage({
    q: "",
    gemType: "",
    locations: [],
    treatment: "",
    certificate: "",
    sort: "featured",
    page: 1,
    limit
  })));
}

export function invalidateMarketplaceCache() {
  resultCache.clear();
  referenceCache = undefined;
}

export async function startMarketplaceInvalidationListener() {
  if (!hasDatabase) return;
  await databaseClient.listen("marketplace_invalidation", () => invalidateMarketplaceCache());
}

export async function broadcastMarketplaceInvalidation(listings?: Pick<Listing, "id" | "gemTypeId"> | Array<Pick<Listing, "id" | "gemTypeId">>) {
  invalidateMarketplaceCache();
  if (hasDatabase) {
    await databaseClient.notify("marketplace_invalidation", "changed").catch((error) => {
      console.error("Marketplace invalidation broadcast failed", error);
    });
  }
  const siteUrl = process.env.PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    await notifyIndexNow(siteUrl, listings).catch((error) => console.warn("IndexNow notification failed:", error));
  }
}

function normalizeChoice(value: string | null) {
  if (!value || value === "all") return "";
  return value.trim().slice(0, 80);
}

function defaultCacheKey(filters: MarketplaceFilters) {
  if (filters.page !== 1 || filters.q || filters.gemType || filters.locations.length || filters.treatment || filters.certificate || filters.sort !== "featured") return undefined;
  return `default:${filters.limit}`;
}

async function getReferenceData() {
  if (referenceCache && referenceCache.expiresAt > Date.now()) return referenceCache;
  const [gemTypes, locations] = await Promise.all([getGemTypes(), getLocations()]);
  referenceCache = { gemTypes, locations, expiresAt: Date.now() + REFERENCE_TTL_MS };
  return referenceCache;
}
