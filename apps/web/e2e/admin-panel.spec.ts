import { test, expect, type Page } from '@playwright/test';
// Run only against admin-test-server.ts and its disposable database.
test.skip(!process.env.GEMS_ADMIN_TEST_SERVER, 'Requires the isolated admin integration harness');
test.describe.configure({mode:'serial'});
async function login(page:Page) {
  await page.goto('/admin');
  await page.getByLabel('Email address').fill('admin@example.invalid');
  await page.getByLabel('Password',{exact:true}).fill('test-password');
  await page.getByRole('button',{name:'Sign in to console'}).click();
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
}
const section=(page:Page,name:string)=>page.getByRole('navigation',{name:'Admin sections'}).getByRole('button',{name:new RegExp(name)});
test.beforeEach(async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1' ? route.continue() : route.abort());
});
test('login validation, overview bootstrap, navigation, history and logout',async({page})=>{
  const requests:string[]=[];
  page.on('request',request=>{if(request.url().includes('/api/'))requests.push(request.url());});
  await page.goto('/admin');
  await page.getByLabel('Email address').fill('admin@example.invalid');await page.getByLabel('Password',{exact:true}).fill('wrong');
  await page.getByRole('button',{name:'Sign in to console'}).click();await expect(page.getByText('Invalid credentials')).toBeVisible();
  await page.getByLabel('Password',{exact:true}).fill('test-password');await page.getByRole('button',{name:'Sign in to console'}).click();
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  expect(requests.filter(url=>url.includes('/admin/bootstrap')).length).toBe(1);
  expect(requests.some(url=>url.includes('/admin/snapshot')||url.includes('/admin/orders')||url.includes('/admin/page'))).toBe(false);
  for(const [label,title] of [['Moderation','Moderation'],['Listings','Listings'],['Users & trials','Users & trials'],['Payments','Payments']]) {
    await section(page,label).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  }
  await page.goBack();await expect(page.getByRole('heading',{name:'Users & trials',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Users & trials',exact:true})).toBeVisible();
  await section(page,'Sign Out').click();await expect(page.getByRole('heading',{name:'Admin Sign In'})).toBeVisible();
});
test('search, pagination, empty state and deep links',async({page})=>{
  await login(page);await section(page,'Users & trials').click();
  await expect(page.locator('.admin-trial-row')).toHaveCount(50);
  const first=await page.locator('.admin-trial-row').first().innerText();
  await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('.admin-trial-row').first()).not.toHaveText(first);
  await page.getByRole('searchbox',{name:'Search this section'}).fill('test120@example.invalid');
  await expect(page.locator('.admin-trial-row')).toHaveCount(1);
  await page.getByRole('searchbox',{name:'Search this section'}).fill('no-such-record');await expect(page.locator('.admin-trial-row')).toHaveCount(0);
  await page.goto('/admin/listings/int-listing-20');await expect(page.getByRole('heading',{name:'Moderation',exact:true})).toBeVisible();
  await expect(page.locator('.admin-record-highlight')).toContainText('Test Gem 20');
  await page.goto('/admin/listings/missing');await expect(page.getByRole('alert')).toContainText('unavailable');
});
test('moderation approval persists after reload',async({page})=>{
  await login(page);await page.goto('/admin/listings/int-listing-20');
  const row=page.locator('.review-row');await row.getByRole('button',{name:/Approve/}).click();
  const [approval] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "PATCH" && response.url().endsWith("/admin/moderation/listings/int-listing-20")),
    page.getByRole("dialog", { name: "Approve Listing" }).getByRole("button", { name: "Confirm Approval" }).click()
  ]);
  expect(approval.ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Listings", exact: true })).toBeVisible();
  await expect(page.locator(".active-listing-row")).toContainText("Test Gem 20");
});
test('section failure is retryable without clearing session',async({page})=>{
  await login(page);
  await page.route('**/api/v1/admin/page?**',route=>route.fulfill({status:503,json:{error:'Fixture outage'}}));
  await section(page,'Payments').click();await expect(page.getByRole('alert')).toContainText('Unable to load admin section');
  await page.unroute('**/api/v1/admin/page?**');await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Payments',exact:true})).toBeVisible();
});
test('mobile menu navigates and closes',async({page})=>{
  await page.setViewportSize({width:390,height:844});await login(page);
  await page.getByRole('button',{name:'Open navigation menu'}).click();
  await page.getByRole('navigation',{name:'Primary'}).getByRole('button',{name:/Payments/}).click();
  await expect(page.getByRole('heading',{name:'Payments',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Open navigation menu'})).toBeVisible();
});
