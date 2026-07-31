import { expect, test, type Route } from "@playwright/test";

test("failed listing payment shows its status and opens payment recovery", async ({ page }, testInfo) => {
  const user = {
    id: "payment-user",
    name: "Payment User",
    phone: "+94770000000",
    address: "Colombo",
    email: "payment@example.com",
    role: "seller",
    locale: "en",
    status: "active",
    updatedAt: "2026-07-31T00:00:00.000Z"
  };
  const plan = {
    id: "plan-1",
    name: "Standard",
    priceLkr: 1000,
    includedPhotos: 3,
    extraPhotoPriceLkr: 100,
    validityMonths: 1,
    eyebrow: "Standard",
    summary: "Standard listing"
  };
  const listing = {
    id: "listing-1",
    sellerId: "seller-1",
    gemTypeId: "gem-1",
    title: "Blue Sapphire",
    description: "A test listing",
    priceLkr: 250000,
    negotiable: false,
    location: "Colombo",
    status: "pending_review",
    moderationStatus: "queued",
    attributes: { carat: 1, dimensions: "1x1", shape: "Oval", cut: "Brilliant", color: "Blue", clarity: "Eye clean", origin: "Sri Lanka", treatment: "untreated", certificateStatus: "none" },
    media: [{ id: "media-1", kind: "photo", url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='240'%3E%3Crect width='320' height='240' fill='%23d9ae00'/%3E%3C/svg%3E", order: 0 }],
    promoted: [],
    campaigns: [],
    stats: { views: 0, saves: 0, phoneReveals: 0, chats: 0, whatsappClicks: 0 },
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z"
  };
  const liveListing = {
    ...listing,
    id: "listing-live",
    title: "Natural Garnet",
    priceLkr: 2236618,
    status: "live",
    moderationStatus: "approved",
    attributes: { ...listing.attributes, carat: 57.45 },
    media: [{ ...listing.media[0], id: "media-live" }]
  };
  const rejectedListing = {
    ...listing,
    id: "listing-rejected",
    title: "Natural Blue Ceylon Sapphire",
    priceLkr: 546765,
    status: "rejected",
    moderationStatus: "rejected",
    rejectionReason: "The listing needs clearer certificate details.",
    attributes: { ...listing.attributes, carat: 57.8 },
    media: [{ ...listing.media[0], id: "media-rejected" }]
  };
  const dashboard = {
    user,
    settings: { userId: user.id, theme: "system", notificationsEnabled: true, language: "en", dashboardDefaultView: "seller", savedMarketplaceFilters: {} },
    conversations: [],
    cartCount: 0,
    recentOrders: [],
    listingSubscriptions: [
      {
        id: "sub-live",
        userId: user.id,
        listingId: liveListing.id,
        planId: plan.id,
        status: "active",
        source: "paid",
        autoRenew: true,
        paymentStatus: "paid",
        expiresAt: "2026-08-05T00:00:00.000Z",
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt
      },
      {
        id: "sub-rejected",
        userId: user.id,
        listingId: rejectedListing.id,
        planId: plan.id,
        status: "active",
        source: "paid",
        autoRenew: false,
        paymentStatus: "paid",
        expiresAt: "2026-08-28T00:00:00.000Z",
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt
      },
      {
        id: "sub-1",
        userId: user.id,
        listingId: listing.id,
        planId: plan.id,
        status: "past_due",
        source: "paid",
        autoRenew: true,
        paymentIntentId: "pay-1",
        paymentStatus: "failed",
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt
      }
    ],
    recentPayments: []
  };
  const listingPage = { items: [liveListing, rejectedListing, listing], total: 11, page: 1, limit: 10, totalPages: 2 };
  const snapshot = {
    gemTypes: [{ id: "gem-1", name: "Sapphire", slug: "sapphire" }],
    locations: ["Colombo"],
    listings: [],
    sellers: [],
    conversations: [],
    savedSearches: [],
    content: { safetyTips: [], promotions: [], sellerMetrics: [] },
    subscriptionPlans: [plan]
  };
  const fulfillJson = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  let recoveryRequests = 0;
  const listingRequestUrls: string[] = [];

  await page.route("**/api/v1/users/me/dashboard", (route) => fulfillJson(route, dashboard));
  await page.route("**/api/v1/users/me/listings?*", (route) => {
    listingRequestUrls.push(route.request().url());
    return fulfillJson(route, listingPage);
  });
  await page.route("**/api/v1/users/me/reports", (route) => fulfillJson(route, []));
  await page.route("**/api/v1/snapshot", (route) => fulfillJson(route, snapshot));
  await page.route("**/api/v1/search/listings?*", (route) => fulfillJson(route, listingPage));
  await page.route("**/api/v1/listing-subscriptions/sub-1/pay", (route) => {
    recoveryRequests += 1;
    expect(route.request().method()).toBe("POST");
    const origin = new URL(route.request().url()).origin;
    return fulfillJson(route, { checkoutUrl: `${origin}/listings?payment=cancelled`, paymentStatus: "failed", subscriptionStatus: "past_due" });
  });
  await page.route("**/src/firebase.ts*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `const user = { uid: "payment-user", email: "payment@example.com", displayName: "Payment User", getIdToken: async () => "payment-token" };
      export const authClient = { onAuthStateChanged(callback) { callback(user); return () => {}; }, signOut: async () => {} };`
  }));

  await page.goto("/listings", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("In review", { exact: true })).toBeVisible();
  const paymentRow = page.locator(".seller-listing-row").filter({ hasText: "Blue Sapphire" });
  await expect(paymentRow.getByText("Payment required")).toBeVisible();
  const payNow = page.getByRole("button", { name: "Pay Now" });
  await expect(payNow).toBeVisible();
  await expect(payNow).toHaveCSS("color", "rgb(0, 0, 0)");
  const cardBox = await paymentRow.boundingBox();
  const imageBox = await paymentRow.locator(".seller-listing-image-wrapper").boundingBox();
  const actionsBox = await paymentRow.locator(".seller-listing-row-actions").boundingBox();
  expect(cardBox?.height).toBeLessThan(260);
  expect(actionsBox?.x ?? 0).toBeGreaterThanOrEqual((imageBox?.x ?? 0) + (imageBox?.width ?? 0));

  const requestsBeforeNext = listingRequestUrls.length;
  await page.getByRole("button", { name: "Next page" }).click();
  await expect.poll(() => listingRequestUrls.slice(requestsBeforeNext).some((url) => new URL(url).searchParams.get("page") === "2")).toBe(true);

  const statusFilters = [
    ["All", null],
    ["Live", "live"],
    ["In review", "pending_review"],
    ["Promoted", "promoted"],
    ["Paused", "paused"],
    ["Draft", "draft"],
    ["Rejected", "rejected"],
    ["Closed", "expired"]
  ] as const;
  for (const [label, status] of statusFilters) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect.poll(() => new URL(listingRequestUrls.at(-1) ?? "http://invalid").searchParams.get("status")).toBe(status);
    await expect.poll(() => new URL(listingRequestUrls.at(-1) ?? "http://invalid").searchParams.get("page")).toBe("1");
  }

  await page.getByRole("searchbox", { name: "Search your listings" }).fill("Blue Sapphire");
  await expect.poll(() => new URL(listingRequestUrls.at(-1) ?? "http://invalid").searchParams.get("search")).toBe("Blue Sapphire");
  await page.getByLabel("Gem type").selectOption("gem-1");
  await expect.poll(() => new URL(listingRequestUrls.at(-1) ?? "http://invalid").searchParams.get("gemTypeId")).toBe("gem-1");
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect.poll(() => {
    const params = new URL(listingRequestUrls.at(-1) ?? "http://invalid").searchParams;
    return [params.get("search"), params.get("status"), params.get("gemTypeId")];
  }).toEqual([null, null, null]);

  const details = paymentRow.getByText("Details", { exact: true });
  await details.click();
  await expect(paymentRow.locator(".seller-listing-attributes").getByText("Gem type", { exact: true })).toBeVisible();

  const more = page.getByRole("button", { name: "More actions for Blue Sapphire" });
  await more.click();
  await expect(paymentRow.locator(".seller-listing-attributes")).toBeHidden();
  await expect(page.getByRole("menuitem", { name: "Delete listing" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await more.click();
  await page.getByRole("menuitem", { name: "Delete listing" }).click();
  await expect(page.getByRole("dialog", { name: "Delete listing" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Delete listing" })).toBeHidden();
  await expect(more).toBeFocused();

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((nextTheme) => { document.documentElement.dataset.theme = nextTheme; }, theme);
    for (const width of [1280, 1024, 880, 760, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      if (width > 900) {
        const stateBoxes = await page.locator(".seller-listing-states").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().x));
        const priceRightEdges = await page.locator(".seller-listing-price-block").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().right));
        const actionRightEdges = await page.locator(".seller-listing-row-actions").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().right));
        expect(Math.max(...stateBoxes) - Math.min(...stateBoxes)).toBeLessThanOrEqual(1);
        expect(Math.max(...priceRightEdges) - Math.min(...priceRightEdges)).toBeLessThanOrEqual(1);
        expect(Math.max(...actionRightEdges) - Math.min(...actionRightEdges)).toBeLessThanOrEqual(1);

        const liveAccessHeight = await page.locator(".seller-listing-row").filter({ hasText: "Natural Garnet" }).locator(".seller-listing-access-copy").evaluate((element) => element.getBoundingClientRect().height);
        const rejectedAccessHeight = await page.locator(".seller-listing-row").filter({ hasText: "Natural Blue Ceylon Sapphire" }).locator(".seller-listing-access-copy").evaluate((element) => element.getBoundingClientRect().height);
        expect(rejectedAccessHeight).toBeGreaterThan(liveAccessHeight);
      } else {
        await expect(page.locator(".seller-listing-row").first()).toHaveCSS("grid-template-areas", /image identity/);
      }
      if (width <= 760) {
        await expect(page.locator(".seller-listings-status-tabs")).toBeHidden();
      } else {
        await expect(page.locator(".seller-listings-status-tabs")).toBeVisible();
      }
      const visibleTargets = page.locator(".seller-listings-page button:visible, .seller-listings-page select:visible, .seller-listings-page input:visible, .seller-listings-page summary:visible");
      const targetCount = await visibleTargets.count();
      for (let index = 0; index < targetCount; index += 1) {
        const box = await visibleTargets.nth(index).boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: testInfo.outputPath(`my-listings-${theme}-${width}.png`), fullPage: true });
    }
  }

  await payNow.click();
  await expect.poll(() => recoveryRequests).toBe(1);
  await expect(page).toHaveURL(/\/listings$/);
  await expect(paymentRow.getByText("Payment required")).toBeVisible();
});
