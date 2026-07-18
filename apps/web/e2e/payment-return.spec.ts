import { expect, test } from "@playwright/test";

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
