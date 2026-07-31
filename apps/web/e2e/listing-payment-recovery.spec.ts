import { expect, test, type Route } from "@playwright/test";

test("failed listing payment shows its status and opens payment recovery", async ({ page }) => {
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
  const dashboard = {
    user,
    settings: { userId: user.id, theme: "system", notificationsEnabled: true, language: "en", dashboardDefaultView: "seller", savedMarketplaceFilters: {} },
    conversations: [],
    cartCount: 0,
    recentOrders: [],
    listingSubscriptions: [{
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
    }],
    recentPayments: []
  };
  const listingPage = { items: [listing], total: 1, page: 1, limit: 10, totalPages: 1 };
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

  await page.route("**/api/v1/users/me/dashboard", (route) => fulfillJson(route, dashboard));
  await page.route("**/api/v1/users/me/listings?*", (route) => fulfillJson(route, listingPage));
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

  await expect(page.getByText("Payment Failed", { exact: true })).toBeVisible();
  await expect(page.getByText(/payment failed/i)).toHaveCount(1);
  await expect(page.getByText("· Suspended", { exact: true })).toBeVisible();
  const payNow = page.getByRole("button", { name: "Pay Now" });
  await expect(payNow).toBeVisible();
  await expect(payNow).toHaveCSS("color", "rgb(0, 0, 0)");
  const cardBox = await page.locator(".seller-listing-card").boundingBox();
  const imageBox = await page.locator(".seller-listing-image-wrapper").boundingBox();
  const actionsBox = await page.locator(".seller-listing-actions-row").boundingBox();
  expect(cardBox?.height).toBeLessThan(340);
  expect(actionsBox?.x ?? 0).toBeGreaterThanOrEqual((imageBox?.x ?? 0) + (imageBox?.width ?? 0));
  await payNow.click();
  await expect.poll(() => recoveryRequests).toBe(1);
  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.getByText("Payment Failed", { exact: true })).toBeVisible();
});
