import { expect, test, type Route } from "@playwright/test";

const phoneViewport = { width: 390, height: 844 };

test("desktop keeps the primary navigation visible without the mobile trigger", async ({ page }) => {
  const hydrationWarnings: string[] = [];
  page.on("console", (message) => {
    if (/aria-controls.*did not match|hydration mismatch/i.test(message.text())) hydrationWarnings.push(message.text());
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");

  await expect(page.locator("#nav-mobile-menu")).toBeHidden();
  await expect(page.locator("#nav-mobile-menu")).toHaveAttribute("aria-controls", "nav-mobile-menu-panel");
  await expect(page.locator("#nav-mobile-menu-panel")).toHaveCount(1);
  await expect(page.locator("#nav-mobile-context-action")).toBeHidden();
  await expect(page.locator("#nav-browse")).toBeVisible();
  await expect(page.locator("#nav-post")).toBeVisible();
  expect(await page.locator(".nav-menu-section-title").evaluateAll((elements) => elements.every((element) => element.getClientRects().length === 0))).toBe(true);
  expect(await page.locator(".nav-guide-card").evaluateAll((elements) => elements.every((element) => element.getClientRects().length === 0))).toBe(true);
  await expect(page.locator(".nav-menu-theme-dock")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Theme preference" })).toHaveCount(1);
  expect(hydrationWarnings).toEqual([]);
});

test("mobile header action switches between posting and marketplace listings", async ({ page }) => {
  await page.setViewportSize(phoneViewport);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const headerAction = page.locator("#nav-mobile-context-action");
  const menuButton = page.locator("#nav-mobile-menu");
  await expect(headerAction).toBeVisible();
  await expect(headerAction).toHaveText("Post a Gem");
  await expect(headerAction).toHaveAttribute("href", "/post");
  const actionBox = await headerAction.boundingBox();
  const menuBox = await menuButton.boundingBox();
  expect((actionBox?.x ?? 0) + (actionBox?.width ?? 0)).toBeLessThanOrEqual(menuBox?.x ?? 0);

  await headerAction.click();
  await expect(page).toHaveURL(/\/post$/);
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
  await expect(headerAction).toHaveText("Back to Listings");
  await expect(headerAction).toHaveAttribute("href", "/");

  await page.setViewportSize({ width: 320, height: 720 });
  const compactBrandBox = await page.locator(".customer-topbar-inner .brand").boundingBox();
  const compactActionBox = await headerAction.boundingBox();
  const compactMenuBox = await menuButton.boundingBox();
  expect((compactBrandBox?.x ?? 0) + (compactBrandBox?.width ?? 0)).toBeLessThanOrEqual(compactActionBox?.x ?? 0);
  expect((compactActionBox?.x ?? 0) + (compactActionBox?.width ?? 0)).toBeLessThanOrEqual(compactMenuBox?.x ?? 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await headerAction.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#marketplace-results-search-input")).toBeVisible();
  await expect(headerAction).toHaveText("Post a Gem");
});

test("marketplace SEO banner moves below the complete marketplace only on mobile", async ({ page }) => {
  const hydrationWarnings: string[] = [];
  page.on("console", (message) => {
    if (/hydration|did not match/i.test(message.text())) hydrationWarnings.push(message.text());
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const seoIntro = page.locator(".marketplace-seo-intro");
  const marketGrid = page.locator(".market-grid");
  await expect(seoIntro).toHaveCount(1);
  await expect(page.locator(".marketplace-seo-placement-top")).toBeVisible();
  await expect(page.locator(".marketplace-seo-placement-bottom")).toHaveCount(0);
  await expect(page.locator(".marketplace-seo-mobile-summary")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Buy and Sell Gemstones Worldwide with Gemslanka" })).toBeVisible();
  expect((await seoIntro.boundingBox())?.y).toBeLessThan((await marketGrid.boundingBox())?.y ?? 0);

  await page.setViewportSize(phoneViewport);
  await expect(page.locator(".marketplace-seo-placement-top")).toHaveCount(0);
  await expect(page.locator(".marketplace-seo-placement-bottom")).toBeVisible();
  await expect(seoIntro).toHaveCount(1);
  await expect(seoIntro.getByRole("link")).toHaveCount(4);
  const mobileIntroBox = await seoIntro.boundingBox();
  const mobileGridBox = await marketGrid.boundingBox();
  expect(mobileIntroBox?.y).toBeGreaterThanOrEqual((mobileGridBox?.y ?? 0) + (mobileGridBox?.height ?? 0));

  await page.setViewportSize({ width: 900, height: 844 });
  await expect(page.locator(".marketplace-seo-placement-top")).toBeVisible();
  await expect(page.locator(".marketplace-seo-placement-bottom")).toHaveCount(0);
  await expect(seoIntro).toHaveCount(1);
  expect(hydrationWarnings).toEqual([]);
});

test("mobile guide cards open their canonical SSR landing pages", async ({ page }) => {
  await page.setViewportSize(phoneViewport);
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
  const guides = [
    ["Gemstone Types", "/gemstones", "Explore Gemstone Types and Marketplace Listings"],
    ["Buying Guide", "/guides/buying-gemstones-online", "A Practical Guide to Buying Gemstones Online"],
    ["Certificates & Treatments", "/guides/gemstone-certification-and-treatments", "Gemstone Certification, Lab Reports, and Treatments"],
    ["About Gemslanka", "/about-us", "A Sri Lankan Gemstone Marketplace with Global Reach"]
  ] as const;

  for (const [label, path, heading] of guides) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("#nav-mobile-menu").click();
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}$`));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.locator("#nav-mobile-menu")).toHaveAttribute("aria-expanded", "false");
  }
});

test("signed-out mobile navigation exposes all controls and dismisses accessibly", async ({ page }) => {
  await page.setViewportSize(phoneViewport);
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
  const menuButton = page.locator("#nav-mobile-menu");
  const primaryNavigation = page.getByRole("navigation", { name: "Primary" });

  await expect(menuButton).toBeVisible();
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(menuButton).toHaveAttribute("aria-controls", "nav-mobile-menu-panel");
  await expect(menuButton).toHaveAccessibleName("Open navigation menu");
  await expect(menuButton.locator(".lucide-menu")).toBeVisible();
  await expect(menuButton.locator(".lucide-x")).toHaveCount(0);
  await expect(page.locator(".mobile-nav-overlay")).toHaveCount(0);
  await expect(page.locator("#nav-browse")).toBeHidden();
  await expect(page.locator("#nav-post")).toBeHidden();
  await expect(page.locator("#nav-login")).toBeHidden();

  await menuButton.click();

  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(menuButton).toHaveAccessibleName("Close navigation menu");
  await expect(menuButton.locator(".lucide-x")).toBeVisible();
  await expect(menuButton.locator(".lucide-menu")).toHaveCount(0);
  const menuPanel = page.locator("#nav-mobile-menu-panel");
  await expect(page.locator(".mobile-nav-overlay")).toHaveCount(0);
  await expect(page.locator("html")).toHaveClass(/mobile-nav-open/);
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
  await expect(page.locator("#nav-browse")).toBeVisible();
  await expect(page.locator("#nav-post")).toBeVisible();
  await expect(page.locator("#nav-login")).toBeVisible();
  for (const sectionName of ["Marketplace", "Guides", "Account"]) {
    await expect(primaryNavigation.getByRole("heading", { name: sectionName, exact: true })).toBeVisible();
  }
  const guideCards = primaryNavigation.locator(".nav-guide-card");
  await expect(guideCards).toHaveCount(4);
  await expect(guideCards.nth(0)).toHaveAttribute("href", "/gemstones");
  await expect(guideCards.nth(1)).toHaveAttribute("href", "/guides/buying-gemstones-online");
  await expect(guideCards.nth(2)).toHaveAttribute("href", "/guides/gemstone-certification-and-treatments");
  await expect(guideCards.nth(3)).toHaveAttribute("href", "/about-us");
  const guideBoxes = await guideCards.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { width: Math.round(box.width), height: Math.round(box.height) };
  }));
  expect(new Set(guideBoxes.map((box) => box.width)).size).toBe(1);
  expect(new Set(guideBoxes.map((box) => box.height)).size).toBe(1);
  expect(guideBoxes.every((box) => box.height >= 44)).toBe(true);
  await expect(page.getByRole("group", { name: "Theme preference" })).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Theme preference" })).toBeVisible();
  for (const themeName of ["Use light theme", "Use system theme", "Use dark theme"]) {
    await expect(page.getByRole("button", { name: themeName })).toHaveCSS("height", "44px");
  }
  const headerBox = await page.locator(".topbar").boundingBox();
  const panelBox = await menuPanel.boundingBox();
  expect(panelBox?.x).toBe(0);
  expect(panelBox?.width).toBe(phoneViewport.width);
  expect(Math.abs((panelBox?.y ?? 0) - (headerBox?.height ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((panelBox?.height ?? 0) - (phoneViewport.height - (headerBox?.height ?? 0)))).toBeLessThanOrEqual(1);
  await expect(menuPanel).toHaveCSS("position", "fixed");
  await expect(menuPanel).toHaveCSS("border-radius", "0px");
  await expect(menuPanel).toHaveCSS("box-shadow", "none");
  const actionBoxes = await page.locator("#nav-browse, #nav-post, #nav-login").evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { x: Math.round(box.x), width: Math.round(box.width), height: Math.round(box.height) };
  }));
  expect(new Set(actionBoxes.map((box) => box.x)).size).toBe(1);
  expect(new Set(actionBoxes.map((box) => box.width)).size).toBe(1);
  expect(actionBoxes.every((box) => box.height === 52)).toBe(true);
  const themeWidths = await page.getByRole("group", { name: "Theme preference" }).getByRole("button").evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().width)));
  expect(Math.max(...themeWidths) - Math.min(...themeWidths)).toBeLessThanOrEqual(1);
  const themeBox = await page.getByRole("group", { name: "Theme preference" }).boundingBox();
  const accountBox = await page.locator(".nav-menu-section-account").boundingBox();
  expect(themeBox?.y).toBeGreaterThan((accountBox?.y ?? 0) + (accountBox?.height ?? 0));
  expect(Math.abs((themeBox?.x ?? 0) + (themeBox?.width ?? 0) / 2 - phoneViewport.width / 2)).toBeLessThanOrEqual(1);
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Use dark theme" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menuButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#nav-browse")).toBeFocused();

  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.keyboard.press("Escape");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(menuButton).toBeFocused();
  await expect(menuButton.locator(".lucide-menu")).toBeVisible();
  await expect(page.locator(".mobile-nav-overlay")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/mobile-nav-open/);

  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  const openPanelBox = await menuPanel.boundingBox();
  await menuPanel.click({ position: { x: 6, y: Math.max(6, (openPanelBox?.height ?? 12) - 6) } });
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");

  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await page.setViewportSize({ width: 900, height: 844 });
  await expect(menuButton).toBeHidden();
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#nav-browse")).toBeVisible();
  await page.setViewportSize(phoneViewport);
  await expect(menuButton).toBeVisible();
  await expect(page.locator("#nav-browse")).toBeHidden();

  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await page.locator("#nav-post").click();
  await expect(page).toHaveURL(/\/post$/);
  await expect(page.getByRole("heading", { name: "Post a Gem Listing" })).toBeVisible();
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");

  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#marketplace-results-search-input")).toBeVisible();

  await menuButton.click();
  await page.locator("#nav-login").click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");

  await menuButton.click();
  await page.locator("#nav-browse").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#marketplace-results-search-input")).toBeVisible();
});

test("signed-in mobile navigation flattens account actions into the same menu", async ({ page }) => {
  await page.setViewportSize(phoneViewport);
  const accountUser = {
    id: "mobile-menu-user",
    name: "Mobile Menu User",
    phone: "+94770000000",
    address: "Colombo",
    email: "mobile@example.com",
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
  const marketplaceSnapshot = {
    gemTypes: [],
    locations: [],
    listings: [],
    sellers: [],
    conversations: [],
    savedSearches: [],
    content: { safetyTips: [], promotions: [], sellerMetrics: [] },
    subscriptionPlans: []
  };
  const emptyListingPage = { items: [], total: 0, page: 1, limit: 10, totalPages: 1 };
  const fulfillJson = (route: Route, body: unknown) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
  await page.route("**/api/v1/users/me/dashboard", (route) => fulfillJson(route, dashboard));
  await page.route("**/api/v1/users/me/reports", (route) => fulfillJson(route, []));
  await page.route("**/api/v1/users/me/listings?*", (route) => fulfillJson(route, emptyListingPage));
  await page.route("**/api/v1/snapshot", (route) => fulfillJson(route, marketplaceSnapshot));
  await page.route("**/api/v1/search/listings?*", (route) => fulfillJson(route, emptyListingPage));
  await page.route("**/src/firebase.ts*", (route) => route.fulfill({
    contentType: "application/javascript",
    body: `const user = {
      uid: "mobile-menu-user",
      email: "mobile@example.com",
      displayName: "Mobile Menu User",
      getIdToken: async () => "mobile-menu-token"
    };
    window.__mobileAuthUser = localStorage.getItem("mobile-menu-signed-out") === "true" ? null : user;
    export const authClient = {
      onAuthStateChanged(callback) {
        window.__mobileAuthCallback = callback;
        callback(window.__mobileAuthUser);
        return () => {};
      },
      signOut: () => {
        window.__mobileSignOutCalls = (window.__mobileSignOutCalls || 0) + 1;
        return new Promise((resolve) => {
          window.__resolveMobileSignOut = () => {
            localStorage.setItem("mobile-menu-signed-out", "true");
            window.__mobileAuthUser = null;
            window.__mobileAuthCallback?.(null);
            resolve();
          };
        });
      }
    };`
  }));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const menuButton = page.locator("#nav-mobile-menu");
  const primaryNavigation = page.getByRole("navigation", { name: "Primary" });
  await menuButton.click();

  await expect(primaryNavigation.getByText("Mobile Menu User", { exact: true })).toBeVisible();
  await expect(primaryNavigation.getByText("mobile@example.com", { exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "My Listings", exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "My Reports", exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole("button", { name: "Sign Out", exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole("group", { name: "Theme preference" })).toHaveCount(1);
  await expect(primaryNavigation.getByRole("group", { name: "Theme preference" })).toBeVisible();
  await expect(primaryNavigation.locator(".profile-theme-row")).toHaveCount(0);
  await expect(primaryNavigation.getByLabel("Profile menu")).toBeHidden();
  await expect(page.locator(".mobile-nav-overlay")).toHaveCount(0);

  const signedInActionBoxes = await primaryNavigation.locator("#nav-browse, #nav-post, .menu-item").evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { x: Math.round(box.x), width: Math.round(box.width), height: Math.round(box.height) };
  }));
  expect(new Set(signedInActionBoxes.map((box) => box.x)).size).toBe(1);
  expect(new Set(signedInActionBoxes.map((box) => box.width)).size).toBe(1);
  expect(signedInActionBoxes.every((box) => box.height === 52)).toBe(true);

  await page.setViewportSize({ width: 390, height: 400 });
  const menuPanel = primaryNavigation.locator(".nav-menu-panel");
  const menuSections = primaryNavigation.locator(".mobile-nav-menu-sections");
  const themeDock = primaryNavigation.locator(".nav-menu-theme-dock");
  await expect(menuPanel).toHaveCSS("overflow", "hidden");
  await expect(menuSections).toHaveCSS("overflow-y", "auto");
  expect(await menuSections.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const dockBeforeScroll = await themeDock.boundingBox();
  await menuSections.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const dockAfterScroll = await themeDock.boundingBox();
  const sectionsBox = await menuSections.boundingBox();
  expect(Math.abs((dockAfterScroll?.y ?? 0) - (dockBeforeScroll?.y ?? 0))).toBeLessThanOrEqual(1);
  expect((sectionsBox?.y ?? 0) + (sectionsBox?.height ?? 0)).toBeLessThanOrEqual(dockAfterScroll?.y ?? 0);
  await page.setViewportSize(phoneViewport);

  await primaryNavigation.getByRole("button", { name: "Use dark theme" }).click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(primaryNavigation.getByRole("button", { name: "Use dark theme" })).toHaveCSS("height", "44px");

  await primaryNavigation.getByRole("link", { name: "My Listings", exact: true }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("No listings found.", { exact: true })).toBeVisible();

  await menuButton.click();
  await primaryNavigation.getByRole("link", { name: "My Reports", exact: true }).click();
  await expect(page).toHaveURL(/\/reports$/);
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { name: "No reports found", exact: true })).toBeVisible();

  await menuButton.click();
  await primaryNavigation.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("mobile@example.com");

  await menuButton.click();
  await primaryNavigation.getByRole("button", { name: "Sign Out", exact: true }).click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => page.evaluate(() => (window as Window & { __mobileSignOutCalls?: number }).__mobileSignOutCalls)).toBe(1);

  await page.evaluate(() => (window as Window & { __resolveMobileSignOut?: () => void }).__resolveMobileSignOut?.());
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#nav-login")).toHaveCount(1);
  await menuButton.click();
  await expect(primaryNavigation.getByRole("link", { name: "Sign In", exact: true })).toBeVisible();
});
