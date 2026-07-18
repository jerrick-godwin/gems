import { expect, test } from "@playwright/test";

test("opens Post a Gem without a document reload or loading skeleton", async ({ page }) => {
  let documentRequests = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests += 1;
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#nav-post")).toBeVisible();
  const initialDocumentRequests = documentRequests;

  await page.locator("#nav-post").hover();
  await page.locator("#nav-post").click();

  await expect(page).toHaveURL(/\/post$/);
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
  await expect(page.locator(".market-skeleton")).toHaveCount(0);
  await expect(page.locator(".nav-auth-placeholder")).toHaveCount(0);
  await expect(page.locator(".post-form")).toHaveCSS("display", "grid");
  expect(documentRequests).toBe(initialDocumentRequests);
});

test("Browse returns from Post a Gem to the canonical public homepage", async ({ page }) => {
  let documentRequests = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests += 1;
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".marketplace-seo-intro")).toBeVisible();
  await page.locator("#nav-post").click();
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
  const postDocumentRequests = documentRequests;

  await page.locator("#nav-browse").click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".marketplace-seo-intro")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buy and Sell Gemstones Worldwide with Gemslanka" })).toBeVisible();
  expect(documentRequests).toBe(postDocumentRequests + 1);
});

test("direct Post route renders its form while only reference selects wait", async ({ page }) => {
  const unexpectedRequests: string[] = [];
  let releaseReferences: (() => void) | undefined;
  const referencesGate = new Promise<void>((resolve) => {
    releaseReferences = resolve;
  });
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (["/api/v1/snapshot", "/api/v1/search/listings", "/api/v1/users/me/dashboard", "/api/v1/users/me/reports"].includes(pathname)) {
      unexpectedRequests.push(pathname);
    }
  });

  await page.route("**/api/v1/gem-types", async (route) => {
    await referencesGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "sapphire", name: "Sapphire", slug: "sapphire", colorHint: "blue" }])
    });
  });
  await page.route("**/api/v1/locations", async (route) => {
    await referencesGate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(["Colombo"]) });
  });

  await page.goto("/post", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
  await expect(page.locator("#post-gem-type")).toBeDisabled();
  await expect(page.locator("#post-location")).toBeDisabled();
  await expect(page.locator(".market-skeleton")).toHaveCount(0);
  await expect(page.locator("#post-title")).toBeEnabled();

  releaseReferences?.();
  await expect(page.locator("#post-gem-type")).toBeEnabled();
  await expect(page.locator("#post-location")).toBeEnabled();
  expect(unexpectedRequests).toEqual([]);
});

test("direct Post route keeps the form and retries an inline reference error", async ({ page }) => {
  let gemTypeAttempts = 0;
  let locationAttempts = 0;
  await page.route("**/api/v1/gem-types", async (route) => {
    gemTypeAttempts += 1;
    if (gemTypeAttempts === 1) return route.fulfill({ status: 503, body: "Unavailable" });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "sapphire", name: "Sapphire", slug: "sapphire", colorHint: "blue" }])
    });
  });
  await page.route("**/api/v1/locations", async (route) => {
    locationAttempts += 1;
    if (locationAttempts === 1) return route.fulfill({ status: 503, body: "Unavailable" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(["Colombo"]) });
  });

  await page.goto("/post", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
  await expect(page.locator(".post-reference-status.is-error")).toBeVisible();
  await expect(page.locator("#post-gem-type")).toBeDisabled();

  await page.getByRole("button", { name: "Retry" }).click();

  await expect(page.locator("#post-gem-type")).toBeEnabled();
  await expect(page.locator("#post-location")).toBeEnabled();
});

test("Back restores the cached public marketplace surface", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#nav-post").click();
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();

  await page.goBack();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#marketplace-results-search-input")).toBeVisible();
  await expect(page.locator(".market-skeleton")).toHaveCount(0);
});

test("keeps the current public page visible until Post references are ready", async ({ page }) => {
  let releaseReferences: (() => void) | undefined;
  const referencesGate = new Promise<void>((resolve) => {
    releaseReferences = resolve;
  });
  await page.route("**/api/v1/gem-types", async (route) => {
    await referencesGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "sapphire", name: "Sapphire", slug: "sapphire", colorHint: "blue" }])
    });
  });
  await page.route("**/api/v1/locations", async (route) => {
    await referencesGate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(["Colombo"]) });
  });

  await page.goto("/privacy-policy", { waitUntil: "domcontentloaded" });
  await page.locator("#nav-post").click();

  await expect(page).toHaveURL(/\/privacy-policy$/);
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await expect(page.locator("#nav-post")).toHaveAttribute("aria-busy", "true");

  releaseReferences?.();
  await expect(page).toHaveURL(/\/post$/);
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
});

test("keeps stable navigation controls while authentication is unresolved", async ({ page }) => {
  await page.route("**/src/firebase.ts*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `export const authClient = {
      onAuthStateChanged() {
        window.__authObserverCount = (window.__authObserverCount || 0) + 1;
        return () => {};
      },
      signOut: async () => {}
    };`
  }));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#nav-browse")).toBeVisible();
  await expect(page.locator("#nav-post")).toBeVisible();
  await expect(page.locator("#nav-login")).toHaveCount(0);
  await expect(page.getByLabel("Profile menu")).toHaveCount(0);
  await expect(page.locator(".nav-auth-placeholder")).toBeVisible();
  await expect(page.locator(".footer-auth-placeholder")).toBeVisible();

  await page.locator("#nav-post").click();

  await expect(page).toHaveURL(/\/post$/);
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
  await expect(page.locator(".market-skeleton")).toHaveCount(0);
  await expect(page.locator(".nav-auth-placeholder")).toBeVisible();
});

test("replaces unresolved auth controls directly with the signed-in profile", async ({ page }) => {
  await page.route("**/src/firebase.ts*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `const user = {
      uid: "delayed-browser-test",
      email: "delayed@example.com",
      displayName: "Delayed Browser Test",
      getIdToken: async () => "delayed-browser-test-token"
    };
    export const authClient = {
      onAuthStateChanged(callback) {
        window.__resolveCustomerAuth = () => callback(user);
        return () => {};
      },
      signOut: async () => {}
    };`
  }));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".nav-auth-placeholder")).toBeVisible();
  await expect(page.locator("#nav-login")).toHaveCount(0);
  await expect(page.getByLabel("Profile menu")).toHaveCount(0);

  await page.evaluate(() => (window as Window & { __resolveCustomerAuth: () => void }).__resolveCustomerAuth());

  await expect(page.getByLabel("Profile menu")).toBeVisible();
  await expect(page.locator(".nav-auth-placeholder")).toHaveCount(0);
  await expect(page.locator("#nav-login")).toHaveCount(0);
});

test("shows signed-out controls after authentication resolves", async ({ page }) => {
  await page.route("**/src/firebase.ts*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `export const authClient = {
      onAuthStateChanged(callback) {
        callback(null);
        return () => {};
      },
      signOut: async () => {}
    };`
  }));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#nav-login")).toBeVisible();
  await expect(page.locator(".nav-actions .theme-switcher")).toBeVisible();
  await expect(page.locator(".nav-auth-placeholder")).toHaveCount(0);
  await expect(page.getByLabel("Profile menu")).toHaveCount(0);
});

test("signed-in Post transitions keep one auth observer and skip unrelated workflows", async ({ page }) => {
  await page.route("**/src/firebase.ts*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `const user = {
      uid: "browser-test",
      email: "browser@example.com",
      displayName: "Browser Test",
      getIdToken: async () => "browser-test-token"
    };
    export const authClient = {
      onAuthStateChanged(callback) {
        window.__authObserverCount = (window.__authObserverCount || 0) + 1;
        callback(user);
        return () => {};
      },
      signOut: async () => {}
    };`
  }));

  const unexpectedRequests: string[] = [];
  let trackRequests = false;
  page.on("request", (request) => {
    if (!trackRequests) return;
    const pathname = new URL(request.url()).pathname;
    if (["/api/v1/snapshot", "/api/v1/search/listings", "/api/v1/users/me/dashboard", "/api/v1/users/me/reports"].includes(pathname)) {
      unexpectedRequests.push(pathname);
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Profile menu")).toBeVisible();
  trackRequests = true;
  await page.locator("#nav-post").click();
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
  await page.goBack();
  await expect(page.locator("#marketplace-results-search-input")).toBeVisible();
  await page.locator("#nav-post").click();
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();

  expect(unexpectedRequests).toEqual([]);
  await expect.poll(() => page.evaluate(() => (window as Window & { __authObserverCount: number }).__authObserverCount)).toBe(1);
});

test("falls back to a normal Post document navigation when the account chunk fails", async ({ page }) => {
  let documentRequests = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests += 1;
  });
  await page.route("**/src/account-entry.tsx*", (route) => route.abort("failed"));

  await page.goto("/privacy-policy", { waitUntil: "domcontentloaded" });
  const initialDocumentRequests = documentRequests;
  await page.locator("#nav-post").click();

  await expect(page).toHaveURL(/\/post$/);
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
  expect(documentRequests).toBe(initialDocumentRequests + 1);
});

for (const publicPath of ["/gemstones/sapphire", "/sell-gemstones", "/privacy-policy"]) {
  test(`opens Post seamlessly from ${publicPath}`, async ({ page }) => {
    let mainNavigations = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) mainNavigations += 1;
    });

    await page.goto(publicPath, { waitUntil: "domcontentloaded" });
    const initialNavigations = mainNavigations;
    await page.locator("#nav-post").click();

    await expect(page).toHaveURL(/\/post$/);
    await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
    await expect(page.locator(".market-skeleton")).toHaveCount(0);
    expect(mainNavigations).toBe(initialNavigations);
  });
}

test("opens Post seamlessly from a server-rendered listing", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const listingHref = await page.locator(".listing-card-link").first().getAttribute("href");
  expect(listingHref).toBeTruthy();
  await page.goto(listingHref!, { waitUntil: "domcontentloaded" });

  let additionalMainNavigations = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) additionalMainNavigations += 1;
  });
  await page.locator("#nav-post").dispatchEvent("click", { button: 0 });

  await expect(page).toHaveURL(/\/post$/);
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
  expect(additionalMainNavigations).toBe(0);
});
