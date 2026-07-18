import { gemstoneCategoryPath, isPriorityGemSlug, publicListingPhotoPath, seoLandingPages } from "../src/shared/seo.js";

interface SitemapGemType {
  id: string;
  slug: string;
}

interface SitemapListing {
  id: string;
  gemTypeId: string;
  updatedAt: string;
  images: Array<{ order: number; alt: string }>;
}

interface SitemapUrl {
  path: string;
  lastmod: string;
  images?: Array<{ path: string; alt: string }>;
}

export function buildSitemapXml(siteUrl: string, listings: SitemapListing[], gemTypes: SitemapGemType[]) {
  const latestListingDate = listings.map((listing) => listing.updatedAt).sort().at(-1)?.slice(0, 10) ?? "2026-07-15";
  const activeGemTypes = new Set(listings.map((listing) => listing.gemTypeId));
  const staticDates = new Map<string, string>([
    ["/", latestListingDate],
    ["/contact-us", "2026-06-11"],
    ...Object.values(seoLandingPages).map((page) => [page.path, page.updatedAt] as [string, string])
  ]);
  const indexableStaticPaths = ["/", ...Object.values(seoLandingPages).map((page) => page.path), "/contact-us"];
  const urls: SitemapUrl[] = indexableStaticPaths.map((path) => ({
    path,
    lastmod: staticDates.get(path) ?? "2026-07-15"
  }));

  for (const gemType of gemTypes) {
    if (!activeGemTypes.has(gemType.id) && !isPriorityGemSlug(gemType.slug)) continue;
    const categoryDate = listings
      .filter((listing) => listing.gemTypeId === gemType.id)
      .map((listing) => listing.updatedAt)
      .sort()
      .at(-1)?.slice(0, 10) ?? "2026-07-15";
    urls.push({ path: gemstoneCategoryPath(gemType.slug), lastmod: categoryDate });
  }

  for (const listing of listings) {
    urls.push({
      path: `/listings/${encodeURIComponent(listing.id)}`,
      lastmod: listing.updatedAt.slice(0, 10),
      images: listing.images.map((image) => ({
        path: publicListingPhotoPath(listing.id, image.order),
        alt: image.alt
      }))
    });
  }

  const baseUrl = `${siteUrl.replace(/\/+$/, "")}/`;
  const xmlUrls = urls.map(({ path, lastmod, images }) => `  <url>
    <loc>${escapeXml(new URL(path, baseUrl).href)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>${images?.map((image) => `
    <image:image>
      <image:loc>${escapeXml(new URL(image.path, baseUrl).href)}</image:loc>
      <image:caption>${escapeXml(image.alt)}</image:caption>
    </image:image>`).join("") ?? ""}
  </url>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${xmlUrls}
</urlset>
`;
}

export function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}
