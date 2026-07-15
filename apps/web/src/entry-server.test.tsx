import assert from "node:assert/strict";
import test from "node:test";
import type { MarketplacePageData } from "@gems/schemas";
import { renderPublicPage, serializePublicState } from "./entry-server.js";
import { metadataFor } from "./public/PublicDocument.js";

test("serialized state cannot close its application/json script", () => {
  const serialized = serializePublicState({ title: "</script><script>alert(1)</script>", detail: "A&B\u2028C" });
  assert.equal(serialized.includes("</script>"), false);
  assert.match(serialized, /\\u003c\/script/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u2028/);
});

test("SSR response contains the established marketplace UI, listing content, and initial state", async () => {
  const data: MarketplacePageData = {
    filters: { q: "", gemType: "", locations: [], treatment: "", certificate: "", sort: "featured", page: 1, limit: 20 },
    gemTypes: [{ id: "sapphire", name: "Sapphire", slug: "sapphire", colorHint: "blue" }],
    locations: ["Colombo"],
    page: {
      items: [{
        id: "listing-1",
        title: "Fine blue sapphire",
        priceLkr: 125_000,
        negotiable: true,
        location: "Colombo",
        gemTypeId: "sapphire",
        attributes: { carat: 2.1, color: "Blue", shape: "Oval", treatment: "heated", certificateStatus: "seller_provided" },
        promoted: ["featured"],
        seller: { id: "seller-1", displayName: "Seller", verificationStatus: "identity_verified", location: "Colombo", rating: 4.8 },
        image: { url: "/gem.webp", alt: "Fine blue sapphire", width: 800, height: 600 }
      }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1
    },
    generatedAt: "2026-07-15T00:00:00.000Z"
  };
  const stream = await renderPublicPage({ url: "/", origin: "https://gemslanka.lk", theme: "dark", year: 2026, route: { kind: "marketplace", data }, assets: { clientEntry: "/public.js", stylesheets: ["/public.css"], modulePreloads: ["/react.js"] } });
  let html = "";
  for await (const chunk of stream) html += chunk;
  assert.match(html, /Fine blue sapphire/);
  assert.match(html, /class="topbar"/);
  assert.match(html, /class="market-grid"/);
  assert.match(html, /class="listing-card"/);
  assert.match(html, /Items per page/);
  assert.match(html, /id="__PUBLIC_STATE__"/);
  assert.match(html, /loading="eager"/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /href="\/favicon-32\.png"/);
  assert.match(html, /href="\/assets\/logo-mark-192\.png"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  assert.match(html, /property="og:image" content="https:\/\/gemslanka\.lk\/assets\/gem-triptych\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-PBC7B30RE3/);
  assert.match(html, /gtag\('config', 'G-PBC7B30RE3'\)/);
  assert.match(html, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1870465390690184/);
  assert.match(html, /name="google-adsense-account" content="ca-pub-1870465390690184"/);
  assert.match(html, /"@type":"Organization"/);
  assert.match(html, /"@type":"WebSite"/);
});

test("listing metadata uses the listing image and exposes a valid product offer", () => {
  const metadata = metadataFor({
    url: "/listings/listing-1",
    origin: "https://gemslanka.lk",
    theme: "light",
    year: 2026,
    assets: { clientEntry: "/public.js", stylesheets: [], modulePreloads: [] },
    route: {
      kind: "listing",
      listing: {
        id: "listing-1",
        sellerId: "seller-1",
        gemTypeId: "sapphire",
        title: "Fine blue sapphire",
        description: "A certified natural sapphire from Sri Lanka.",
        priceLkr: 125_000,
        negotiable: false,
        location: "Colombo",
        status: "live",
        moderationStatus: "approved",
        attributes: { carat: 2.1, dimensions: "8x6 mm", shape: "Oval", cut: "Brilliant", color: "Blue", clarity: "Eye clean", origin: "Sri Lanka", treatment: "heated", certificateStatus: "seller_provided" },
        media: [{ id: "media-1", listingId: "listing-1", kind: "photo", url: "/sapphire.jpg", thumbnailUrl: "/sapphire-card.webp", alt: "Fine blue sapphire", order: 0, moderationStatus: "approved" }],
        promoted: [],
        campaigns: [],
        stats: { views: 0, saves: 0, phoneReveals: 0, chats: 0, whatsappClicks: 0 }
      },
      seller: { id: "seller-1", userId: "user-1", displayName: "Ceylon Gems", businessName: "Ceylon Gems Ltd", verificationStatus: "business_verified", shopSlug: "ceylon-gems", memberSince: "2026-01-01", location: "Colombo", rating: 4.8 }
    }
  });

  assert.equal(metadata.image, "https://gemslanka.lk/sapphire-card.webp");
  const structuredData = JSON.parse(metadata.structuredData);
  assert.equal(structuredData["@type"], "Product");
  assert.equal(structuredData.offers.priceCurrency, "LKR");
  assert.equal(structuredData.offers.price, 125_000);
  assert.equal(structuredData.offers.seller.name, "Ceylon Gems Ltd");
});
