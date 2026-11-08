import { inArray, sql } from "drizzle-orm";
import type { AdminCounts, AdminPage, AdminPageQuery } from "@gems/api-client";
import { db } from "./db/index.js";
import { listings, reports, paymentIntents, users, sellerProfiles } from "./db/schema.js";
import { populateListingSubscriptions, toListing, toReport, toSellerProfile } from "./marketplace-repository.js";
import { toPaymentIntent, toUser } from "./user-repository.js";

// Match the UI's classification, using the newest subscription deterministically.
const listingRecords = sql`select l.id, l.created_at,
  case when l.status = 'rejected' or l.moderation_status = 'rejected' then 'rejected'
    when l.status in ('expired','paused') or l.expires_at <= now() or s.status = 'expired' then 'archived'
    when l.status = 'live' and l.moderation_status = 'approved' and (s.id is null or s.status = 'active') then 'live'
    when l.moderation_status = 'queued' and s.status = 'active' then 'queued'
    when l.moderation_status = 'not_submitted' or s.id is null or s.status in ('pending_payment','past_due','cancelled') then 'unpaid'
    else 'other' end as bucket,
  concat_ws(' ', l.id, l.title, l.description, l.location, l.gem_type_id, l.attributes::text,
    u.name, u.email, u.phone, sp.business_name,
    (select string_agg(concat_ws(' ', p.id, p.stripe_invoice_id, p.status), ' ') from payment_intents p where p.listing_id = l.id)) as search,
  l.attributes->>'certificateStatus' = 'admin_verified' as checked
  from listings l
  left join lateral (select id, status from listing_subscriptions where listing_id = l.id order by created_at desc, id desc limit 1) s on true
  left join seller_profiles sp on sp.id = l.seller_id
  left join users u on u.id = sp.user_id`;

export async function getAdminCounts(): Promise<AdminCounts> {
  const rows = await db.execute(sql`with records as (select id, bucket, checked from (${listingRecords}) classified) select
    (select count(*) from records) as "listings",
    (select count(*) from records where bucket = 'live') as "live",
    (select count(*) from records where bucket = 'queued') as "queued",
    (select count(*) from records where bucket = 'unpaid') as "unpaid",
    (select count(*) from records where bucket = 'rejected') as "rejected",
    (select count(*) from records where bucket = 'archived') as "archived",
    (select count(*) from records where checked) as "checked",
    (select count(*) from reports where status <> 'resolved') as "reports",
    (select count(*) from users) as "users",
    (select count(*) from users where trial_terminated_at is null and trial_ends_at > now()) as "activeTrials",
    (select count(*) from users where trial_terminated_at is null and trial_ends_at <= now()) as "expiredTrials",
    (select count(*) from users where trial_terminated_at is not null) as "terminatedTrials",
    (select count(*) from payment_intents) as "payments",
    (select count(*) from payment_intents where status = 'succeeded') as "succeeded",
    (select count(*) from payment_intents where status = 'pending') as "pending",
    (select count(*) from payment_intents where status = 'failed') as "failed"`);
  return Object.fromEntries(Object.entries(rows[0]).map(([key, value]) => [key, Number(value)])) as unknown as AdminCounts;
}

export function parseAdminPageQuery(params: URLSearchParams): AdminPageQuery {
  const view = params.get("view") ?? "overview";
  if (!["overview", "moderation", "listings", "users", "payments"].includes(view)) throw new Error("Invalid admin section");
  const page = Number(params.get("page") ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error("Invalid page");
  const kind = params.get("kind");
  const id = params.get("id");
  if (kind && !["listing", "report", "subscription"].includes(kind)) throw new Error("Invalid record type");
  return { view: view as AdminPageQuery["view"], page, search: (params.get("search") ?? "").trim().slice(0, 200),
    ...(kind && id ? { target: { kind: kind as "listing" | "report" | "subscription", id } } : {}) };
}

export async function getAdminPage(query: AdminPageQuery): Promise<AdminPage> {
  const counts = await getAdminCounts();
  const snapshot = { listings: [], liveListings: [], reportedListings: [], reports: [], users: [], sellers: [], orders: [], payments: [] } as AdminPage["snapshot"];
  if (query.view === "overview" && !query.target) return { snapshot, counts, page: 1, total: 0, pageSize: 50, view: "overview" };
  const target = query.target;
  let view = query.view;
  let source;
  if (target?.kind === "listing" || view === "listings" || view === "moderation") {
    source = sql`with records as (${listingRecords}) select id, 'listing' as kind, created_at, bucket, search from records`;
    if (target?.kind === "listing") source = sql`${source} where id = ${target.id}`;
    else if (view === "moderation") source = sql`${source} where bucket in ('queued','unpaid') union all
      select r.id, 'report', r.created_at, 'report', concat_ws(' ', r.id, r.reason, r.notes, u.name, u.email, l.title, l.id)
      from reports r left join users u on u.id = r.reporter_id left join listings l on l.id = r.listing_id where r.status <> 'resolved'`;
    else source = sql`${source} where bucket not in ('queued','unpaid')`;
  }
  if (target?.kind === "report") source = sql`select id, 'report' as kind, created_at, 'report' as bucket, '' as search from reports where id = ${target.id}`;
  if (view === "users" && !target) source = sql`select id, 'user' as kind, created_at, 'user' as bucket, concat_ws(' ',id,name,email,phone) as search from users`;
  if (target?.kind === "subscription" || (view === "payments" && !target)) {
    source = sql`select p.id, 'payment' as kind, p.created_at, 'payment' as bucket,
      concat_ws(' ', p.id,p.subscription_id,p.stripe_invoice_id,p.status,u.name,u.email,l.title,l.id) as search
      from payment_intents p left join users u on u.id=p.user_id left join listings l on l.id=p.listing_id`;
    if (target) source = sql`${source} where p.subscription_id = ${target.id}`;
  }
  if (!source) throw new Error("Invalid admin query");
  const search = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
  const filtered = sql`select * from (${source}) records where search ilike ${target ? '%' : search}`;
  const totalRows = await db.execute(sql`select count(*) as total from (${filtered}) matched`);
  const total = Number(totalRows[0].total);
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / 50)));
  const selected = await db.execute(sql`${filtered} order by created_at desc, kind, id desc limit 50 offset ${(page - 1) * 50}`);
  if (target?.kind === "listing" && selected[0]) view = ["queued", "unpaid"].includes(String(selected[0].bucket)) ? "moderation" : "listings";
  if (target?.kind === "report") view = "moderation";
  if (target?.kind === "subscription") view = "payments";
  const ids = (kind: string) => selected.filter(row => row.kind === kind).map(row => String(row.id));
  const reportIds = ids("report"), paymentIds = ids("payment");
  const reportRows = reportIds.length ? await db.select().from(reports).where(inArray(reports.id, reportIds)) : [];
  const paymentRows = paymentIds.length ? await db.select().from(paymentIntents).where(inArray(paymentIntents.id, paymentIds)) : [];
  const primaryListingIds = ids("listing");
  const listingIds = [...new Set([...primaryListingIds, ...reportRows.map(r => r.listingId), ...paymentRows.map(p => p.listingId)].filter((id): id is string => Boolean(id)))];
  const listingRows = listingIds.length ? await db.select().from(listings).where(inArray(listings.id, listingIds)) : [];
  const hydrated = await populateListingSubscriptions(listingRows.map(toListing));
  const sellerIds = [...new Set(listingRows.map(row => row.sellerId))];
  const sellerRows = sellerIds.length ? await db.select().from(sellerProfiles).where(inArray(sellerProfiles.id, sellerIds)) : [];
  const userIds = [...new Set([...ids("user"), ...sellerRows.map(row => row.userId), ...paymentRows.map(row => row.userId), ...reportRows.map(row => row.reporterId)].filter((id): id is string => Boolean(id)))];
  const userRows = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
  const relatedPayments = primaryListingIds.length ? await db.select().from(paymentIntents).where(inArray(paymentIntents.listingId, primaryListingIds)).orderBy(sql`${paymentIntents.createdAt} desc`, sql`${paymentIntents.id} desc`) : [];
  const rank = new Map(selected.map((row, index) => [String(row.id), index]));
  const ordered = <T extends { id: string }>(rows: T[]) => rows.sort((a,b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
  snapshot.listings = ordered(hydrated.filter(row => view === "payments" || primaryListingIds.includes(row.id)));
  snapshot.reportedListings = hydrated.filter(row => reportRows.some(report => report.listingId === row.id));
  snapshot.reports = ordered(reportRows.map(toReport));
  snapshot.payments = ordered([...paymentRows, ...relatedPayments].filter((row,index,all) => all.findIndex(p => p.id === row.id) === index).map(toPaymentIntent));
  snapshot.sellers = sellerRows.map(toSellerProfile);
  snapshot.users = ordered(userRows.map(toUser));
  return { snapshot, counts, page, total, pageSize: 50, view };
}
