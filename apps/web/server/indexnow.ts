import type { Listing } from "@gems/schemas";
import { gemstoneCategoryPath } from "../src/shared/seo.js";

type ListingReference = Pick<Listing, "id" | "gemTypeId">;

export function indexNowKey() {
  const key = process.env.INDEXNOW_KEY?.trim() ?? "";
  return /^[A-Za-z0-9-]{8,128}$/.test(key) ? key : "";
}

export function indexNowUrls(siteUrl: string, listings: ListingReference | ListingReference[] | undefined) {
  const values = listings ? (Array.isArray(listings) ? listings : [listings]) : [];
  const paths = new Set<string>(["/", "/sitemap.xml"]);
  for (const listing of values) {
    paths.add(`/listings/${encodeURIComponent(listing.id)}`);
    paths.add(gemstoneCategoryPath(listing.gemTypeId));
  }
  return [...paths].map((path) => new URL(path, `${siteUrl.replace(/\/+$/, "")}/`).href);
}

export async function notifyIndexNow(
  siteUrl: string,
  listings?: ListingReference | ListingReference[],
  fetchImplementation: typeof fetch = fetch
) {
  const key = indexNowKey();
  if (!key || !siteUrl) return false;
  const origin = new URL(siteUrl);
  const response = await fetchImplementation("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: origin.host,
      key,
      keyLocation: new URL(`/${key}.txt`, origin).href,
      urlList: indexNowUrls(origin.href, listings)
    }),
    signal: AbortSignal.timeout(3_000)
  });
  if (!response.ok) throw new Error(`IndexNow returned HTTP ${response.status}`);
  return true;
}
