import { expect, test, type Route } from "@playwright/test";

test("checkout waits for authoritative trial status and redirects before refreshing the dashboard", async ({ page }) => {
  const accountUser = {
    id: "checkout-user",
    name: "Checkout User",
    phone: "+94770000000",
    address: "Colombo",
    email: "checkout@example.com",
    role: "seller",
    locale: "en",
    status: "active",
    updatedAt: "2026-07-18T00:00:00.000Z"
  };
  const dashboard = {
    user: accountUser,
    settings: {
      userId: accountUser.id,
      theme: "system",
      notificationsEnabled: true,
      language: "en",
      dashboardDefaultView: "seller",
      savedMarketplaceFilters: {}
    },
    conversations: [],
    cartCount: 0,
    recentOrders: [],
    listingSubscriptions: [],
    recentPayments: []
  };
  const plan = {
    id: "pro",
    name: "Pro",
    priceLkr: 1_000,
    includedPhotos: 6,
    extraPhotoPriceLkr: 500,
    validityMonths: 2,
    eyebrow: "Recommended",
    summary: "For active sellers"
  };
  const checkoutSession = {
    token: "checkout-1",
    status: "open",
    draft: {
      title: "Ceylon Blue Sapphire",
      gemTypeId: "sapphire",
      description: "A natural sapphire",
      priceLkr: 250_000,
      location: "Colombo",
      attributes: {
        carat: 2.5,
        dimensions: "8 × 6 mm",
        shape: "Oval",
        cut: "Faceted",
        color: "Blue",
        clarity: "Eye clean",
        origin: "Sri Lanka",
        treatment: "heated",
        certificateStatus: "none"
      }
    },
    media: [{
      id: "photo-1",
      kind: "photo",
      fileName: "sapphire.jpg",
      contentType: "image/jpeg",
      size: 1024,
      blobKey: "checkout/photo-1",
      order: 0
    }],
    selectedPlanId: "pro",
    acceptedPolicies: true,
    expiresAt: "2026-07-19T00:00:00.000Z",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z"
  };
  const fulfillJson = (route: Route, body: unknown) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
  let releaseDashboard: (() => void) | undefined;
  const dashboardGate = new Promise<void>((resolve) => {
    releaseDashboard = resolve;
  });
  let dashboardRequests = 0;

  await page.route("**/api/v1/users/me/dashboard", async (route) => {
    dashboardRequests += 1;
    await dashboardGate;
    await fulfillJson(route, dashboard);
  });
  await page.route("**/api/v1/users/me/reports", (route) => fulfillJson(route, []));
  await page.route("**/api/v1/snapshot", (route) => fulfillJson(route, {
    gemTypes: [{ id: "sapphire", name: "Sapphire", slug: "sapphire", colorHint: "blue" }],
    locations: ["Colombo"],
    listings: [],
    sellers: [],
    conversations: [],
    savedSearches: [],
    content: { safetyTips: [], promotions: [], sellerMetrics: [] },
    subscriptionPlans: [plan]
  }));
  await page.route("**/api/v1/listing-checkout-sessions/checkout-1/complete", (route) => {
    const origin = new URL(route.request().url()).origin;
    return fulfillJson(route, {
      mode: "payment",
      paymentIntent: { id: "attempt-1", status: "pending", paymentUrl: `${origin}/hosted-checkout` }
    });
  });
  await page.route("**/api/v1/listing-checkout-sessions/checkout-1", (route) => fulfillJson(route, checkoutSession));
  await page.route("**/hosted-checkout", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>Hosted checkout</title><h1>Hosted checkout</h1>"
  }));
  await page.route("**/src/firebase.ts*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `const user = {
      uid: "checkout-user",
      email: "checkout@example.com",
      displayName: "Checkout User",
      getIdToken: async () => "checkout-user-token"
    };
    export const authClient = {
      onAuthStateChanged(callback) {
        callback(user);
        return () => {};
      },
      signOut: async () => {}
    };`
  }));

  await page.goto("/post/checkout/checkout-1", { waitUntil: "domcontentloaded" });
  const checkoutButton = page.getByRole("button", { name: "Checking trial eligibility..." });
  await expect(checkoutButton).toBeVisible();
  await expect(checkoutButton).toBeDisabled();
  await expect(page.locator(".listing-checkout-total-price")).toContainText("—");

  releaseDashboard?.();
  await expect(page.getByRole("button", { name: "Proceed to Payment" })).toBeEnabled();
  await page.getByRole("button", { name: "Proceed to Payment" }).click();

  await expect(page).toHaveURL(/\/hosted-checkout$/);
  await expect(page.getByRole("heading", { name: "Hosted checkout" })).toBeVisible();
  expect(dashboardRequests).toBe(1);
});
