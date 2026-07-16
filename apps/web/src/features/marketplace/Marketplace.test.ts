import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { phonePreviewLabel } from "./Marketplace.js";
import { MarketplaceSearch } from "./MarketplaceSearch.js";

test("phone preview labels distinguish loading, missing, error, and available states", () => {
  assert.equal(phonePreviewLabel("idle", ""), "Phone number");
  assert.equal(phonePreviewLabel("loading", ""), "Loading...");
  assert.equal(phonePreviewLabel("unavailable", ""), "Phone number not available");
  assert.equal(phonePreviewLabel("error", ""), "Unable to load phone number");
  assert.equal(phonePreviewLabel("available", "+94 76 123 4567"), "+94 76 123 4567");
});

test("marketplace search stays simple and exposes an accessible clear action", () => {
  const populated = renderToStaticMarkup(MarketplaceSearch({ id: "results-search", value: "ruby", onChange: () => {}, className: "marketplace-results-search" }));
  const empty = renderToStaticMarkup(MarketplaceSearch({ id: "empty-search", value: "", onChange: () => {} }));

  assert.match(populated, /class="global-search marketplace-results-search"/);
  assert.match(populated, /placeholder="Search gemstones"/);
  assert.match(populated, /aria-label="Clear search"/);
  assert.doesNotMatch(populated, /global-search--command|global-search--compact/);
  assert.doesNotMatch(empty, /aria-label="Clear search"/);
});
