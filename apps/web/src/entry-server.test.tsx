import assert from "node:assert/strict";
import test from "node:test";
import type { Listing, MarketplacePageData, SellerProfile } from "@gems/schemas";
import { renderPublicPage, serializePublicState } from "./entry-server.js";
import { metadataFor } from "./public/PublicDocument.js";
import { seoLandingCrossLinks, seoLandingPages, type SeoLandingPageId } from "./shared/seo.js";

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
      total: 21,
      page: 1,
      limit: 20,
      totalPages: 2
    },
    generatedAt: "2026-07-15T00:00:00.000Z"
  };
  const stream = await renderPublicPage({ url: "/", origin: "https://gemslanka.lk", theme: "dark", year: 2026, route: { kind: "marketplace", data }, assets: { clientEntry: "/public.js", stylesheets: ["/public.css"], modulePreloads: ["/react.js"] } });
  let html = "";
  for await (const chunk of stream) html += chunk;
  assert.match(html, /Fine blue sapphire/);
  assert.match(html, /class="topbar"/);
  assert.match(html, /class="market-grid"/);
  assert.match(html, /class="listing-card card card--media card--interactive"/);
  assert.match(html, /Items per page/);
  assert.match(html, /id="marketplace-results-search-input"/);
  assert.doesNotMatch(html, /class="seo-quick-links"/);
  assert.doesNotMatch(html, /class="seo-eyebrow"/);
  assert.doesNotMatch(html, /class="marketplace-search-panel/);
  assert.match(html, /class="global-search marketplace-results-search"/);
  assert.match(html, /placeholder="Search Gemstones"/);
  const resultsStart = html.indexOf('class="feed marketplace-results-card card card--surface"');
  const resultsEnd = html.indexOf("</section>", resultsStart);
  const results = html.slice(resultsStart, resultsEnd);
  assert.ok(resultsStart > -1);
  assert.ok(results.indexOf("marketplace-results-search-input") < results.indexOf("Fine blue sapphire"));
  assert.match(results, /Fine blue sapphire/);
  assert.match(results, /class="listing-results-footer"/);
  assert.match(results, /class="pagination"/);
  assert.match(results, /Items per page/);
  assert.ok(resultsEnd < html.indexOf('aria-label="Gem filters"'));
  assert.match(html, /aria-controls="marketplace-origin-options"/);
  assert.match(html, /id="__PUBLIC_STATE__"/);
  assert.match(html, /loading="eager"/);
  assert.match(html, /fetchpriority="high"/);
  assert.match(html, /href="\/favicon-rounded-32\.png"/);
  assert.match(html, /href="\/assets\/logo-mark-rounded-192\.png"/);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon-rounded\.png"/);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  assert.match(html, /property="og:image" content="https:\/\/gemslanka\.lk\/assets\/gem-triptych\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-PBC7B30RE3/);
  assert.match(html, /gtag\('config', 'G-PBC7B30RE3'\)/);
  assert.match(html, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1870465390690184/);
  assert.match(html, /name="google-adsense-account" content="ca-pub-1870465390690184"/);
  assert.match(html, /"@type":"Organization"/);
  assert.match(html, /"@type":"WebSite"/);
  assert.match(html, /Buy and Sell Gemstones Worldwide with Gemslanka/);
  assert.match(html, /href="\/buy-gemstones"/);
  assert.match(html, /class="marketplace-seo-placement marketplace-seo-placement-top"/);
  assert.match(html, /<section class="marketplace-seo-intro[^>]*aria-labelledby="marketplace-heading"/);
  assert.doesNotMatch(html, /marketplace-seo-mobile-summary|<details/);
  const header = html.slice(html.indexOf('<header class="topbar">'), html.indexOf("</header>") + 9);
  const footer = html.slice(html.indexOf('<footer class="site-footer"'));
  assert.match(header, /aria-controls="nav-mobile-menu-panel"/);
  assert.match(header, /id="nav-mobile-menu-panel"/);
  assert.match(header, /id="nav-menu-marketplace-heading">Marketplace/);
  assert.match(header, /id="nav-menu-guides-heading">Guides/);
  assert.match(header, /id="nav-menu-account-heading">Account/);
  assert.match(header, /href="\/gemstones"/);
  assert.match(header, /href="\/guides\/buying-gemstones-online"/);
  assert.match(header, /href="\/guides\/gemstone-certification-and-treatments"/);
  assert.match(header, /href="\/about-us"/);
  assert.match(footer, /Guides &amp; About/);
  assert.match(footer, /href="\/gemstones">Gemstone Guide</);
  assert.match(footer, /href="\/about-us">About Us</);
  assert.match(footer, /class="footer-links-grid"/);
  assert.ok(footer.indexOf('class="footer-brand-col"') < footer.indexOf('class="footer-links-grid"'));
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.doesNotMatch(html, /name="keywords"/);
});

test("category marketplace keeps search in the results-card header", async () => {
  const data: MarketplacePageData = {
    filters: { q: "", gemType: "sapphire", locations: [], treatment: "", certificate: "", sort: "featured", page: 1, limit: 20 },
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
        attributes: { carat: 2.1, color: "Blue", shape: "Oval", treatment: "heated", certificateStatus: "none" },
        promoted: [],
        seller: { id: "seller-1", displayName: "Seller", verificationStatus: "identity_verified", location: "Colombo", rating: 4.8 },
        image: { url: "/gem.webp", alt: "Fine blue sapphire", width: 800, height: 600 }
      }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1
    },
    generatedAt: "2026-07-16T00:00:00.000Z"
  };
  const stream = await renderPublicPage({
    url: "/gemstones/sapphire",
    origin: "https://gemslanka.lk",
    theme: "light",
    year: 2026,
    route: { kind: "category", gemType: data.gemTypes[0], data, indexable: true },
    assets: { clientEntry: "/public.js", stylesheets: [], modulePreloads: [] }
  });
  let html = "";
  for await (const chunk of stream) html += chunk;
  assert.match(html, /id="marketplace-results-search-input"/);
  assert.match(html, /class="global-search marketplace-results-search"/);
  assert.doesNotMatch(html, /class="seo-eyebrow"/);
  const resultsStart = html.indexOf('class="feed marketplace-results-card card card--surface"');
  const resultsEnd = html.indexOf("</section>", resultsStart);
  const results = html.slice(resultsStart, resultsEnd);
  assert.match(results, /marketplace-results-search-input/);
  assert.match(results, /Items per page/);
  assert.doesNotMatch(results, /class="pagination"/);
  assert.ok(html.indexOf("Items per page") < html.indexOf('aria-label="Gem filters"'));
});

test("empty filtered results remain inside the results card with page-size controls", async () => {
  const data: MarketplacePageData = {
    filters: { q: "missing", gemType: "", locations: [], treatment: "", certificate: "", sort: "featured", page: 1, limit: 20 },
    gemTypes: [{ id: "sapphire", name: "Sapphire", slug: "sapphire", colorHint: "blue" }],
    locations: ["Colombo"],
    page: { items: [], total: 0, page: 1, limit: 20, totalPages: 1 },
    generatedAt: "2026-07-16T00:00:00.000Z"
  };
  const stream = await renderPublicPage({
    url: "/?q=missing",
    origin: "https://gemslanka.lk",
    theme: "light",
    year: 2026,
    route: { kind: "marketplace", data },
    assets: { clientEntry: "/public.js", stylesheets: [], modulePreloads: [] }
  });
  let html = "";
  for await (const chunk of stream) html += chunk;
  const resultsStart = html.indexOf('class="feed marketplace-results-card card card--surface"');
  const resultsEnd = html.indexOf("</section>", resultsStart);
  const results = html.slice(resultsStart, resultsEnd);
  assert.match(results, /No matches found/);
  assert.match(results, /Items per page/);
  assert.match(html, /aria-label="Clear search"/);
});

test("listing details omit missing certificates and render provided certificates", async () => {
  const seller: SellerProfile = {
    id: "seller-1",
    userId: "user-1",
    displayName: "Ceylon Gems",
    verificationStatus: "identity_verified",
    shopSlug: "ceylon-gems",
    memberSince: "2026-01-01",
    location: "Colombo",
    rating: 4.8
  };
  const listing: Listing = {
    id: "listing-1",
    sellerId: seller.id,
    gemTypeId: "sapphire",
    title: "Fine blue sapphire",
    description: "A natural sapphire listing.",
    priceLkr: 125_000,
    negotiable: true,
    location: "Colombo",
    status: "live",
    moderationStatus: "approved",
    attributes: { carat: 2.1, dimensions: "8x6 mm", shape: "Oval", cut: "Brilliant", color: "Blue", clarity: "Eye clean", origin: "Sri Lanka", treatment: "heated", certificateStatus: "none" },
    media: [{ id: "photo-1", listingId: "listing-1", kind: "photo", url: "/gem.webp", alt: "Fine blue sapphire", order: 0, moderationStatus: "approved" }],
    promoted: [],
    campaigns: [],
    stats: { views: 0, saves: 0, phoneReveals: 0, chats: 0, whatsappClicks: 0 }
  };
  const renderListing = async (currentListing: Listing) => {
    const stream = await renderPublicPage({
      url: `/listings/${currentListing.id}`,
      origin: "https://gemslanka.lk",
      theme: "light",
      year: 2026,
      route: { kind: "listing", listing: currentListing, seller },
      assets: { clientEntry: "/public.js", stylesheets: [], modulePreloads: [] }
    });
    let html = "";
    for await (const chunk of stream) html += chunk;
    return html;
  };

  const withoutCertificate = await renderListing(listing);
  assert.doesNotMatch(withoutCertificate, /Certificate not Provided|class="certificate-box/);
  assert.match(withoutCertificate, /id="marketplace-results-search-input"/);

  const withCertificate = await renderListing({
    ...listing,
    attributes: { ...listing.attributes, certificateStatus: "seller_provided" },
    media: [...listing.media, { id: "certificate-1", listingId: listing.id, kind: "certificate", url: "/certificate.pdf", alt: "Gem certificate", order: 1, moderationStatus: "approved" }]
  });
  assert.match(withCertificate, /Gem Certificate is Provided/);
  assert.match(withCertificate, /href="\/certificate\.pdf"/);
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

  assert.equal(metadata.image, "https://gemslanka.lk/media/listings/listing-1/photos/0/thumbnail.webp");
  const structuredData = JSON.parse(metadata.structuredData);
  const product = structuredData["@graph"].find((entry: any) => entry["@type"] === "Product");
  assert.equal(product.image[0], "https://gemslanka.lk/media/listings/listing-1/photos/0");
  assert.equal(product.offers.priceCurrency, "LKR");
  assert.equal(product.offers.price, 125_000);
  assert.equal(product.offers.seller.name, "Ceylon Gems Ltd");
  assert.ok(structuredData["@graph"].some((entry: any) => entry["@type"] === "BreadcrumbList"));
});

test("landing pages render one H1, crawlable links, verification, and route-specific metadata", async () => {
  const stream = await renderPublicPage({
    url: "/buy-gemstones",
    origin: "https://gemslanka.lk",
    theme: "light",
    year: 2026,
    verification: { google: "google-token", bing: "bing-token" },
    route: { kind: "landing", page: "buy", gemTypes: [{ id: "sapphire", name: "Sapphire", slug: "sapphire", colorHint: "blue" }] },
    assets: { clientEntry: "/public.js", stylesheets: [], modulePreloads: [] }
  });
  let html = "";
  for await (const chunk of stream) html += chunk;
  assert.match(html, /<title>Buy Gemstones Online \| Natural Gems for Sale \| Gemslanka<\/title>/);
  assert.match(html, /rel="canonical" href="https:\/\/gemslanka\.lk\/buy-gemstones"/);
  assert.match(html, /name="google-site-verification" content="google-token"/);
  assert.match(html, /name="msvalidate\.01" content="bing-token"/);
  assert.match(html, /href="\/gemstones\/sapphire"/);
  assert.doesNotMatch(html, /class="seo-eyebrow"/);
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
});

async function renderLandingPage(page: SeoLandingPageId) {
  const stream = await renderPublicPage({
    url: seoLandingPages[page].path,
    origin: "https://gemslanka.lk",
    theme: "light",
    year: 2026,
    route: { kind: "landing", page, gemTypes: [{ id: "sapphire", name: "Sapphire", slug: "sapphire", colorHint: "blue" }] },
    assets: { clientEntry: "/public.js", stylesheets: [], modulePreloads: [] }
  });
  let html = "";
  for await (const chunk of stream) html += chunk;
  return html;
}

test("all six landing pages render the configured related navigation before the marketplace notice", async () => {
  for (const page of Object.keys(seoLandingPages) as SeoLandingPageId[]) {
    const html = await renderLandingPage(page);
    const relatedStart = html.indexOf('class="seo-section seo-related-pages"');
    const relatedEnd = html.indexOf('class="seo-marketplace-notice', relatedStart);
    const relatedHtml = html.slice(relatedStart, relatedEnd);
    const configuration = seoLandingCrossLinks[page];

    assert.ok(relatedStart > -1, `${page} should render Continue exploring`);
    assert.ok(relatedEnd > relatedStart, `${page} related navigation should precede the notice`);
    assert.match(relatedHtml, /Continue exploring/);
    assert.match(relatedHtml, /aria-label="Related Gemslanka pages"/);
    assert.equal((relatedHtml.match(/class="card card--interactive"/g) ?? []).length, 3);
    for (const target of configuration.cards) assert.match(relatedHtml, new RegExp(`href="${seoLandingPages[target].path}"`));
    assert.match(relatedHtml, new RegExp(`href="${seoLandingPages[configuration.inline.target].path}"`));
    assert.doesNotMatch(relatedHtml, new RegExp(`href="${seoLandingPages[page].path}"`));
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
  }
});

test("buying guide SSR includes original figures, a worked example, citations, and reviewed sources", async () => {
  const html = await renderLandingPage("buying-guide");
  assert.match(html, /assets\/guides\/listing-anatomy\.svg/);
  assert.match(html, /assets\/guides\/buyer-due-diligence-flow\.svg/);
  assert.equal((html.match(/<figure/g) ?? []).length, 2);
  assert.equal((html.match(/<figcaption/g) ?? []).length, 2);
  assert.match(html, /Worked example: a fictional sapphire listing/);
  assert.match(html, /Conclusions the listing cannot establish/);
  assert.match(html, /Photographs can help[^<]+but they cannot establish authenticity/);
  assert.match(html, /Not stated.*untreated|not stated.*untreated/i);
  assert.match(html, /Sources and further reading/);
  assert.match(html, /https:\/\/www\.gia\.edu\/gia-website\/report-check-landing/);
  assert.match(html, /https:\/\/gemlab-certificate\.ngja\.gov\.lk\//);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test("certification guide SSR includes report anatomy, treatment examples, mismatch guidance, and official sources", async () => {
  const html = await renderLandingPage("certification-guide");
  assert.match(html, /assets\/guides\/report-anatomy\.svg/);
  assert.match(html, /assets\/guides\/report-verification-flow\.svg/);
  assert.equal((html.match(/<figure/g) ?? []).length, 2);
  assert.equal((html.match(/<figcaption/g) ?? []).length, 2);
  assert.match(html, /Illustrative example — not a laboratory report/);
  assert.match(html, /Treatment-disclosure matrix/);
  assert.match(html, /Heating/);
  assert.match(html, /Diffusion/);
  assert.match(html, /Filling or oiling/);
  assert.match(html, /Coating or dyeing/);
  assert.match(html, /Fictional mismatch example: pause and clarify/);
  assert.match(html, /3\.20 ct untreated sapphire/);
  assert.match(html, /3\.02 ct and indications of heating/);
  assert.match(html, /US consumer reference—not Sri Lankan or universal law/);
  assert.match(html, /https:\/\/cibjo\.org\/the-blue-books\//);
  assert.match(html, /https:\/\/ngja\.gov\.lk\/business_services/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test("category metadata indexes useful clean pages and noindexes filtered or thin pages", () => {
  const categoryData: MarketplacePageData = {
    filters: { q: "", gemType: "sapphire", locations: [], treatment: "", certificate: "", sort: "featured", page: 1, limit: 20 },
    gemTypes: [{ id: "sapphire", name: "Sapphire", slug: "sapphire", colorHint: "blue" }],
    locations: [],
    page: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
    generatedAt: "2026-07-15T00:00:00.000Z"
  };
  const base = {
    origin: "https://gemslanka.lk",
    theme: "light" as const,
    year: 2026,
    assets: { clientEntry: "/public.js", stylesheets: [], modulePreloads: [] }
  };
  const clean = metadataFor({ ...base, url: "/gemstones/sapphire", route: { kind: "category", gemType: categoryData.gemTypes[0], data: categoryData, indexable: true } });
  assert.equal(clean.canonical, "https://gemslanka.lk/gemstones/sapphire");
  assert.equal(clean.robots, "index,follow,max-image-preview:large");
  const cookieSizedData: MarketplacePageData = { ...categoryData, filters: { ...categoryData.filters, limit: 50 }, page: { ...categoryData.page, limit: 50 } };
  const cookieSized = metadataFor({ ...base, url: "/gemstones/sapphire", route: { kind: "category", gemType: categoryData.gemTypes[0], data: cookieSizedData, indexable: true } });
  assert.equal(cookieSized.robots, "index,follow,max-image-preview:large");
  assert.equal(cookieSized.canonical, "https://gemslanka.lk/gemstones/sapphire");
  const alternateLimit = metadataFor({ ...base, url: "/gemstones/sapphire?limit=50", route: { kind: "category", gemType: categoryData.gemTypes[0], data: cookieSizedData, indexable: true } });
  assert.equal(alternateLimit.robots, "noindex,follow");
  const filteredData = { ...categoryData, filters: { ...categoryData.filters, treatment: "heated" } };
  const filtered = metadataFor({ ...base, url: "/gemstones/sapphire?treatment=heated", route: { kind: "category", gemType: categoryData.gemTypes[0], data: filteredData, indexable: true } });
  assert.equal(filtered.robots, "noindex,follow");
  const thin = metadataFor({ ...base, url: "/gemstones/agate", route: { kind: "category", gemType: { id: "agate", name: "Agate", slug: "agate", colorHint: "grey" }, data: { ...categoryData, filters: { ...categoryData.filters, gemType: "agate" } }, indexable: false } });
  assert.equal(thin.robots, "noindex,follow");
});

test("legal policy pages and contact remain indexable for search and AdSense review", () => {
  const base = { origin: "https://gemslanka.lk", theme: "light" as const, year: 2026, assets: { clientEntry: "/public.js", stylesheets: [], modulePreloads: [] } };
  assert.equal(metadataFor({ ...base, url: "/privacy-policy", route: { kind: "content", page: "privacy" } }).robots, "index,follow,max-image-preview:large");
  assert.equal(metadataFor({ ...base, url: "/contact-us", route: { kind: "content", page: "contact" } }).robots, "index,follow,max-image-preview:large");
});
