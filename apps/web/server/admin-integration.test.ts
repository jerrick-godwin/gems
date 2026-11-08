import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = process.env.GEMS_TEST_DATABASE_URL;
test('admin and payment PostgreSQL integration', { skip: !testUrl }, async t => {
  const url = new URL(testUrl!);
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname) && url.pathname.endsWith('_test'), 'Use an isolated localhost *_test database');
  process.env.DATABASE_URL = testUrl;
  process.env.RESEND_API_KEY = '';
  process.env.STRIPE_SECRET_KEY = '';
  process.env.AZURE_STORAGE_CONNECTION_STRING = '';
  process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT = '{}';
  process.env.FIREBASE_SERVICE_ACCOUNT = '{}';
  const { databaseClient: sql, withDatabaseTransaction } = await import('./db/index.js');
  const admin = await import('./admin-data.js');
  const market = await import('./marketplace-repository.js');
  const user = await import('./user-repository.js');
  const { quoteListingSubscription } = await import('@gems/schemas');
  const plan = {id:'int-plan',name:'Test Plan',priceLkr:1000,includedPhotos:3,extraPhotoPriceLkr:100,validityMonths:1,eyebrow:'Test',summary:'Test'};
  try {
    await sql`truncate users, seller_profiles, listings, subscription_plans cascade`;
    await sql`insert into subscription_plans (id,name,price_lkr,included_photos,extra_photo_price_lkr,validity_months,eyebrow,summary) values (${plan.id},${plan.name},1000,3,100,1,'Test','Test')`;
    await sql`insert into users (id,firebase_uid,name,email,phone,trial_started_at,trial_ends_at) select 'int-user-'||n, 'int-user-'||n, 'Test User '||n, 'test'||n||'@example.invalid','test-'||n,now(),now()+interval '14 days' from generate_series(1,120) n`;
    await sql`insert into seller_profiles(id,user_id,display_name,shop_slug,member_since,location) values ('int-seller','int-user-1','Test Seller','int-seller','2026','Colombo')`;
    const [gem] = await sql`select id from gem_types limit 1`;
    await sql`insert into listings(id,seller_id,gem_type_id,title,description,price_lkr,location,status,moderation_status,attributes,media,stats)
      select 'int-listing-'||n,'int-seller',${gem.id},'Test Gem '||n,'Fixture',1000,'Colombo','pending_review','queued',${JSON.stringify({carat:1,certificateStatus:'none'})}::jsonb,'[]','{}' from generate_series(1,120) n`;
    await sql`insert into listing_subscriptions(id,user_id,listing_id,plan_id,status,source,expires_at,payment_intent_id)
      select 'int-sub-'||n,'int-user-1','int-listing-'||n,${plan.id},'active','paid',now()+interval '30 days','int-pay-'||n from generate_series(1,120) n`;
    await sql`insert into payment_intents(id,user_id,listing_id,subscription_id,purpose,status,plan_id,quote,amount_lkr,gateway,policy_version,policy_accepted_at)
      select 'int-pay-'||n,'int-user-1','int-listing-'||n,'int-sub-'||n,'listing_subscription','succeeded',${plan.id},${JSON.stringify(quoteListingSubscription(plan,1))}::jsonb,1000,'stripe','test',now() from generate_series(1,120) n`;
    await t.test('overview counts and stable 50-record pages with related data', async () => {
      const counts = await admin.getAdminCounts(); assert.equal(counts.users,120); assert.equal(counts.queued,120);
      const a=await admin.getAdminPage({view:'moderation',page:1,search:''}), b=await admin.getAdminPage({view:'moderation',page:2,search:''});
      assert.equal(a.snapshot.listings.length,50); assert.equal(a.total,120); assert.equal(b.snapshot.listings.length,50);
      assert.equal(new Set([...a.snapshot.listings,...b.snapshot.listings].map(l=>l.id)).size,100);
      assert.equal(a.snapshot.users.length,1); assert.equal(a.snapshot.orders.length,0);
      assert.equal((await admin.getAdminPage({view:'users',page:1,search:'test120@example.invalid'})).snapshot.users[0].id,'int-user-120');
      assert.equal((await admin.getAdminPage({view:'listings',page:1,search:'',target:{kind:'listing',id:'int-listing-1'}})).view,'moderation');
      assert.equal((await admin.getAdminPage({view:'users',page:1,search:'%'})).total,0);
    });
    await t.test("account, upload, draft and receipt boundaries separate two sellers", async () => {
      const claims = { uid: "int-user-1", email: "test1@example.invalid", name: "Test User", emailVerified: true };
      assert.equal((await user.getOrCreateUserFromClaims(claims)).id, "int-user-1");
      await assert.rejects(user.getOrCreateUserFromClaims({ ...claims, uid: "another-firebase-uid" }), /Account identity/);
      assert.equal(await user.createStorageUpload("int-user-2", { scope: "listing-media", listingId: "int-listing-1", fileName: "stone.png", contentType: "image/png" }), undefined);
      assert.equal(await user.getPaymentReceipt("int-user-2", "int-pay-1"), undefined);
      assert.equal(await user.getAdminPaymentReceipt("int-pay-1").then(Boolean), true);
      await assert.rejects(user.updateUserListing("int-user-1", "int-listing-1", {
        media: [{ id: "users/int-user-2/listings/other/media/private.png", kind: "photo", listingId: "int-listing-1", url: "", alt: "", order: 0, moderationStatus: "not_submitted" }]
      }), /Invalid listing media/);
      const token = "integration-claimed-draft";
      const { createHash } = await import("node:crypto");
      await sql`insert into listing_checkout_sessions (id, token_hash, draft, media, status, claimed_user_id, expires_at)
        values ('int-draft', ${createHash("sha256").update(token).digest("hex")}, '{}'::jsonb, '[]'::jsonb, 'claimed', 'int-user-1', now()+interval '1 hour')`;
      assert.equal(await user.getListingCheckoutSession(token), undefined);
      assert.equal(await user.updateListingCheckoutSession(token, {}, "int-user-2"), undefined);
      assert.equal((await user.getListingCheckoutSession(token, "int-user-1"))?.status, "claimed");
      await sql`update listing_checkout_sessions set status='used', payment_intent_id='int-pay-1' where id='int-draft'`;
      assert.equal(await user.completeListingCheckoutSession("int-user-2", token, {}), undefined);
      const resumed = await user.completeListingCheckoutSession("int-user-1", token, {});
      assert.equal(resumed?.mode === "payment" && resumed.paymentIntent.id, "int-pay-1");

      const photos = Array.from({ length: 4 }, (_, order) => ({
        id: `old-photo-${order}`, listingId: "int-listing-1", kind: "photo" as const,
        url: "/assets/sapphire.png", alt: "fixture", order, moderationStatus: "approved" as const, thumbnailKey: "fixture"
      }));
      await sql`update listings set media=${JSON.stringify(photos)}::jsonb where id='int-listing-1'`;
      await assert.rejects(user.updateUserListing("int-user-1", "int-listing-1", { media: photos }), /payment covers fewer photos/);
      await sql`update listings set media='[]'::jsonb where id='int-listing-1'`;

    });
    await t.test("password reset reservations serialize across database connections", async () => {
      const { reservePasswordReset } = await import("./password-reset-limit.js");
      const email = `reset-${Date.now()}@example.invalid`;
      const accepted = await Promise.all(Array.from({ length: 8 }, () => reservePasswordReset(email)));
      assert.equal(accepted.filter(Boolean).length, 1);
    });
    await t.test('approve, pause and resume persist and change public visibility', async () => {
      await market.updateListingModeration('int-listing-1','approve');
      assert.equal((await market.getPublicListing('int-listing-1'))?.listing.status,'live');
      await market.updateListingStatus('int-listing-1','paused');
      assert.equal(await market.getPublicListing('int-listing-1'),undefined);
      await market.updateListingStatus('int-listing-1','live');
      assert.equal((await market.getPublicListing('int-listing-1'))?.listing.status,'live');
    });
    await t.test('reject requires reason and persists with renewal disabled', async () => {
      await assert.rejects(market.updateListingModeration('int-listing-2','reject',''));
      await market.updateListingModeration('int-listing-2','reject','Certificate mismatch');
      const [row]=await sql`select status,rejection_reason from listings where id='int-listing-2'`;
      assert.equal(row.status,'rejected'); assert.equal(row.rejection_reason,'Certificate mismatch');
      const [sub]=await sql`select auto_renew from listing_subscriptions where id='int-sub-2'`;assert.equal(sub.auto_renew,false);
    });
    await t.test('all promotion types create and transitions persist', async () => {
      for (const type of ['featured','top','urgent','bump'] as const) {
        const startsAt=new Date(Date.now()-1000).toISOString(), endsAt=new Date(Date.now()+86400000).toISOString();
        await market.createPromotionCampaign('int-listing-1',{id:`int-${type}`,type,status:'active',startsAt,endsAt});
        assert.ok((await market.getPublicListing('int-listing-1'))?.listing.promoted.includes(type));
        await market.updatePromotionCampaign('int-listing-1',`int-${type}`,{status:'paused'});
        assert.ok(!(await market.getPublicListing('int-listing-1'))?.listing.promoted.includes(type));
        await market.updatePromotionCampaign('int-listing-1',`int-${type}`,{status:'active',endsAt:new Date(Date.now()+8*86400000).toISOString()});
        await market.updatePromotionCampaign('int-listing-1',`int-${type}`,{status:'stopped'});
      }
      assert.equal((await market.getListing('int-listing-1'))?.campaigns?.length,4);
    });
    await t.test('report resolution and removal retain financial history', async () => {
      await sql`insert into reports(id,listing_id,reporter_id,reason,status) values ('int-report','int-listing-3','int-user-1','Test','open')`;
      await market.resolveReport('int-report');
      await market.removeListing('int-listing-3');
      assert.equal(await market.getListing('int-listing-3'),undefined);
      const [report]=await sql`select status,listing_id from reports where id='int-report'`; assert.equal(report.status,'resolved');assert.equal(report.listing_id,null);
      assert.equal((await user.getPaymentIntent('int-pay-3'))?.status,'succeeded');
    });
    await t.test('individual and sitewide trials update and reject backwards extensions', async () => {
      const end=new Date(Date.now()+40*86400000);
      await user.extendUserTrial('int-user-1',end);
      await assert.rejects(user.extendUserTrial('int-user-1',new Date(Date.now()+30*86400000)));
      await user.extendSitewideTrial(new Date(Date.now()+35*86400000));
      const [row]=await sql`select trial_ends_at at time zone 'UTC' as trial_ends_at from users where id='int-user-1'`;assert.equal(new Date(row.trial_ends_at).getTime(),end.getTime());
      await user.terminateUserTrial('int-user-2');
      await user.terminateSitewideTrial();
      assert.equal((await admin.getAdminCounts()).terminatedTrials,120);
    });
    await t.test('concurrent payment confirmations activate once and never downgrade success', async () => {
      await sql`update payment_intents set status='pending' where id='int-pay-4'`;
      await sql`update listing_subscriptions set status='pending_payment' where id='int-sub-4'`;
      await Promise.all([user.confirmPaymentIntent('int-pay-4','succeeded'),user.confirmPaymentIntent('int-pay-4','succeeded')]);
      await user.confirmPaymentIntent('int-pay-4','failed');
      assert.equal((await user.getPaymentIntent('int-pay-4'))?.status,'succeeded');
      const [sub]=await sql`select status from listing_subscriptions where id='int-sub-4'`;assert.equal(sub.status,'active');
    });
    await t.test('activation rollback keeps payment retryable', async () => {
      await sql`update payment_intents set status='pending' where id='int-pay-5'`;
      await assert.rejects(withDatabaseTransaction(async()=>{await user.confirmPaymentIntent('int-pay-5','succeeded');throw new Error('Injected failure');}));
      assert.equal((await user.getPaymentIntent('int-pay-5'))?.status,'pending');
      await user.confirmPaymentIntent('int-pay-5','succeeded');assert.equal((await user.getPaymentIntent('int-pay-5'))?.status,'succeeded');
    });
    await t.test('duplicate and rolled back renewal events do not lose or repeat extension', async () => {
      await sql`update payment_intents set stripe_subscription_id='sub_int' where id='int-pay-6'`;
      const input={stripeSubscriptionId:'sub_int',stripeInvoiceId:'in_int',billingReason:'subscription_cycle'};
      const [before]=await sql`select expires_at from listing_subscriptions where id='int-sub-6'`;
      await assert.rejects(withDatabaseTransaction(async()=>{await user.recordStripeSubscriptionInvoicePayment(input);throw new Error('Injected failure');}));
      assert.equal((await sql`select id from renewal_events where id='in_int:paid'`).length,0);
      await Promise.all([user.recordStripeSubscriptionInvoicePayment(input),user.recordStripeSubscriptionInvoicePayment(input)]);
      const [after]=await sql`select expires_at from listing_subscriptions where id='int-sub-6'`;
      const expected=new Date(before.expires_at);expected.setMonth(expected.getMonth()+1);
      assert.equal(new Date(after.expires_at).getTime(),expected.getTime());
      assert.equal((await sql`select id from renewal_events where id='in_int:paid'`).length,1);
      await user.markStripeSubscriptionPastDue("sub_int", "in_int");
      assert.equal((await sql`select status from listing_subscriptions where id='int-sub-6'`)[0].status, "active");
      await user.markStripeSubscriptionPastDue("sub_int", "in_next");
      assert.equal((await sql`select status from listing_subscriptions where id='int-sub-6'`)[0].status, "past_due");
    });
  } finally { await sql.end(); }
});
