import assert from "node:assert/strict";
import test from "node:test";
import type { MarketplacePageData } from "@gems/schemas";
import { renderPublicPage, serializePublicState } from "./entry-server.js";

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
});
