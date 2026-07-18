import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { seoLandingPages } from "../src/shared/seo.js";

interface VercelRoute {
  src?: string;
  dest?: string;
  handle?: string;
}

const config = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8")
) as { routes: VercelRoute[] };

function destinationFor(pathname: string) {
  for (const route of config.routes) {
    if (route.handle) continue;
    if (route.src && new RegExp(route.src).test(pathname)) return route.dest;
  }
  return undefined;
}

test("Vercel sends every indexable public page through the SSR function", () => {
  const publicPaths = [
    "/",
    ...Object.values(seoLandingPages).map((page) => page.path),
    "/contact-us",
    "/gemstones/sapphire",
    "/listings/example-listing"
  ];

  for (const pathname of publicPaths) {
    assert.equal(destinationFor(pathname), "/api/index.ts", `${pathname} must use SSR`);
    if (pathname !== "/") {
      assert.equal(destinationFor(`${pathname}/`), "/api/index.ts", `${pathname}/ must use SSR`);
    }
  }
});

test("private browser routes continue to use the noindex SPA shell", () => {
  for (const pathname of ["/login", "/post", "/profile", "/reports", "/receipt"]) {
    assert.equal(destinationFor(pathname), "/index.html");
  }
});
