import assert from "node:assert/strict";
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
