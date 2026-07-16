import assert from "node:assert/strict";
import test from "node:test";
import {
  descriptiveListingImageAlt,
  isPriorityGemSlug,
  publicListingPhotoPath,
  seoLandingCrossLinks,
  seoLandingPageFromPath,
  seoLandingPages,
  type SeoLandingPageId
} from "./seo.js";

test("SEO route and priority category helpers are stable", () => {
  assert.equal(seoLandingPageFromPath("/buy-gemstones"), "buy");
  assert.equal(seoLandingPageFromPath("/unknown"), undefined);
  assert.equal(isPriorityGemSlug("sapphire"), true);
  assert.equal(isPriorityGemSlug("agate"), false);
});

test("public listing image paths remain on the Gemslanka origin", () => {
  assert.equal(publicListingPhotoPath("listing 1", 2), "/media/listings/listing%201/photos/2");
  assert.equal(publicListingPhotoPath("listing 1", 2, true), "/media/listings/listing%201/photos/2/thumbnail.webp");
});

test("filename image labels receive a descriptive fallback", () => {
  assert.equal(descriptiveListingImageAlt("IMG-1234.jpg", "Fine blue sapphire", "Sapphire"), "Fine blue sapphire – Sapphire gemstone");
  assert.equal(descriptiveListingImageAlt("Oval blue sapphire on white background", "Fine blue sapphire", "Sapphire"), "Oval blue sapphire on white background");
});

test("every SEO landing page has three safe, unique cross-links and a distinct inline link", () => {
  const pageIds = Object.keys(seoLandingPages) as SeoLandingPageId[];
  assert.equal(pageIds.length, 6);
  assert.deepEqual(Object.keys(seoLandingCrossLinks).sort(), [...pageIds].sort());

  for (const pageId of pageIds) {
    const related = seoLandingCrossLinks[pageId];
    assert.equal(related.cards.length, 3);
    assert.equal(new Set(related.cards).size, 3);
    assert.equal(related.cards.includes(pageId), false);
    assert.equal(related.inline.target === pageId, false);
    assert.equal(related.cards.includes(related.inline.target), false);
    for (const target of [...related.cards, related.inline.target]) {
      assert.ok(seoLandingPages[target]);
      assert.match(seoLandingPages[target].path, /^\//);
    }
  }
});
