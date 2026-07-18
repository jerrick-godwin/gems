import { expect, test, type Route } from "@playwright/test";

test("an incomplete payment return displays its notice on My Listings", async ({ page }) => {
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

  await page.goto("/listings?payment=cancelled", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/listings$/);
  await expect(page.locator(".payment-notice-warning")).toContainText(
    "Checkout was cancelled. Your listing is still saved, and you can restart payment from My Listings."
  );
});

test("a receipt identifier survives sign-in and opens the full receipt", async ({ page }) => {
  const accountUser = {
    id: "receipt-user",
    name: "Receipt User",
    phone: "+94770000000",
    address: "Colombo",
    email: "receipt@example.com",
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
  const receipt = {
    paymentIntentId: "intent/keep-query",
    receiptNumber: "GL-2026-0001",
    status: "succeeded",
    paidAt: "2026-07-18T04:30:00.000Z",
    customer: { name: "Receipt User", email: "receipt@example.com" },
    listing: { id: "listing-1", title: "Ceylon Blue Sapphire" },
    subscription: {
      id: "subscription-1",
      planName: "Pro",
      startsAt: "2026-07-18T04:30:00.000Z",
      expiresAt: "2026-10-18T04:30:00.000Z"
    },
    currency: "LKR",
    lineItems: [{ label: "Pro listing subscription", quantity: 1, amountLkr: 15000 }],
    totalLkr: 15000,
    stripe: { invoiceId: "in_test_1" },
    createdAt: "2026-07-18T04:30:00.000Z",
    updatedAt: "2026-07-18T04:30:00.000Z"
  };
  const fulfillJson = (route: Route, body: unknown) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body)
  });

  await page.route("**/api/v1/users/me/dashboard", (route) => fulfillJson(route, dashboard));
  await page.route("**/api/v1/users/me/reports", (route) => fulfillJson(route, []));
  await page.route("**/api/v1/payment-attempts/**/status", (route) => fulfillJson(route, {
    id: "intent/keep-query",
    status: "succeeded"
  }));
  await page.route("**/api/v1/users/me/payment-intents/**/receipt", (route) => fulfillJson(route, receipt));
  await page.route("**/api/v1/snapshot", (route) => fulfillJson(route, {
    gemTypes: [],
    locations: [],
    listings: [],
    sellers: [],
    conversations: [],
    savedSearches: [],
    content: { safetyTips: [], promotions: [], sellerMetrics: [] },
    subscriptionPlans: []
  }));
  await page.route("**/src/firebase.ts*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `const user = {
      uid: "receipt-user",
      email: "receipt@example.com",
      displayName: "Receipt User",
      getIdToken: async () => "receipt-user-token"
    };
    let observer;
    export const authClient = {
      onAuthStateChanged(callback) {
        observer = callback;
        callback(null);
        return () => {};
      },
      signIn: async () => {
        observer(user);
        return user;
      },
      signOut: async () => {}
    };`
  }));

  await page.goto("/receipt?paymentIntentId=intent%2Fkeep-query", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Sign in to continue" })).toBeVisible();

  const expectedReturnTo = "/receipt?paymentIntentId=intent%2Fkeep-query";
  await page.locator(".auth-switch").getByRole("link", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(expectedReturnTo);

  await page.locator(".auth-switch").getByRole("link", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Forgot password?" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(expectedReturnTo);

  await page.getByRole("link", { name: "Back to sign in" }).click();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(expectedReturnTo);

  await page.getByPlaceholder("you@example.com").fill("receipt@example.com");
  await page.getByPlaceholder("Your password").fill("secret1");
  await page.locator("#login-page-submit").click();

  await expect(page).toHaveURL(/\/receipt\?paymentIntentId=intent%2Fkeep-query$/);
  await expect(page.getByRole("heading", { name: "Thank you for your payment!" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Receipt line items" })).toContainText("Pro listing subscription");
  await expect(page.getByRole("button", { name: "My Listings" })).toBeVisible();
});
