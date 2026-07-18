import assert from "node:assert/strict";
import test from "node:test";
import { normalizeListingTitle } from "./listing-title.js";

test("listing titles capitalize each word while preserving existing casing", () => {
  assert.equal(normalizeListingTitle("natural deep green tourmaline"), "Natural Deep Green Tourmaline");
  assert.equal(normalizeListingTitle("natural QA sapphire"), "Natural QA Sapphire");
  assert.equal(normalizeListingTitle("BLUE SAPPHIRE"), "BLUE SAPPHIRE");
  assert.equal(normalizeListingTitle("Natural Blue Sapphire"), "Natural Blue Sapphire");
});

test("listing titles trim and collapse whitespace", () => {
  assert.equal(normalizeListingTitle("  natural\tblue\n sapphire  "), "Natural Blue Sapphire");
});
