import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { publicAssetsFromViteManifest } from "./public-assets.js";

test("public assets include CSS emitted on imported Vite chunks", () => {
  const assets = publicAssetsFromViteManifest({
    "src/entry-client.tsx": {
      file: "assets/public.js",
      imports: ["_styles.js", "_feature.js"]
    },
    "_styles.js": {
      file: "assets/styles.js",
      css: ["assets/styles.css"]
    },
    "_feature.js": {
      file: "assets/feature.js",
      imports: ["_styles.js", "_nested.js"]
    },
    "_nested.js": {
      file: "assets/nested.js",
      css: ["assets/nested.css"]
    }
  });

  assert.deepEqual(assets, {
    clientEntry: "/assets/public.js",
    stylesheets: ["/assets/styles.css", "/assets/nested.css"],
    modulePreloads: ["/assets/styles.js", "/assets/feature.js", "/assets/nested.js"]
  });
});

test("public asset resolution rejects a missing client entry", () => {
  assert.throws(() => publicAssetsFromViteManifest({}), /Public client entry is missing/);
});

test("guide SVGs are lightweight, self-contained, and safe to embed as images", () => {
  const guideAssets = [
    ["listing-anatomy.svg", 720],
    ["buyer-due-diligence-flow.svg", 520],
    ["report-anatomy.svg", 720],
    ["report-verification-flow.svg", 520]
  ] as const;

  for (const [filename, height] of guideAssets) {
    const file = new URL(`../public/assets/guides/${filename}`, import.meta.url);
    const source = readFileSync(file, "utf8");
    assert.ok(statSync(file).size < 100_000, `${filename} should remain below 100 KB`);
    assert.match(source, /<svg[^>]+width="1200"[^>]+height="(?:520|720)"/);
    assert.match(source, new RegExp(`viewBox="0 0 1200 ${height}"`));
    assert.doesNotMatch(source, /<script|<foreignObject|<image|(?:xlink:)?href=|@import|url\(/i);
  }
});
