import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const source = (path: string) => readFileSync(`${webRoot}/${path}`, "utf8");

test("CSS cascade layers and shared layout tokens are declared once", () => {
  const globalCss = source("src/styles/global.css");
  const foundationCss = source("src/styles/foundations/base.css");
  const layoutCss = source("src/styles/utilities/layout.css");
  const responsiveCss = source("src/styles/utilities/responsive.css");

  assert.match(globalCss, /@layer foundations, atoms, molecules, organisms, pages, utilities;/);
  assert.match(globalCss, /cards\.css" layer\(molecules\)/);
  assert.match(globalCss, /search\.css" layer\(molecules\)/);
  assert.match(foundationCss, /--layout-wide:\s*1180px/);
  assert.match(foundationCss, /--layout-prose:\s*840px/);
  assert.match(foundationCss, /--layout-gutter:\s*clamp\(14px,\s*2vw,\s*24px\)/);
  assert.match(foundationCss, /--section-gap:\s*clamp\(24px,\s*4vw,\s*48px\)/);
  assert.match(foundationCss, /--topbar-h:\s*80px/);
  assert.match(responsiveCss, /@media \(max-width:\s*760px\)[\s\S]*?\.nav-actions\s*>\s*\.mobile-nav-toggle\s*\{[\s\S]*?display:\s*inline-flex/);
  assert.match(responsiveCss, /\.nav-menu-panel\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*var\(--topbar-h\) 0 0;[\s\S]*?display:\s*none[\s\S]*?width:\s*100vw/);
  assert.match(responsiveCss, /\.nav-menu-panel\.is-open\s*\{[\s\S]*?display:\s*grid/);
  assert.doesNotMatch(responsiveCss, /\.mobile-nav-overlay/);
  assert.match(responsiveCss, /html\.mobile-nav-open,[\s\S]*?html\.mobile-nav-open body\s*\{[^}]*overflow:\s*hidden/);
  assert.match(responsiveCss, /\.nav-menu-panel \.theme-option\s*\{[^}]*height:\s*36px;[^}]*min-height:\s*36px/);
  assert.match(responsiveCss, /\.mobile-nav-menu-sections\s*\{[^}]*overflow-y:\s*auto;[^}]*flex-direction:\s*column/);
  assert.match(responsiveCss, /\.nav-guide-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(responsiveCss, /\.nav-guide-card\s*\{[^}]*height:\s*92px;[^}]*min-height:\s*92px/);
  assert.match(responsiveCss, /\.nav-menu-theme-dock\s*\{[^}]*justify-content:\s*center;[^}]*border-top:\s*1px solid var\(--line-subtle\)/);
  assert.match(responsiveCss, /\.customer-topbar-inner\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
  const wideLayoutRule = layoutCss.match(/\.site-footer-inner,[\s\S]*?\n\}/)?.[0] ?? "";
  for (const selector of [
    ".seo-page",
    ".marketplace-seo-intro",
    ".category-seo-intro",
    ".policy-page",
    ".seo-prose",
    ".gemstone-directory-card",
    ".seo-marketplace-notice"
  ]) {
    assert.match(wideLayoutRule, new RegExp(selector.replace(".", "\\.")));
  }
  assert.match(wideLayoutRule, /max-width:\s*var\(--layout-wide\)/);
  const seoCss = source("src/styles/pages/seo.css");
  const appShellCss = source("src/styles/organisms/app-shell.css");
  assert.match(seoCss, /\.seo-hero\s*\{[\s\S]*?text-align:\s*left/);
  assert.match(seoCss, /\.seo-actions\s*\{[\s\S]*?justify-content:\s*center/);
  assert.match(seoCss, /\.marketplace-seo-intro\s*\{[^}]*display:\s*grid;[^}]*gap:\s*22px/);
  assert.match(seoCss, /@media \(max-width:\s*760px\)[\s\S]*?\.marketplace-seo-placement-top\s*\{[^}]*display:\s*none/);
  assert.match(seoCss, /\.marketplace-seo-placement-bottom \.marketplace-seo-intro\s*\{[^}]*margin-top:\s*22px/);
  assert.doesNotMatch(seoCss, /marketplace-seo-mobile-summary|marketplace-seo-content/);
  assert.match(seoCss, /\.seo-prose\s*>\s*h2,[\s\S]*?width:\s*min\(var\(--layout-prose\),\s*100%\);[\s\S]*?margin-inline:\s*0 auto/);
  assert.match(seoCss, /\.seo-marketplace-notice\s*>\s*strong,[\s\S]*?width:\s*min\(var\(--layout-prose\),\s*100%\);[\s\S]*?margin-inline:\s*0 auto/);
  assert.match(appShellCss, /\.policy-section\s*\{[\s\S]*?width:\s*min\(var\(--layout-prose\),\s*100%\);[\s\S]*?margin-inline:\s*0 auto/);
  assert.match(appShellCss, /\.profile-dropdown\s*\{[^}]*display:\s*flex/);
  assert.match(appShellCss, /\.customer-profile-dropdown\s*\{[^}]*display:\s*none/);
  assert.match(appShellCss, /\.nav-menu-section-guides,[\s\S]*?\.nav-menu-theme-dock\s*\{[^}]*display:\s*none/);
  for (const stylesheet of [
    source("src/styles/organisms/account-shell.css"),
    source("src/styles/pages/auth.css"),
    source("src/styles/pages/checkout-flow.css")
  ]) {
    assert.doesNotMatch(stylesheet, /max-width:\s*(?:1180|1200)px/);
  }
  assert.equal(existsSync(`${webRoot}/src/styles.css`), false);
});

test("public, customer, account, and admin entries import only their surface styles", () => {
  const commonCss = source("src/styles/entries/common.css");
  const publicCss = source("src/styles/entries/public.css");
  const customerCss = source("src/styles/entries/customer.css");
  const accountCss = source("src/styles/entries/account.css");
  const adminCss = source("src/styles/entries/admin.css");

  for (const entry of [commonCss, publicCss, customerCss, accountCss, adminCss]) {
    assert.doesNotMatch(entry, /styles\.css/);
  }
  assert.equal(commonCss.trimStart().startsWith('@import "../global.css";'), true);
  assert.equal(adminCss.trimStart().startsWith('@import "../global.css";'), true);
  assert.match(publicCss, /entries\/common\.css|\.\/common\.css/);
  assert.match(customerCss, /\.\/common\.css/);
  assert.match(customerCss, /\.\/account\.css/);

  assert.match(publicCss, /pages\/seo\.css/);
  assert.doesNotMatch(publicCss, /pages\/(auth|dashboard|checkout-flow|admin-console|admin-orders)\.css/);

  assert.match(accountCss, /pages\/(auth|post-gem|dashboard|checkout-flow)\.css/);
  assert.doesNotMatch(accountCss, /pages\/(seo|admin-console|admin-orders)\.css/);

  assert.match(adminCss, /pages\/(dashboard|admin-console|admin-orders)\.css/);
  assert.doesNotMatch(adminCss, /pages\/(seo|auth|post-gem|checkout-flow)\.css/);
});

test("each browser and SSR entry points to its dedicated CSS aggregator", () => {
  assert.match(source("src/main.tsx"), /styles\/entries\/customer\.css/);
  assert.match(source("src/admin-main.tsx"), /styles\/entries\/admin\.css/);
  assert.match(source("src/entry-client.tsx"), /styles\/entries\/public\.css/);
  assert.match(source("src/account-entry.tsx"), /styles\/entries\/account\.css/);
  assert.match(source("server/server.ts"), /\/src\/styles\/entries\/public\.css/);
});

test("card primitives distinguish static, interactive, media, metric, inset, and callout variants", () => {
  const cardsCss = source("src/styles/molecules/cards.css");

  for (const variant of ["surface", "interactive", "media", "metric", "inset", "callout"]) {
    assert.match(cardsCss, new RegExp(`\\.card--${variant}\\b`));
  }
  assert.match(cardsCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(cardsCss, /\.card--interactive:focus-visible/);
});

test("marketplace listing locations stay anchored at the bottom of each card", () => {
  const marketplaceCss = source("src/styles/pages/marketplace.css");

  assert.match(marketplaceCss, /\.listing-content\s*\{[\s\S]*?flex:\s*1;/);
  assert.match(marketplaceCss, /\.listing-card\s+\.seller-line\s*\{[\s\S]*?margin-top:\s*auto;/);
});
