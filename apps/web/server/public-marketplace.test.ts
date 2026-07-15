import assert from "node:assert/strict";
import test from "node:test";
import { pageSizeFromCookie, parseMarketplaceFilters } from "./public-marketplace.js";

test("marketplace parameters are validated and URL page size wins over the cookie", () => {
  const url = new URL("https://gemslanka.lk/?q=sapphire&location=Colombo&location=Ratnapura&sort=price-low&page=-2&limit=50");
  const filters = parseMarketplaceFilters(url, 10);
  assert.deepEqual(filters, {
    q: "sapphire",
    gemType: "",
    locations: ["Colombo", "Ratnapura"],
    treatment: "",
    certificate: "",
    sort: "price-low",
    page: 1,
    limit: 50
  });
});

test("unsupported page sizes and sort values are clamped to safe defaults", () => {
  const filters = parseMarketplaceFilters(new URL("https://gemslanka.lk/?limit=500&sort=random&page=3"), 10);
  assert.equal(filters.limit, 10);
  assert.equal(filters.sort, "featured");
  assert.equal(filters.page, 3);
  assert.equal(pageSizeFromCookie("session=x; marketplace_page_size=20; theme=dark"), 20);
  assert.equal(pageSizeFromCookie("marketplace_page_size=500"), undefined);
});
